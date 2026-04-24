"""Runtime settings for TimesFM Studio."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-configurable settings.

    Override any field via ``TIMESFM_STUDIO_<FIELD>`` environment variables.
    """

    model_config = SettingsConfigDict(
        env_prefix="TIMESFM_STUDIO_",
        env_file=".env",
        extra="ignore",
    )

    model_id: str = Field(
        default="google/timesfm-2.5-200m-pytorch",
        description="HuggingFace repo id for the TimesFM checkpoint.",
    )
    storage_dir: Path = Field(
        default_factory=lambda: Path.home() / ".timesfm_studio",
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
        return self.data_dir / "foresee.db"

    @property
    def exports_dir(self) -> Path:
        return self.storage_dir / "exports"

    @property
    def logs_dir(self) -> Path:
        return self.storage_dir / "logs"

    # LLM settings (Phase 5)
    llm_provider: str = Field(default="none", description="none | anthropic | openai | ollama")
    llm_model: str = Field(default="claude-sonnet-4-6", description="Model id")
    llm_api_key: str = Field(default="", description="API key (empty for local ollama)")
    llm_budget_monthly_usd: float = Field(default=5.0)

    # Alerts (Phase 6)
    smtp_host: str = Field(default="")
    smtp_port: int = Field(default=587)
    smtp_user: str = Field(default="")
    smtp_password: str = Field(default="")
    alert_webhook_url: str = Field(default="")

    def ensure_dirs(self) -> None:
        for d in (
            self.datasets_dir,
            self.adapters_dir,
            self.jobs_dir,
            self.data_dir,
            self.exports_dir,
            self.logs_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()
