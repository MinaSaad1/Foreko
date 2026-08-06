"""Saved database connection management.

All routes live under ``/api/datasets/connections`` so existing dataset URLs
stay stable and the frontend can keep everything under one router prefix.

Every route is a no-op when the OS keyring is unavailable and a password was
supplied - we surface a structured 503 with a recovery hint rather than
writing plaintext credentials to disk.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..deps import get_settings
from ..schemas.connection import (
    Connection,
    ConnectionCreate,
    ConnectionTestRequest,
    ConnectionTestResult,
    IngestRequest,
    QueryRequest,
    SecretsBackendInfo,
    TableInfo,
)
from ..schemas.dataset import DatasetPreview
from ..services import connection_store
from ..services import secrets as secrets_service
from ..settings import Settings

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/datasets/connections", tags=["connections"])


@router.get("/secrets-backend", response_model=SecretsBackendInfo)
def secrets_backend() -> SecretsBackendInfo:
    """Let the frontend show a warning when the keyring is unavailable."""

    return SecretsBackendInfo(
        available=secrets_service.is_available(),
        backend=secrets_service.active_backend_name(),
    )


@router.get("", response_model=list[Connection])
def list_connections(settings: Settings = Depends(get_settings)) -> list[Connection]:
    return connection_store.list_connections(settings.connections_path)


@router.post("", response_model=Connection, status_code=status.HTTP_201_CREATED)
def create_connection(
    payload: ConnectionCreate,
    settings: Settings = Depends(get_settings),
) -> Connection:
    try:
        return connection_store.create_connection(settings.connections_path, payload)
    except secrets_service.KeyringUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: str,
    settings: Settings = Depends(get_settings),
) -> None:
    try:
        connection_store.delete_connection(settings.connections_path, connection_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@router.post("/test", response_model=ConnectionTestResult)
def test_connection(
    payload: ConnectionTestRequest,
    settings: Settings = Depends(get_settings),
) -> ConnectionTestResult:
    from ..services.loaders.sql import test_connection as run_test

    if payload.connection_id is None and payload.draft is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either connection_id or draft.",
        )

    if payload.connection_id is not None:
        try:
            connection = connection_store.get_connection(
                settings.connections_path, payload.connection_id
            )
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
            ) from exc
        try:
            password = connection_store.resolve_password(connection)
        except secrets_service.KeyringUnavailable as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
    else:
        assert payload.draft is not None
        # Tests on drafts use the in-memory password only; we never persist.
        draft = payload.draft
        connection = Connection(
            id="draft",
            name=draft.name,
            dialect=draft.dialect,
            host=draft.host,
            port=draft.port,
            database=draft.database,
            username=draft.username,
            options=draft.options,
            created_at="1970-01-01T00:00:00Z",
        )
        password = draft.password

    result = run_test(connection, password)
    return ConnectionTestResult(**result)


@router.get("/{connection_id}/tables", response_model=list[TableInfo])
def list_tables(
    connection_id: str,
    db_schema: str | None = Query(default=None, alias="schema"),
    settings: Settings = Depends(get_settings),
) -> list[TableInfo]:
    from ..services.loaders.sql import build_engine, list_tables as sql_list_tables

    connection, password = _resolve(settings, connection_id)
    engine = build_engine(connection, password)
    try:
        return sql_list_tables(engine, schema=db_schema)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not list tables: {exc}",
        ) from exc
    finally:
        try:
            engine.dispose()
        except Exception:  # pragma: no cover - defensive
            pass


@router.post("/{connection_id}/preview", response_model=DatasetPreview)
def preview_query(
    connection_id: str,
    payload: QueryRequest,
    settings: Settings = Depends(get_settings),
) -> DatasetPreview:
    """Return the first N rows for the given SQL, without persisting anything."""

    from ..services.loaders.sql import build_engine, preview_query as run_preview
    from ..services.loaders._file_common import (
        build_column_infos,
        build_first_rows,
    )

    connection, password = _resolve(settings, connection_id)
    engine = build_engine(connection, password)
    try:
        df = run_preview(
            engine, payload.sql, limit=payload.limit or 100, dialect=connection.dialect
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Query failed: {exc}",
        ) from exc
    finally:
        try:
            engine.dispose()
        except Exception:  # pragma: no cover - defensive
            pass

    return DatasetPreview(
        id="preview",  # ephemeral; no dataset was created
        filename=f"{connection.name} preview",
        columns=build_column_infos(df),
        row_count=int(len(df)),
        first_rows=build_first_rows(df),
    )


@router.post("/{connection_id}/ingest", response_model=DatasetPreview)
def ingest_query(
    connection_id: str,
    payload: IngestRequest,
    settings: Settings = Depends(get_settings),
) -> DatasetPreview:
    """Materialize a query into a new dataset and return the usual preview."""

    from ..services.loaders import get_loader

    connection, password = _resolve(settings, connection_id)
    loader = get_loader("sql")
    display_name = payload.name or f"{connection.name}: query"
    try:
        return loader.ingest(
            filename=display_name,
            raw_bytes=None,
            source_spec={
                "connection": connection,
                "password": password,
                "sql": payload.sql,
                "max_rows": settings.max_sql_rows,
            },
            datasets_dir=settings.datasets_dir,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except Exception as exc:
        logger.exception("SQL ingest failed for %s", connection_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Ingest failed: {exc}",
        ) from exc


def _resolve(
    settings: Settings, connection_id: str
) -> tuple[Connection, str | None]:
    """Look up a saved connection + its keyring password, translating errors."""

    try:
        connection = connection_store.get_connection(
            settings.connections_path, connection_id
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    try:
        password = connection_store.resolve_password(connection)
    except secrets_service.KeyringUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return connection, password


__all__ = ["router"]
