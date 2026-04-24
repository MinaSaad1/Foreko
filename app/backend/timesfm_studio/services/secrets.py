"""Credential storage via the OS keyring.

Foresee never writes passwords to disk. The plaintext DB password goes through
the ``keyring`` package which uses Windows Credential Manager, macOS Keychain,
or the Secret Service API on Linux. Host / port / database / username live in
the connection record (``services.connection_store``) so the full URL can be
reconstructed without ever touching the keyring when we only need to display
the connection.

Service name convention:
    foresee-connection-<connection_id>   (username = DB username)

If the keyring backend is unavailable (headless Linux without Secret Service,
some container images), ``store_password`` raises :class:`KeyringUnavailable`
with guidance. The router turns that into a 503 with an actionable message.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)

_SERVICE_PREFIX = "foresee-connection-"


class KeyringUnavailable(RuntimeError):
    """Raised when the OS keyring cannot be used on this machine."""


def service_name(connection_id: str) -> str:
    """Compose the keyring service name for a given connection id."""

    return f"{_SERVICE_PREFIX}{connection_id}"


@lru_cache(maxsize=1)
def _keyring_module() -> Any:
    """Import ``keyring`` lazily so environments without it still boot.

    The main app keeps working without the connectors extra installed; SQL
    routes will raise KeyringUnavailable at use time.
    """

    try:
        import keyring  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - exercised only when extra missing
        raise KeyringUnavailable(
            "The 'keyring' package is not installed. Install the 'connectors' "
            "extra to enable saved database connections."
        ) from exc
    return keyring


def _active_backend_or_none() -> Any:
    """Return the live keyring backend, or None if no usable backend is set.

    We treat ``keyring.backends.fail.Keyring`` and ``keyring.backends.null.Keyring``
    as unavailable because their ``set_password`` either raises or silently
    drops data.
    """

    try:
        kr = _keyring_module()
    except KeyringUnavailable:
        return None
    try:
        backend = kr.get_keyring()
    except Exception:  # pragma: no cover - defensive
        return None

    cls_name = type(backend).__name__
    module_name = type(backend).__module__
    if cls_name in {"Keyring"} and module_name in {
        "keyring.backends.fail",
        "keyring.backends.null",
    }:
        return None
    return backend


def is_available() -> bool:
    """Return True if passwords can be stored and retrieved right now."""

    return _active_backend_or_none() is not None


def active_backend_name() -> str | None:
    """Human-readable backend id for diagnostics, or None if unavailable."""

    backend = _active_backend_or_none()
    if backend is None:
        return None
    module_name = type(backend).__module__
    cls_name = type(backend).__name__
    return f"{module_name}.{cls_name}"


def store_password(connection_id: str, username: str, password: str) -> None:
    """Persist the password for a connection. Overwrites any existing entry."""

    backend = _active_backend_or_none()
    if backend is None:
        raise KeyringUnavailable(
            "OS keyring is not available on this machine. On Linux, install "
            "gnome-keyring or libsecret; on headless servers you may need to "
            "start a session bus."
        )
    kr = _keyring_module()
    kr.set_password(service_name(connection_id), username, password)


def get_password(connection_id: str, username: str) -> str | None:
    """Fetch the password for a connection. Returns None if not set."""

    backend = _active_backend_or_none()
    if backend is None:
        raise KeyringUnavailable(
            "OS keyring is not available; cannot read stored password."
        )
    kr = _keyring_module()
    return kr.get_password(service_name(connection_id), username)


def delete_password(connection_id: str, username: str) -> None:
    """Remove the password for a connection. Safe to call if nothing is set."""

    backend = _active_backend_or_none()
    if backend is None:
        return
    kr = _keyring_module()
    try:
        kr.delete_password(service_name(connection_id), username)
    except Exception as exc:  # noqa: BLE001 - missing entry is not an error
        logger.debug(
            "Ignoring delete_password failure for %s/%s: %s",
            connection_id, username, exc,
        )


__all__ = [
    "KeyringUnavailable",
    "service_name",
    "is_available",
    "active_backend_name",
    "store_password",
    "get_password",
    "delete_password",
]
