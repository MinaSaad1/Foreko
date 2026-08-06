"""Runtime settings for Tempolith."""

from __future__ import annotations

import logging
import os
from contextlib import suppress
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

STORAGE_DIR_NAME = ".tempolith"
DB_NAME = "tempolith.db"

# The app shipped under a previous name. Existing installs keep every dataset,
# project, and the SQLite database under these; see _migrate_legacy_storage.
LEGACY_STORAGE_DIR_NAME = ".foreko"
LEGACY_DB_NAME = "foreko.db"
LEGACY_ENV_PREFIX = "FOREKO_"
ENV_PREFIX = "TEMPOLITH_"


# Every persistent subdirectory of storage_dir. Single source of truth: both
# ensure_dirs() and the storage-wipe endpoint read this, so a new directory
# cannot be created but left behind by a wipe.
STORAGE_DIR_NAMES: tuple[str, ...] = (
    "datasets",
    "adapters",
    "jobs",
    "data",
    "exports",
    "logs",
    "projects",
)


def adopt_legacy_env() -> None:
    """Accept ``FOREKO_*`` variables left over from the previous name.

    Deprecated, and removed in the next major version. Ignoring them outright
    would change behaviour on upgrade for anyone with an existing .env or
    launch script. The damaging case is FOREKO_STORAGE_DIR: drop it and the app
    silently reads an empty default root while the user's real data sits
    untouched somewhere else. A value under the new prefix always wins.
    """
    for key, value in list(os.environ.items()):
        if not key.startswith(LEGACY_ENV_PREFIX):
            continue
        renamed = ENV_PREFIX + key[len(LEGACY_ENV_PREFIX) :]
        if renamed not in os.environ:
            os.environ[renamed] = value
            logger.warning("%s is deprecated. Use %s instead.", key, renamed)


# At import, so that direct ``Settings()`` construction sees the same
# environment that ``get_settings()`` does.
adopt_legacy_env()


