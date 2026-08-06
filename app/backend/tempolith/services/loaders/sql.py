"""SQL loader: PostgreSQL, MySQL, SQLite, SQL Server via SQLAlchemy.

One class, four dialects. We build a SQLAlchemy URL per record and use
``pandas.read_sql_query`` with chunking to stream results into a parquet
snapshot under ``{dataset_id}/data.parquet``. Forecasts read the snapshot,
not the live DB — that avoids data drift mid-forecast. A separate
``POST /datasets/{id}/refresh`` re-runs the saved query when the user wants
fresh data.

Design notes:

- `pool_pre_ping=True` on every engine so dead connections are detected, not
  reused silently.
- Connection timeout kept short (5s) so bad credentials fail fast.
- List-tables uses cheap dialect-specific row estimates (pg_class.reltuples,
  information_schema.tables, sys.dm_db_partition_stats). No COUNT(*).
- Hard row cap (settings.max_sql_rows) prevents accidental 100M-row pulls.
"""

from __future__ import annotations

import datetime
import json
import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, ClassVar
from urllib.parse import quote_plus

import pandas as pd

from ...schemas.connection import Connection, Dialect, TableInfo
from ...schemas.dataset import DatasetPreview
from . import register
from ._file_common import (
    build_column_infos,
    build_first_rows,
    validate_forecastable,
)

logger = logging.getLogger(__name__)


# Dialects that use LIMIT N for row caps. MSSQL uses TOP N and is handled
# separately when wrapping user queries.
_LIMIT_DIALECTS = {"postgresql", "mysql", "sqlite"}

_SCHEMA_VERSION = 2
_DEFAULT_CHUNK_SIZE = 50_000


class SqlLoader:
    """Connection-based loader. Not registered for any file extension."""

    kind: ClassVar[str] = "sql"
    extensions: ClassVar[tuple[str, ...]] = ()

    def ingest(
        self,
        *,
        filename: str,
        raw_bytes: bytes | None,
        source_spec: dict[str, Any],
        datasets_dir: Path,
    ) -> DatasetPreview:
        """Materialize a query to parquet and return the preview.

        Required keys in ``source_spec``:
            connection: Connection (pydantic model for the saved connection)
            password: str | None (resolved from keyring by the caller)
            sql: str (user's query)
            max_rows: int (hard cap)
            chunk_size: int | None (optional override for pandas.read_sql chunksize)
        """

        connection: Connection = source_spec["connection"]
        password: str | None = source_spec.get("password")
        sql: str = source_spec["sql"]
        max_rows: int = int(source_spec["max_rows"])
        chunk_size: int = int(source_spec.get("chunk_size") or _DEFAULT_CHUNK_SIZE)

        dataset_id = uuid.uuid4().hex
        dataset_dir = datasets_dir / dataset_id
        dataset_dir.mkdir(parents=True, exist_ok=True)

        try:
            engine = build_engine(connection, password)
            df = materialize(
                engine=engine,
                sql=sql,
                dataset_dir=dataset_dir,
                max_rows=max_rows,
                chunk_size=chunk_size,
                dialect=connection.dialect,
            )
            validate_forecastable(df)

            columns = build_column_infos(df)
            first_rows = build_first_rows(df)

            meta = {
                "id": dataset_id,
                "kind": self.kind,
                "filename": filename,
                "row_count": int(len(df)),
                "uploaded_at": datetime.datetime.utcnow().isoformat() + "Z",
                "schema_version": _SCHEMA_VERSION,
                "source": {
                    "connection_id": connection.id,
                    "sql": sql,
                    "fetched_at": datetime.datetime.utcnow().isoformat() + "Z",
                },
            }
            (dataset_dir / "meta.json").write_text(
                json.dumps(meta), encoding="utf-8"
            )
            return DatasetPreview(
                id=dataset_id,
                filename=filename,
                columns=columns,
                row_count=int(len(df)),
                first_rows=first_rows,
            )
        except Exception:
            shutil.rmtree(dataset_dir, ignore_errors=True)
            raise

    def load(self, dataset_dir: Path) -> pd.DataFrame:
        parquet_path = dataset_dir / "data.parquet"
        if not parquet_path.exists():
            raise FileNotFoundError(
                f"SQL snapshot missing for dataset at {dataset_dir}"
            )
        return pd.read_parquet(parquet_path)


# --------------------------------------------------------------- helpers --


