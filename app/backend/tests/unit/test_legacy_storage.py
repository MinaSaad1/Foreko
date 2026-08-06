"""The rename from the app's previous name must not orphan a user's data.

Every dataset, project, and the SQLite database of an existing install lives
under the old storage root. If an upgrade stopped reading it, the app would
boot into an empty state and the user's work would look deleted.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from tempolith.settings import (
    DB_NAME,
    ENV_PREFIX,
    LEGACY_DB_NAME,
    LEGACY_ENV_PREFIX,
    LEGACY_STORAGE_DIR_NAME,
    STORAGE_DIR_NAME,
    Settings,
    adopt_legacy_env,
)


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point Path.home() at a scratch directory and clear ambient overrides."""
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.delenv(f"{ENV_PREFIX}STORAGE_DIR", raising=False)
    monkeypatch.delenv(f"{LEGACY_ENV_PREFIX}STORAGE_DIR", raising=False)
    return tmp_path


def _populate_legacy(home: Path) -> Path:
    """Build a storage root as an install under the old name would leave it."""
    legacy = home / LEGACY_STORAGE_DIR_NAME
    (legacy / "datasets").mkdir(parents=True)
    (legacy / "datasets" / "sales.csv").write_text("date,value\n2026-01-01,10\n")
    (legacy / "data").mkdir(parents=True)
    (legacy / "data" / LEGACY_DB_NAME).write_text("sqlite-bytes")
    return legacy


def test_legacy_root_is_adopted(home: Path) -> None:
    _populate_legacy(home)
    settings = Settings(preload_model=False)

    settings.ensure_dirs()

    assert settings.storage_dir == home / STORAGE_DIR_NAME
    assert (settings.datasets_dir / "sales.csv").read_text().startswith("date,value")
    # A rename, not a copy: leaving both behind would double disk use and let
    # the two roots drift apart.
    assert not (home / LEGACY_STORAGE_DIR_NAME).exists()


def test_legacy_database_is_adopted_with_its_sidecars(home: Path) -> None:
    legacy = _populate_legacy(home)
    # -wal holds committed transactions that have not been checkpointed. Moving
    # the database without it rolls the user back to the last checkpoint.
    (legacy / "data" / f"{LEGACY_DB_NAME}-wal").write_text("wal-bytes")
    (legacy / "data" / f"{LEGACY_DB_NAME}-shm").write_text("shm-bytes")

    settings = Settings(preload_model=False)
    settings.ensure_dirs()

    assert settings.db_path.read_text() == "sqlite-bytes"
    assert settings.db_path.with_name(f"{DB_NAME}-wal").read_text() == "wal-bytes"
    assert settings.db_path.with_name(f"{DB_NAME}-shm").read_text() == "shm-bytes"
    assert not (settings.data_dir / LEGACY_DB_NAME).exists()


def test_existing_new_root_is_never_clobbered(home: Path) -> None:
    _populate_legacy(home)
    current = home / STORAGE_DIR_NAME
    (current / "datasets").mkdir(parents=True)
    (current / "datasets" / "sales.csv").write_text("current-data")

    settings = Settings(preload_model=False)
    settings.ensure_dirs()

    assert (settings.datasets_dir / "sales.csv").read_text() == "current-data"
    assert (home / LEGACY_STORAGE_DIR_NAME).exists()


def test_adoption_is_skipped_for_an_explicit_storage_dir(home: Path, tmp_path: Path) -> None:
    _populate_legacy(home)
    explicit = tmp_path / "elsewhere"

    settings = Settings(storage_dir=explicit, preload_model=False)
    settings.ensure_dirs()

    # Someone who chose a directory knows where their data is. Silently moving
    # the old root into it would be a surprise, and adopt_legacy_env() already
    # carries a previously-set storage dir across.
    assert (home / LEGACY_STORAGE_DIR_NAME / "datasets" / "sales.csv").exists()
    assert not (explicit / "datasets" / "sales.csv").exists()


def test_missing_legacy_root_is_not_an_error(home: Path) -> None:
    settings = Settings(preload_model=False)

    settings.ensure_dirs()

    assert settings.datasets_dir.is_dir()


def test_legacy_env_vars_are_adopted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(f"{ENV_PREFIX}STORAGE_DIR", raising=False)
    monkeypatch.setenv(f"{LEGACY_ENV_PREFIX}STORAGE_DIR", "/data/old")

    adopt_legacy_env()

    assert os.environ[f"{ENV_PREFIX}STORAGE_DIR"] == "/data/old"


def test_the_new_env_var_wins_over_the_legacy_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(f"{LEGACY_ENV_PREFIX}STORAGE_DIR", "/data/old")
    monkeypatch.setenv(f"{ENV_PREFIX}STORAGE_DIR", "/data/new")

    adopt_legacy_env()

    assert os.environ[f"{ENV_PREFIX}STORAGE_DIR"] == "/data/new"
