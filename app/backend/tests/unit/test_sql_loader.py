"""SQL loader tests using a local SQLite file (no external infra).

SQLite exercises the shared SQLAlchemy code paths (build_engine, list_tables,
preview_query, materialize, test_connection). Postgres / MySQL / MSSQL live in
tests/integration and run only when the corresponding FOREKO_TEST_* env vars
point at a live database.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("sqlalchemy")

import pandas as pd

from foreko.schemas.connection import Connection
from foreko.services import dataset_store
from foreko.services.loaders.sql import (
    SqlLoader,
    build_engine,
    list_tables,
    materialize,
    preview_query,
)
from foreko.services.loaders.sql import (
    test_connection as run_connection_test,  # alias keeps pytest from collecting the import
)


def _make_sqlite_db(tmp_path: Path) -> Path:
    """Seed a sqlite file with a realistic sales table for tests."""

    from sqlalchemy import create_engine, text

    db_path = tmp_path / "sample.db"
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE sales (date TEXT, qty INTEGER, store TEXT)"))
        rows = [
            (f"2021-{m:02d}-01", m * 10, "A" if m % 2 else "B")
            for m in range(1, 13)
        ]
        conn.execute(
            text("INSERT INTO sales (date, qty, store) VALUES (:d, :q, :s)"),
            [{"d": d, "q": q, "s": s} for d, q, s in rows],
        )
    engine.dispose()
    return db_path


def _sqlite_connection(db_path: Path) -> Connection:
    return Connection(
        id="sqlite_test",
        name="local",
        dialect="sqlite",
        database=str(db_path),
        created_at="1970-01-01T00:00:00Z",
    )


@pytest.mark.unit
def test_test_connection_ok(tmp_path: Path) -> None:
    db = _make_sqlite_db(tmp_path)
    result = run_connection_test(_sqlite_connection(db), password=None)
    assert result["ok"] is True
    assert isinstance(result["latency_ms"], int)
    assert result.get("server_version", "").startswith("SQLite")


@pytest.mark.unit
def test_test_connection_bad_path_returns_error(tmp_path: Path) -> None:
    # SQLite will silently create a fresh DB at an arbitrary path, so force a
    # failure by pointing at a non-existent directory instead.
    bad_conn = Connection(
        id="x", name="bad", dialect="sqlite",
        database=str(tmp_path / "no_such_dir" / "impossible.db"),
        created_at="1970-01-01T00:00:00Z",
    )
    result = run_connection_test(bad_conn, password=None)
    assert result["ok"] is False
    assert "error" in result


@pytest.mark.unit
def test_list_tables_returns_sales(tmp_path: Path) -> None:
    db = _make_sqlite_db(tmp_path)
    engine = build_engine(_sqlite_connection(db), password=None)
    try:
        tables = list_tables(engine)
    finally:
        engine.dispose()
    names = {t.name for t in tables}
    assert "sales" in names


@pytest.mark.unit
def test_preview_query_honors_limit(tmp_path: Path) -> None:
    db = _make_sqlite_db(tmp_path)
    engine = build_engine(_sqlite_connection(db), password=None)
    try:
        df = preview_query(
            engine, "SELECT * FROM sales", limit=5, dialect="sqlite"
        )
    finally:
        engine.dispose()
    assert len(df) == 5
    assert {"date", "qty", "store"} <= set(df.columns)


@pytest.mark.unit
def test_materialize_writes_parquet(tmp_path: Path) -> None:
    db = _make_sqlite_db(tmp_path)
    dataset_dir = tmp_path / "out"
    dataset_dir.mkdir()
    engine = build_engine(_sqlite_connection(db), password=None)
    try:
        df = materialize(
            engine=engine,
            sql="SELECT date, qty FROM sales ORDER BY date",
            dataset_dir=dataset_dir,
            max_rows=1_000,
            chunk_size=5,
            dialect="sqlite",
        )
    finally:
        engine.dispose()
    assert len(df) == 12
    assert (dataset_dir / "data.parquet").exists()
    reloaded = pd.read_parquet(dataset_dir / "data.parquet")
    assert len(reloaded) == 12


@pytest.mark.unit
def test_materialize_enforces_row_cap(tmp_path: Path) -> None:
    db = _make_sqlite_db(tmp_path)
    dataset_dir = tmp_path / "capped"
    dataset_dir.mkdir()
    engine = build_engine(_sqlite_connection(db), password=None)
    try:
        with pytest.raises(ValueError, match="more than 5 rows"):
            materialize(
                engine=engine,
                sql="SELECT * FROM sales",
                dataset_dir=dataset_dir,
                max_rows=5,
                chunk_size=2,
                dialect="sqlite",
            )
    finally:
        engine.dispose()


@pytest.mark.unit
def test_ingest_end_to_end_roundtrip(tmp_path: Path) -> None:
    """Full loader.ingest() + dispatcher load() path."""

    db = _make_sqlite_db(tmp_path)
    datasets_dir = tmp_path / "datasets"
    datasets_dir.mkdir()

    loader = SqlLoader()
    preview = loader.ingest(
        filename="sales snapshot",
        raw_bytes=None,
        source_spec={
            "connection": _sqlite_connection(db),
            "password": None,
            "sql": "SELECT date, qty FROM sales",
            "max_rows": 1000,
        },
        datasets_dir=datasets_dir,
    )

    assert preview.row_count == 12
    assert {c.name for c in preview.columns} == {"date", "qty"}

    meta = dataset_store.read_meta(datasets_dir / preview.id)
    assert meta["kind"] == "sql"
    assert meta["source"]["connection_id"] == "sqlite_test"
    assert meta["source"]["sql"].startswith("SELECT")

    reloaded = dataset_store.load_dataset(preview.id, datasets_dir)
    assert len(reloaded) == 12