def build_engine(connection: Connection, password: str | None) -> Any:
    """Build a SQLAlchemy engine for the given connection record.

    Kept as a module-level function so tests and /connections/test can reuse it
    without instantiating SqlLoader.
    """

    from sqlalchemy import create_engine

    url = _build_url(connection, password)
    # SQLite doesn't support the connect_timeout arg, and its URL is the full
    # connection string already, so keep engine options minimal there.
    if connection.dialect == "sqlite":
        return create_engine(url, future=True)
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args=_connect_args(connection.dialect),
        future=True,
    )


def _build_url(connection: Connection, password: str | None) -> str:
    """Map a Connection record + password into a SQLAlchemy URL string."""

    if connection.dialect == "sqlite":
        # `database` is a filesystem path. SQLAlchemy expects sqlite:///path.
        return f"sqlite:///{connection.database}"

    prefix = _url_prefix(connection.dialect)
    creds = ""
    if connection.username:
        creds = quote_plus(connection.username)
        if password is not None:
            creds += f":{quote_plus(password)}"
        creds += "@"
    host = connection.host or "localhost"
    port = f":{connection.port}" if connection.port else ""
    database = connection.database or ""

    query = ""
    if connection.options:
        parts = [f"{k}={quote_plus(str(v))}" for k, v in connection.options.items()]
        query = "?" + "&".join(parts)
    return f"{prefix}://{creds}{host}{port}/{database}{query}"


def _url_prefix(dialect: Dialect) -> str:
    """Map our short dialect name to the SQLAlchemy driver-qualified prefix."""

    return {
        "postgresql": "postgresql+psycopg",
        "mysql": "mysql+pymysql",
        "mssql": _mssql_prefix(),
    }[dialect]


def _mssql_prefix() -> str:
    """pyodbc on Windows, pymssql elsewhere. See plan notes in the PR description."""

    import sys as _sys

    return "mssql+pyodbc" if _sys.platform == "win32" else "mssql+pymssql"


def _connect_args(dialect: Dialect) -> dict[str, Any]:
    """Short per-dialect connect_timeout; keeps bad credentials from hanging."""

    if dialect == "postgresql":
        return {"connect_timeout": 5}
    if dialect == "mysql":
        return {"connect_timeout": 5}
    if dialect == "mssql":
        return {"timeout": 5}
    return {}


def test_connection(connection: Connection, password: str | None) -> dict[str, Any]:
    """Run ``SELECT 1`` against the DB and return latency + version.

    Never raises: all failures become ``{"ok": False, "error": "..."}``.
    """

    from sqlalchemy import text

    try:
        engine = build_engine(connection, password)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Could not build connection: {exc}"}

    try:
        start = time.perf_counter()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            version = _server_version(conn, connection.dialect)
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"ok": True, "server_version": version, "latency_ms": latency_ms}
    except Exception as exc:  # noqa: BLE001 - we want the message, not a stack
        return {"ok": False, "error": str(exc)}
    finally:
        try:
            engine.dispose()
        except Exception:  # pragma: no cover
            pass


def _server_version(conn: Any, dialect: Dialect) -> str | None:
    """Best-effort: pull a one-line version string per dialect."""

    from sqlalchemy import text

    try:
        if dialect == "postgresql":
            row = conn.execute(text("SELECT version()")).first()
            return str(row[0]) if row else None
        if dialect == "mysql":
            row = conn.execute(text("SELECT VERSION()")).first()
            return str(row[0]) if row else None
        if dialect == "sqlite":
            row = conn.execute(text("SELECT sqlite_version()")).first()
            return f"SQLite {row[0]}" if row else None
        if dialect == "mssql":
            row = conn.execute(text("SELECT @@VERSION")).first()
            return str(row[0]).splitlines()[0] if row else None
    except Exception:  # noqa: BLE001
        return None
    return None


def list_tables(engine: Any, schema: str | None = None) -> list[TableInfo]:
    """Enumerate tables visible via SQLAlchemy's inspector.

    We do NOT run ``SELECT COUNT(*)`` - on large tables it is catastrophic. We
    pull cached row estimates per dialect when the inspector path doesn't
    supply them. For dialects without easy estimates (SQLite), ``row_estimate``
    is None.
    """

    from sqlalchemy import inspect

    inspector = inspect(engine)
    schemas = [schema] if schema else _default_schemas(engine, inspector)
    out: list[TableInfo] = []
    for s in schemas:
        try:
            names = inspector.get_table_names(schema=s)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not list tables for schema %s: %s", s, exc)
            continue
        for name in names:
            estimate = _row_estimate(engine, s, name)
            out.append(TableInfo(schema_name=s, name=name, row_estimate=estimate))
    return out


