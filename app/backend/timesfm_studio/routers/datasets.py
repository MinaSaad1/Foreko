"""Dataset upload / preview / series extraction endpoints."""

from __future__ import annotations

import datetime
import json as json_module
import logging
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from ..deps import get_settings
from ..schemas.dataset import ColumnMapping, DatasetPreview, DatasetSummary, SeriesExtraction
from ..services import connection_store, dataset_store
from ..services import secrets as secrets_service
from ..services.loaders import loader_for_extension
from ..services.loaders._file_common import build_column_infos, build_first_rows
from ..services.series import _infer_column_dtype, build_extraction
from ..settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])


_SUPPORTED_EXTENSIONS = (".csv", ".xlsx", ".xls", ".parquet", ".json", ".jsonl", ".ndjson")


@router.post("/upload", response_model=DatasetPreview)
async def upload(
    file: UploadFile = File(...),
    sheet: str | None = Query(
        default=None, description="Excel sheet name (optional; defaults to first sheet)."
    ),
    json_path: str | None = Query(
        default=None,
        description="For JSON uploads only: dotted path to the records array, e.g. 'data.items'.",
    ),
    settings: Settings = Depends(get_settings),
) -> DatasetPreview:
    filename = file.filename or "upload"
    ext = _extension_of(filename)
    if ext not in _SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{ext or 'unknown'}'. Supported: "
                + ", ".join(_SUPPORTED_EXTENSIONS)
            ),
        )
    loader = loader_for_extension(ext)
    if loader is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"No loader registered for '{ext}'.",
        )
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.max_upload_bytes} bytes.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file."
        )

    source_spec: dict[str, object] = {}
    if sheet is not None:
        source_spec["sheet"] = sheet
    if json_path is not None:
        source_spec["json_path"] = json_path

    try:
        return loader.ingest(
            filename=filename,
            raw_bytes=content,
            source_spec=source_spec,
            datasets_dir=settings.datasets_dir,
        )
    except ValueError as exc:
        # User-facing validation errors (bad shape, too few rows, etc.)
        logger.info("Upload validation failed for %s: %s", filename, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Ingest failed for %s", filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse file: {exc}",
        ) from exc


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
def preview(
    dataset_id: str, settings: Settings = Depends(get_settings)
) -> DatasetPreview:
    try:
        df = dataset_store.load_dataset(dataset_id, settings.datasets_dir)
        meta = dataset_store.read_meta(settings.datasets_dir / dataset_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    columns = []
    for name in df.columns:
        col = df[name]
        columns.append(
            {
                "name": str(name),
                "dtype": _infer_column_dtype(col),
                "example_values": [str(v) for v in col.dropna().head(5).tolist()],
                "null_fraction": round(float(col.isna().mean()) if len(col) else 0.0, 4),
            }
        )
    first_rows = df.head(50).where(df.notna(), None).to_dict(orient="records")
    return DatasetPreview(
        id=dataset_id,
        filename=meta.get("filename", f"{dataset_id}"),
        columns=columns,  # type: ignore[arg-type]
        row_count=int(len(df)),
        first_rows=first_rows,
    )


@router.get("", response_model=list[DatasetSummary])
def list_datasets(settings: Settings = Depends(get_settings)) -> list[DatasetSummary]:
    results: list[DatasetSummary] = []
    for meta_file in settings.datasets_dir.glob("*/meta.json"):
        try:
            meta = json_module.loads(meta_file.read_text(encoding="utf-8"))
            results.append(DatasetSummary(
                id=meta.get("id", meta_file.parent.name),
                filename=meta.get("filename", "unknown"),
                row_count=meta.get("row_count", 0),
                uploaded_at=meta.get("uploaded_at", ""),
                size_bytes=_dataset_size_bytes(meta_file.parent),
            ))
        except Exception:
            pass
    results.sort(key=lambda d: d.uploaded_at, reverse=True)
    return results


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, settings: Settings = Depends(get_settings)) -> None:
    dataset_dir = settings.datasets_dir / dataset_id
    if not dataset_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
    shutil.rmtree(dataset_dir)


