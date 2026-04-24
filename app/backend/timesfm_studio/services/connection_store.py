"""Persistent store for saved database connections.

Connection records live in a single JSON file under the app data directory
(``{app_data_dir}/connections.json``). This matches the "one file per concept"
storage pattern used for datasets' meta.json and is trivial to copy between
the foresee-web and foresee-desktop repos.

Passwords do NOT live in this file. They go through ``services.secrets``
which routes to the OS keyring. The record here just names the keyring entry
via the connection id.
"""

from __future__ import annotations

import datetime
import json
import logging
import uuid
from pathlib import Path
from typing import Any

from ..schemas.connection import Connection, ConnectionCreate
from . import secrets as secrets_service

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _read_all(connections_path: Path) -> list[dict[str, Any]]:
    if not connections_path.exists():
        return []
    try:
        data = json.loads(connections_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.warning("connections.json is malformed; treating as empty.")
        return []
    if not isinstance(data, list):
        logger.warning("connections.json is not a list; treating as empty.")
        return []
    return [entry for entry in data if isinstance(entry, dict)]


def _write_all(connections_path: Path, records: list[dict[str, Any]]) -> None:
    connections_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = connections_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(records, indent=2), encoding="utf-8")
    tmp.replace(connections_path)


def list_connections(connections_path: Path) -> list[Connection]:
    """Return every stored connection (without password)."""

    out: list[Connection] = []
    for entry in _read_all(connections_path):
        try:
            out.append(Connection(**entry))
        except Exception as exc:  # noqa: BLE001 - skip corrupted rows
            logger.warning("Skipping malformed connection entry: %s", exc)
    out.sort(key=lambda c: c.created_at, reverse=True)
    return out


def get_connection(connections_path: Path, connection_id: str) -> Connection:
    """Fetch one connection by id. Raises KeyError if not found."""

    for entry in _read_all(connections_path):
        if entry.get("id") == connection_id:
            return Connection(**entry)
    raise KeyError(f"Connection {connection_id} not found")


def create_connection(
    connections_path: Path, payload: ConnectionCreate
) -> Connection:
    """Persist a new connection record and stash its password in the keyring.

    Raises ``secrets.KeyringUnavailable`` if the keyring cannot be used and
    a password was provided; the router turns that into a 503.
    """

    connection_id = uuid.uuid4().hex
    record = Connection(
        id=connection_id,
        name=payload.name,
        dialect=payload.dialect,
        host=payload.host,
        port=payload.port,
        database=payload.database,
        username=payload.username,
        options=payload.options,
        created_at=_now_iso(),
    )

    if payload.password is not None and payload.username is not None:
        secrets_service.store_password(
            connection_id=connection_id,
            username=payload.username,
            password=payload.password,
        )

    existing = _read_all(connections_path)
    existing.append(record.model_dump())
    _write_all(connections_path, existing)
    logger.info("Saved connection %s (%s)", record.id, record.dialect)
    return record


def delete_connection(connections_path: Path, connection_id: str) -> None:
    """Remove the connection record and its keyring entry.

    Raises KeyError if the connection does not exist.
    """

    records = _read_all(connections_path)
    matches = [r for r in records if r.get("id") == connection_id]
    if not matches:
        raise KeyError(f"Connection {connection_id} not found")
    survivors = [r for r in records if r.get("id") != connection_id]
    _write_all(connections_path, survivors)

    username = matches[0].get("username")
    if username:
        secrets_service.delete_password(
            connection_id=connection_id, username=username
        )
    logger.info("Removed connection %s", connection_id)


def resolve_password(connection: Connection) -> str | None:
    """Look up the stored password for a connection, or None if not stored."""

    if connection.username is None:
        return None
    return secrets_service.get_password(
        connection_id=connection.id, username=connection.username
    )


__all__ = [
    "list_connections",
    "get_connection",
    "create_connection",
    "delete_connection",
    "resolve_password",
]