def _default_schemas(engine: Any, inspector: Any) -> list[str | None]:
    """Return the schemas to enumerate when the caller did not pin one."""

    dialect_name = engine.dialect.name
    if dialect_name == "postgresql":
        try:
            return inspector.get_schema_names()
        except Exception:  # noqa: BLE001
            return ["public"]
    if dialect_name == "mssql":
        try:
            return inspector.get_schema_names()
        except Exception:  # noqa: BLE001
            return ["dbo"]
    return [None]


def _row_estimate(engine: Any, schema: str | None, table: str) -> int | None:
    """Cheap row-count estimate from dialect catalogs. Returns None on failure."""

    from sqlalchemy import text

    dialect_name = engine.dialect.name
    try:
        with engine.connect() as conn:
            if dialect_name == "postgresql":
                sql = text(
                    "SELECT reltuples::bigint FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = :schema AND c.relname = :table"
                )
                row = conn.execute(
                    sql, {"schema": schema or "public", "table": table}
                ).first()
                return int(row[0]) if row else None
            if dialect_name == "mysql":
                sql = text(
                    "SELECT table_rows FROM information_schema.tables "
                    "WHERE table_name = :table"
                )
                row = conn.execute(sql, {"table": table}).first()
                return int(row[0]) if row else None
            if dialect_name == "mssql":
                sql = text(
                    "SELECT SUM(row_count) FROM sys.dm_db_partition_stats "
                    "WHERE object_id = OBJECT_ID(:qname) AND index_id IN (0, 1)"
                )
                qname = f"{schema}.{table}" if schema else table
                row = conn.execute(sql, {"qname": qname}).first()
                return int(row[0]) if row and row[0] is not None else None
    except Exception:  # noqa: BLE001
        return None
    return None


def preview_query(
    engine: Any, sql: str, *, limit: int, dialect: Dialect
) -> pd.DataFrame:
    """Return the first N rows of the user's query without persisting.

    Wraps the query in a ``SELECT * FROM (...) LIMIT N`` (or ``TOP N`` on MSSQL)
    so we don't have to parse or modify the user's SQL.
    """

    wrapped = _wrap_with_limit(sql, limit, dialect)
    return pd.read_sql_query(wrapped, engine)


def _wrap_with_limit(sql: str, limit: int, dialect: Dialect) -> str:
    """Hard-cap the result set without touching the user's query text."""

    if dialect == "mssql":
        return f"SELECT TOP {int(limit)} * FROM ({sql}) AS _sub"
    if dialect in _LIMIT_DIALECTS:
        return f"SELECT * FROM ({sql}) AS _sub LIMIT {int(limit)}"
    return sql


def materialize(
    *,
    engine: Any,
    sql: str,
    dataset_dir: Path,
    max_rows: int,
    chunk_size: int,
    dialect: Dialect,
) -> pd.DataFrame:
    """Stream the query into ``{dataset_dir}/data.parquet`` and return the DataFrame.

    If the query exceeds ``max_rows``, raise a friendly ValueError that the
    frontend can surface directly. We check row counts as chunks arrive so we
    don't hold a full result set in memory before rejecting.
    """

    import pyarrow as pa
    import pyarrow.parquet as pq

    parquet_path = dataset_dir / "data.parquet"
    wrapped = _wrap_with_limit(sql, max_rows + 1, dialect)

    total_rows = 0
    writer: pq.ParquetWriter | None = None
    frames: list[pd.DataFrame] = []

    try:
        for chunk in pd.read_sql_query(wrapped, engine, chunksize=chunk_size):
            if total_rows + len(chunk) > max_rows:
                raise ValueError(
                    f"Query returned more than {max_rows:,} rows. "
                    "Add a WHERE clause or LIMIT to narrow the result set."
                )
            total_rows += len(chunk)
            frames.append(chunk)
            table = pa.Table.from_pandas(chunk, preserve_index=False)
            if writer is None:
                writer = pq.ParquetWriter(parquet_path, table.schema)
            writer.write_table(table)
    finally:
        if writer is not None:
            writer.close()

    if not frames:
        raise ValueError("Query returned no rows.")

    return pd.concat(frames, ignore_index=True)


register(SqlLoader())


__all__ = [
    "SqlLoader",
    "build_engine",
    "test_connection",
    "list_tables",
    "preview_query",
    "materialize",
]