@router.post("/{dataset_id}/refresh", response_model=DatasetPreview)
def refresh(
    dataset_id: str, settings: Settings = Depends(get_settings)
) -> DatasetPreview:
    """Re-run the saved SQL query that produced this dataset.

    Only valid for SQL-backed datasets (kind == "sql"). The new snapshot is
    materialized into a temporary directory first and then atomically renamed
    over the existing parquet, so a failed refresh leaves the previous snapshot
    intact.
    """

    from ..services.loaders.sql import build_engine, materialize

    dataset_dir = settings.datasets_dir / dataset_id
    if not dataset_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found."
        )
    try:
        meta = dataset_store.read_meta(dataset_dir)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc

    if meta.get("kind") != "sql":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Refresh is only supported for SQL-backed datasets. "
                f"This dataset is kind={meta.get('kind', 'unknown')!r}."
            ),
        )

    source = meta.get("source") or {}
    connection_id = source.get("connection_id")
    sql = source.get("sql")
    if not connection_id or not sql:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset metadata is missing the saved connection_id or sql.",
        )

    try:
        connection = connection_store.get_connection(
            settings.connections_path, connection_id
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Connection {connection_id} no longer exists. Re-create it "
                "before refreshing this dataset."
            ),
        ) from exc

    try:
        password = connection_store.resolve_password(connection)
    except secrets_service.KeyringUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    engine = build_engine(connection, password)
    try:
        with tempfile.TemporaryDirectory(dir=dataset_dir) as staging_dir:
            staging = Path(staging_dir)
            try:
                df = materialize(
                    engine=engine,
                    sql=sql,
                    dataset_dir=staging,
                    max_rows=settings.max_sql_rows,
                    chunk_size=int(source.get("chunk_size") or 50_000),
                    dialect=connection.dialect,
                )
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(exc),
                ) from exc
            except Exception as exc:
                logger.exception("Refresh query failed for %s", dataset_id)
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Refresh failed: {exc}",
                ) from exc
            shutil.move(
                str(staging / "data.parquet"),
                str(dataset_dir / "data.parquet"),
            )
    finally:
        try:
            engine.dispose()
        except Exception:  # pragma: no cover - defensive
            pass

    meta["row_count"] = int(len(df))
    source["fetched_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    meta["source"] = source
    dataset_store.write_meta(dataset_dir, meta)

    return DatasetPreview(
        id=dataset_id,
        filename=meta.get("filename", dataset_id),
        columns=build_column_infos(df),
        row_count=int(len(df)),
        first_rows=build_first_rows(df),
    )


@router.post("/{dataset_id}/series", response_model=SeriesExtraction)
def series(
    dataset_id: str,
    mapping: ColumnMapping,
    settings: Settings = Depends(get_settings),
) -> SeriesExtraction:
    try:
        df = dataset_store.load_dataset(dataset_id, settings.datasets_dir)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    try:
        return build_extraction(dataset_id, df, mapping)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


def _extension_of(filename: str) -> str:
    """Return the lowercased extension including the leading dot, or ''
    when the filename has no recognized suffix. Handles double extensions like
    .tar.gz by using only the final suffix (we do not need .tar.gz here)."""

    _, ext = os.path.splitext(filename.lower())
    return ext


def _dataset_size_bytes(dataset_dir) -> int:
    """Sum the sizes of the main data artifacts in a dataset dir. Returns 0 if
    nothing recognizable is present (keeps legacy datasets reporting correctly)."""

    total = 0
    for candidate in ("raw.csv", "raw.parquet", "raw.xlsx", "raw.xls",
                      "raw.json", "raw.jsonl", "raw.ndjson", "data.parquet"):
        p = dataset_dir / candidate
        if p.exists():
            total += int(p.stat().st_size)
    return total
