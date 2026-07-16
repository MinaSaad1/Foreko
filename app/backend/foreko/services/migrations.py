"""Versioned SQLite schema migrations for Foreko persistence."""

from __future__ import annotations

import sqlite3
from collections.abc import Sequence
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path


SCHEMA_VERSION = 1


class MigrationError(Exception):
    """Raised when the database schema cannot be migrated safely."""


@dataclass(frozen=True)
class Migration:
    version: int
    description: str
    statements: tuple[str, ...]


MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        version=1,
        description="Create the baseline persistence schema",
        statements=(
            """CREATE TABLE IF NOT EXISTS analyses (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(dataset_id, kind, params_hash)
);""",
            "CREATE INDEX IF NOT EXISTS idx_analyses_dataset ON analyses(dataset_id);",
            """CREATE TABLE IF NOT EXISTS scenarios (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);""",
            "CREATE INDEX IF NOT EXISTS idx_scenarios_dataset ON scenarios(dataset_id);",
            """CREATE TABLE IF NOT EXISTS forecast_history (
  id            TEXT PRIMARY KEY,
  dataset_id    TEXT NOT NULL,
  model         TEXT NOT NULL,
  run_at        TEXT NOT NULL,
  horizon       INTEGER NOT NULL,
  forecast_json TEXT NOT NULL
);""",
            "CREATE INDEX IF NOT EXISTS idx_fhistory_dataset ON forecast_history(dataset_id);",
            """CREATE TABLE IF NOT EXISTS annotations (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  date        TEXT NOT NULL,
  label       TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL
);""",
            "CREATE INDEX IF NOT EXISTS idx_annot_dataset ON annotations(dataset_id);",
        ),
    ),
)


def current_version(db_path: Path) -> int:
    """Return the schema version stored in SQLite's application metadata."""
    # sqlite3's own context manager commits but does not close, which leaks the
    # handle and keeps the file locked on Windows.
    with closing(sqlite3.connect(db_path, timeout=10.0)) as conn:
        row = conn.execute("PRAGMA user_version").fetchone()
    return int(row[0])


def run_migrations(
    db_path: Path,
    *,
    migrations: Sequence[Migration] = MIGRATIONS,
) -> int:
    """Apply pending migrations and return the resulting schema version."""
    ordered = tuple(migrations)
    _validate_migrations(ordered)

    try:
        conn = sqlite3.connect(db_path, timeout=10.0, isolation_level=None)
    except sqlite3.Error as exc:
        raise MigrationError(f"Could not open database {db_path}") from exc

    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        version = _connection_version(conn)

        if version > SCHEMA_VERSION:
            raise MigrationError(
                f"Database schema version {version} is newer than supported "
                f"version {SCHEMA_VERSION}"
            )

        if version == 0 and _has_analyses_table(conn):
            _set_version_transaction(conn, 1, "adopt legacy schema")
            version = 1

        for migration in ordered:
            if migration.version <= version:
                continue
            _apply_migration(conn, migration)
            version = migration.version

        return version
    except MigrationError:
        raise
    except sqlite3.Error as exc:
        raise MigrationError(f"Could not inspect or migrate database {db_path}") from exc
    finally:
        conn.close()


def _validate_migrations(migrations: tuple[Migration, ...]) -> None:
    previous = 0
    for migration in migrations:
        if type(migration.version) is not int or migration.version <= 0:
            raise MigrationError("Migration versions must be positive integers")
        if migration.version <= previous:
            raise MigrationError("Migrations must be ordered by unique version")
        previous = migration.version


def _connection_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("PRAGMA user_version").fetchone()
    return int(row[0])


def _has_analyses_table(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='analyses'"
    ).fetchone()
    return row is not None


def _set_version_transaction(
    conn: sqlite3.Connection,
    version: int,
    description: str,
) -> None:
    if type(version) is not int:
        raise MigrationError("Schema version must be an integer")

    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(f"PRAGMA user_version = {version}")
        conn.execute("COMMIT")
    except sqlite3.Error as exc:
        _rollback(conn)
        raise MigrationError(f"Failed to {description}") from exc


def _apply_migration(conn: sqlite3.Connection, migration: Migration) -> None:
    try:
        conn.execute("BEGIN IMMEDIATE")
        for statement in migration.statements:
            conn.execute(statement)
        conn.execute(f"PRAGMA user_version = {migration.version}")
        conn.execute("COMMIT")
    except sqlite3.Error as exc:
        _rollback(conn)
        raise MigrationError(
            f"Migration {migration.version} failed: {migration.description}"
        ) from exc


def _rollback(conn: sqlite3.Connection) -> None:
    if conn.in_transaction:
        conn.execute("ROLLBACK")
