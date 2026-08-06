"""Pydantic models for saved database connections."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Dialect = Literal["postgresql", "mysql", "sqlite", "mssql"]


class ConnectionCreate(BaseModel):
    """Payload to create or test a connection.

    For SQLite, `host`/`port`/`username`/`password` are ignored; `database` is
    the filesystem path to the .db file.
    """

    name: str = Field(..., description="User-visible connection name.")
    dialect: Dialect
    host: str | None = None
    port: int | None = None
    database: str
    username: str | None = None
    password: str | None = Field(
        default=None,
        description="Stored only in the OS keyring, never on disk.",
    )
    options: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra SQLAlchemy URL query params (e.g. {'sslmode': 'require'}).",
    )


class Connection(BaseModel):
    """Saved connection record as returned to the frontend. No password."""

    id: str
    name: str
    dialect: Dialect
    host: str | None = None
    port: int | None = None
    database: str
    username: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class ConnectionTestRequest(BaseModel):
    """Test either a saved connection (by id) or an unsaved draft."""

    connection_id: str | None = None
    draft: ConnectionCreate | None = None


class ConnectionTestResult(BaseModel):
    ok: bool
    server_version: str | None = None
    latency_ms: int | None = None
    error: str | None = None


class TableInfo(BaseModel):
    schema_name: str | None = None
    name: str
    row_estimate: int | None = None


class QueryRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    limit: int | None = Field(default=100, ge=1, le=10_000)


class IngestRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    name: str | None = Field(
        default=None,
        description="Optional display name for the resulting dataset.",
    )


class SecretsBackendInfo(BaseModel):
    """Surfaced on /health so the frontend can warn when no keyring is active."""

    available: bool
    backend: str | None = None


__all__ = [
    "Dialect",
    "ConnectionCreate",
    "Connection",
    "ConnectionTestRequest",
    "ConnectionTestResult",
    "TableInfo",
    "QueryRequest",
    "IngestRequest",
    "SecretsBackendInfo",
]
