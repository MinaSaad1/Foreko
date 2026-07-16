"""Tests for versioned SQLite schema migrations."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from foreko.services.migrations import (
    MIGRATIONS,
    SCHEMA_VERSION,
    Migration,
    MigrationError,
    current_version,
    run_migrations,
)
from foreko.services.store import Store


LEGACY_V1_SCHEMA = """
CREATE TABLE IF NOT EXISTS analyses (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(dataset_id, kind, params_hash)
);
CREATE INDEX IF NOT EXISTS idx_analyses_dataset ON analyses(dataset_id);

CREATE TABLE IF NOT EXISTS scenarios (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_dataset ON scenarios(dataset_id);

CREATE TABLE IF NOT EXISTS forecast_history (
  id            TEXT PRIMARY KEY,
  dataset_id    TEXT NOT NULL,
  model         TEXT NOT NULL,
  run_at        TEXT NOT NULL,
  horizon       INTEGER NOT NULL,
  forecast_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fhistory_dataset ON forecast_history(dataset_id);

CREATE TABLE IF NOT EXISTS annotations (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  date        TEXT NOT NULL,
  label       TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annot_dataset ON annotations(dataset_id);
"""


def _table_names(db_path: Path) -> tuple[str, ...]:
    with closing(sqlite3.connect(db_path)) as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    return tuple(row[0] for row in rows)


@pytest.mark.unit
def test_v1_database_without_user_version_is_adopted_at_baseline(
    tmp_path: Path,
) -> None:
    db = tmp_path / "foreko.db"
    with closing(sqlite3.connect(db)) as legacy:
        legacy.executescript(LEGACY_V1_SCHEMA)
        legacy.execute(
            "INSERT INTO forecast_history "
            "(id, dataset_id, model, run_at, horizon, forecast_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                "history-1",
                "dataset-1",
                "timesfm",
                "2026-07-16T12:00:00Z",
                12,
                '{"point": [1.0, 2.0]}',
            ),
        )
        legacy.commit()

    store = Store(db)

    assert current_version(db) == SCHEMA_VERSION
    # The V1 rows survive, and the project domain is added alongside them.
    assert "projects" in _table_names(db)
    assert store.history_list("dataset-1") == [
        {
            "id": "history-1",
            "model": "timesfm",
            "run_at": "2026-07-16T12:00:00Z",
            "horizon": 12,
            "forecast": {"point": [1.0, 2.0]},
        }
    ]


@pytest.mark.unit
def test_adoption_does_not_rerun_the_baseline_migration(tmp_path: Path) -> None:
    # The real baseline is CREATE TABLE IF NOT EXISTS, so re-running it on a
    # populated V1 database is indistinguishable from adopting it. This tripwire
    # baseline fails loudly if it is executed, which is the only way to prove the
    # adoption branch skips it rather than replaying it.
    db = tmp_path / "foreko.db"
    with closing(sqlite3.connect(db)) as legacy:
        legacy.executescript(LEGACY_V1_SCHEMA)
        legacy.commit()

    tripwire = Migration(
        version=1,
        description="must never execute against an adopted database",
        statements=("INSERT INTO table_that_does_not_exist VALUES (1)",),
    )

    assert run_migrations(db, migrations=(tripwire,)) == 1
    assert current_version(db) == 1


@pytest.mark.unit
def test_failed_migration_leaves_prior_schema_and_version_untouched(
    tmp_path: Path,
) -> None:
    db = tmp_path / "foreko.db"
    Store(db)
    before_tables = _table_names(db)
    before_version = current_version(db)
    exploding = Migration(
        version=SCHEMA_VERSION + 1,
        description="explode after creating a table",
        statements=(
            "CREATE TABLE migration_should_roll_back (id TEXT PRIMARY KEY)",
            "INSERT INTO table_that_does_not_exist VALUES (1)",
        ),
    )

    with pytest.raises(MigrationError, match="explode after creating a table"):
        run_migrations(db, migrations=(*MIGRATIONS, exploding))

    assert _table_names(db) == before_tables
    assert current_version(db) == before_version


@pytest.mark.unit
def test_fresh_database_gets_full_migration(tmp_path: Path) -> None:
    db = tmp_path / "foreko.db"

    assert run_migrations(db) == SCHEMA_VERSION
    assert current_version(db) == SCHEMA_VERSION
    assert _table_names(db) == (
        "analyses",
        "annotations",
        "forecast_history",
        "issued_forecasts",
        "project_actuals",
        "project_revisions",
        "project_runs",
        "projects",
        "scenarios",
    )


@pytest.mark.unit
def test_rerunning_migrations_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "foreko.db"
    first_version = run_migrations(db)
    first_tables = _table_names(db)

    assert run_migrations(db) == first_version
    assert _table_names(db) == first_tables


@pytest.mark.unit
def test_database_newer_than_supported_schema_is_rejected(tmp_path: Path) -> None:
    db = tmp_path / "foreko.db"
    with closing(sqlite3.connect(db)) as conn:
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION + 1}")
        conn.commit()

    with pytest.raises(MigrationError, match="newer than supported"):
        run_migrations(db)

    assert current_version(db) == SCHEMA_VERSION + 1
