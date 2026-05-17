"""Shared helpers for live-database integration tests.

These tests are skipped unless the corresponding ``FOREKO_TEST_*`` env vars
are set. Each dialect uses five vars so they map cleanly onto the Connection
schema (no URL parsing required):

    FOREKO_TEST_POSTGRES_HOST
    FOREKO_TEST_POSTGRES_PORT
    FOREKO_TEST_POSTGRES_DATABASE
    FOREKO_TEST_POSTGRES_USERNAME
    FOREKO_TEST_POSTGRES_PASSWORD

Same prefix pattern for ``MYSQL`` and ``MSSQL``.

A typical local invocation looks like::

    FOREKO_TEST_POSTGRES_HOST=localhost \
    FOREKO_TEST_POSTGRES_PORT=5432 \
    FOREKO_TEST_POSTGRES_DATABASE=foreko_test \
    FOREKO_TEST_POSTGRES_USERNAME=foreko \
    FOREKO_TEST_POSTGRES_PASSWORD=secret \
    pytest app/backend/tests/integration -m integration

Each test seeds and drops its own table (uuid-suffixed name) so concurrent
runs don't collide and the live database is left clean.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

import pytest

from foreko.schemas.connection import Connection, Dialect


@dataclass(frozen=True)
class LiveDbConfig:
    """Resolved connection inputs for one dialect."""

    dialect: Dialect
    host: str
    port: int
    database: str
    username: str
    password: str

    def to_connection(self, name: str = "integration") -> Connection:
        return Connection(
            id=f"itest_{uuid.uuid4().hex[:8]}",
            name=name,
            dialect=self.dialect,
            host=self.host,
            port=self.port,
            database=self.database,
            username=self.username,
            created_at="1970-01-01T00:00:00Z",
        )


def _env(name: str) -> str | None:
    val = os.environ.get(name)
    return val if val and val.strip() else None


def _resolve(prefix: str, dialect: Dialect, default_port: int) -> LiveDbConfig | None:
    """Pull the five ``FOREKO_TEST_<PREFIX>_*`` vars or return None."""

    host = _env(f"FOREKO_TEST_{prefix}_HOST")
    database = _env(f"FOREKO_TEST_{prefix}_DATABASE")
    username = _env(f"FOREKO_TEST_{prefix}_USERNAME")
    password = _env(f"FOREKO_TEST_{prefix}_PASSWORD")
    if not (host and database and username and password is not None):
        return None
    port_raw = _env(f"FOREKO_TEST_{prefix}_PORT")
    port = int(port_raw) if port_raw else default_port
    return LiveDbConfig(
        dialect=dialect,
        host=host,
        port=port,
        database=database,
        username=username,
        password=password,
    )


@pytest.fixture
def postgres_config() -> LiveDbConfig:
    cfg = _resolve("POSTGRES", "postgresql", 5432)
    if cfg is None:
        pytest.skip("FOREKO_TEST_POSTGRES_* env vars not set")
    return cfg


@pytest.fixture
def mysql_config() -> LiveDbConfig:
    cfg = _resolve("MYSQL", "mysql", 3306)
    if cfg is None:
        pytest.skip("FOREKO_TEST_MYSQL_* env vars not set")
    return cfg


@pytest.fixture
def mssql_config() -> LiveDbConfig:
    cfg = _resolve("MSSQL", "mssql", 1433)
    if cfg is None:
        pytest.skip("FOREKO_TEST_MSSQL_* env vars not set")
    return cfg


def unique_table_name(prefix: str = "foreko_itest") -> str:
    """Per-test table name so parallel runs don't clobber each other."""

    return f"{prefix}_{uuid.uuid4().hex[:10]}"