class Settings(BaseSettings):
    """Environment-configurable settings.

    Override any field via ``TEMPOLITH_<FIELD>`` environment variables.
    """

    model_config = SettingsConfigDict(
        env_prefix="TEMPOLITH_",
        env_file=".env",
        extra="ignore",
    )

    model_id: str = Field(
        default="google/timesfm-2.5-200m-pytorch",
        description="HuggingFace repo id for the TimesFM checkpoint.",
    )
    storage_dir: Path = Field(
        default_factory=lambda: Path.home() / STORAGE_DIR_NAME,
        description="Root directory for persistent app data (datasets, adapters, jobs).",
    )
    dataset_ttl_hours: int = Field(
        default=720,
        description="How long uploaded CSV datasets live before the janitor sweeps them. Default is 30 days.",
    )
    max_upload_bytes: int = Field(
        default=50 * 1024 * 1024,
        description="Hard cap on CSV upload size (bytes).",
    )
    cors_origins: tuple[str, ...] = Field(
        default=("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000"),
        description="Allowed CORS origins for the React dev server.",
    )
    preload_model: bool = Field(
        default=True,
        description="If True, the model starts loading at FastAPI startup (recommended).",
    )
    fake_models: bool = Field(
        default=False,
        description=(
            "Test-only. When True, forecasting uses deterministic stand-ins instead "
            "of TimesFM, so the browser journey runs without model weights and "
            "returns the same numbers every time. Never enable this outside tests: "
            "the forecasts are arithmetic, not predictions."
        ),
    )
    inference_timeout_s: int = Field(
        default=600,
        description=(
            "Per-request ceiling (seconds) for a single model inference call. "
            "A pathological series cannot pin the inference worker forever."
        ),
    )

    # Database / connection ingestion (PR 3)
    max_sql_rows: int = Field(
        default=5_000_000,
        description="Hard cap on rows returned by a SQL ingest query.",
    )
    max_parquet_bytes: int = Field(
        default=2 * 1024 * 1024 * 1024,
        description="Advisory cap on the size of a materialized parquet snapshot.",
    )

    @property
    def connections_path(self) -> Path:
        """Location of the saved connections registry (passwords live in the OS keyring)."""
        return self.data_dir / "connections.json"

    @property
    def datasets_dir(self) -> Path:
        return self.storage_dir / "datasets"

    @property
    def adapters_dir(self) -> Path:
        return self.storage_dir / "adapters"

    @property
    def jobs_dir(self) -> Path:
        return self.storage_dir / "jobs"

    @property
    def data_dir(self) -> Path:
        return self.storage_dir / "data"

    @property
    def db_path(self) -> Path:
        return self.data_dir / DB_NAME

    @property
    def exports_dir(self) -> Path:
        return self.storage_dir / "exports"

    @property
    def logs_dir(self) -> Path:
        return self.storage_dir / "logs"

    @property
    def projects_dir(self) -> Path:
        return self.storage_dir / "projects"

    def _has_own_data(self) -> bool:
        """True when this storage root already holds real work.

        The root merely existing proves nothing. In the desktop build the
        Tauri shell writes ``logs/sidecar.log`` before it spawns the backend,
        so the root is normally already there on the very first run under the
        new name. Only user-owned content counts as "this app has run here".
        """
        if self.db_path.exists():
            return True
        return any(
            (self.storage_dir / name).is_dir() and any((self.storage_dir / name).iterdir())
            for name in STORAGE_DIR_NAMES
            if name != "logs"
        )

    def _migrate_legacy_storage(self) -> None:
        """Adopt data written under the app's previous name.

        Every dataset, project, adapter, export, and the SQLite database of an
        existing install lives under ``~/.foreko``. Renaming the app without
        this makes an upgrade look like total data loss: the new root is empty
        and the old one is never read again. Adopting it is a move, so it costs
        nothing and leaves no second copy on disk.

        Only the default root is adopted. Someone who set an explicit storage
        directory already knows where their data is, and adopt_legacy_env()
        carries their old setting across.
        """
        if self.storage_dir != Path.home() / STORAGE_DIR_NAME:
            return

        legacy_root = Path.home() / LEGACY_STORAGE_DIR_NAME
        if not legacy_root.is_dir() or self._has_own_data():
            return

        try:
            # Merge entry by entry rather than renaming the root. Renaming
            # requires the destination not to exist, which on the desktop
            # build is false by the time the backend starts, and the failure
            # would orphan the user's work for good.
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            for entry in sorted(legacy_root.iterdir()):
                target = self.storage_dir / entry.name
                if not target.exists():
                    entry.rename(target)

            legacy_db = self.data_dir / LEGACY_DB_NAME
            if legacy_db.exists() and not self.db_path.exists():
                # The -wal sidecar holds committed transactions that have not
                # been checkpointed yet. Moving the database without it rolls
                # the user back to the last checkpoint.
                for suffix in ("", "-wal", "-shm"):
                    source = legacy_db.with_name(legacy_db.name + suffix)
                    if source.exists():
                        source.rename(self.db_path.with_name(self.db_path.name + suffix))

            # rmdir only succeeds on an empty directory, so whatever was not
            # adopted above survives instead of being deleted.
            with suppress(OSError):
                legacy_root.rmdir()
            logger.info("Adopted existing data from %s.", legacy_root)
        except OSError as exc:
            # A failed adoption must not stop the app from booting. The user
            # keeps a readable copy at the old path either way.
            logger.warning("Could not adopt data from %s: %s", legacy_root, exc)

    def ensure_dirs(self) -> None:
        # Before the mkdir loop: adoption is keyed on the new root not existing
        # yet, and creating it here would hide the old one permanently.
        self._migrate_legacy_storage()
        for name in STORAGE_DIR_NAMES:
            (self.storage_dir / name).mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()
