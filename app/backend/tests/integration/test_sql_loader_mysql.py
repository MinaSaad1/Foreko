"""Live-MySQL integration tests for the SQL loader.

Skipped unless ``FORESEE_TEST_MYSQL_*`` env vars are set. See
``tests/integration/conftest.py`` for the env-var contract.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("pymysql")

from sqlalchemy import text

from timesfm_studio.services import dataset_store
from timesfm_studio.services.loaders.sql import (
    SqlLoader,
    build_engine,
    list_tables,
    materialize,
)
from timesfm_studio.services.loaders.sql import (
    test_connection as run_connection_test,
)

from .conftest import LiveDbConfig, unique_table_name


def _seed(engine, table: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                f"CREATE TABLE {table} ("
                "id INT AUTO_INCREMENT PRIMARY KEY, "
                "ts DATE NOT NULL, "
                "qty INT NOT NULL"
                ") ENGINE=InnoDB"
            )
        )
        conn.execute(
            text(f"INSERT INTO {table} (ts, qty) VALUES (:d, :q)"),
            [{"d": f"2024-{m:02d}-01", "q": m * 7} for m in range(1, 13)],
        )


def _drop(engine, table: str) -> None:
    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {table}"))


@pytest.fixture
def seeded_table(mysql_config: LiveDbConfig):
    connection = mysql_config.to_connection()
    engine = build_engine(connection, mysql_config.password)
    table = unique_table_name()
    try:
        _seed(engine, table)
        yield connection, mysql_config.password, table
    finally:
        try:
            _drop(engine, table)
        finally:
            engine.dispose()


@pytest.mark.integration
def test_test_connection_against_live_mysql(mysql_config: LiveDbConfig) -> None:
    connection = mysql_config.to_connection()
    result = run_connection_test(connection, mysql_config.password)
    assert result["ok"] is True, result.get("error")
    assert isinstance(result["latency_ms"], int)
    assert result.get("server_version")


@pytest.mark.integration
def test_list_tables_includes_seeded_table(seeded_table) -> None:
    connection, password, table = seeded_table
    engine = build_engine(connection, password)
    try:
        tables = list_tables(engine)
    finally:
        engine.dispose()
    assert any(t.name == table for t in tables), [t.name for t in tables]


@pytest.mark.integration
def test_materialize_writes_parquet(seeded_table, tmp_path: Path) -> None:
    connection, password, table = seeded_table
    engine = build_engine(connection, password)
    dataset_dir = tmp_path / "out"
    dataset_dir.mkdir()
    try:
        df = materialize(
            engine=engine,
            sql=f"SELECT ts, qty FROM {table} ORDER BY ts",
            dataset_dir=dataset_dir,
            max_rows=1_000,
            chunk_size=5,
            dialect="mysql",
        )
    finally:
        engine.dispose()
    assert len(df) == 12
    assert (dataset_dir / "data.parquet").exists()


@pytest.mark.integration
def test_ingest_roundtrip_through_dataset_store(
    seeded_table, tmp_path: Path
) -> None:
    connection, password, table = seeded_table
    datasets_dir = tmp_path / "datasets"
    datasets_dir.mkdir()
    loader = SqlLoader()
    preview = loader.ingest(
        filename="mysql integration",
        raw_bytes=None,
        source_spec={
            "connection": connection,
            "password": password,
            "sql": f"SELECT ts, qty FROM {table}",
            "max_rows": 1000,
        },
        datasets_dir=datasets_dir,
    )
    assert preview.row_count == 12
    reloaded = dataset_store.load_dataset(preview.id, datasets_dir)
    assert len(reloaded) == 12
