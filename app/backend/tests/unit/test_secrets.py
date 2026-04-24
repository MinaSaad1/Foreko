"""Tests for services.secrets.

We install an in-memory keyring backend via monkeypatch so tests never touch
the real Windows Credential Manager / macOS Keychain / Linux Secret Service.
"""

from __future__ import annotations

import pytest

# ``keyring`` is an optional extra; skip the whole module cleanly if it's absent.
pytest.importorskip("keyring")


@pytest.fixture
def memory_keyring(monkeypatch):
    """Swap the global keyring backend for a dict-backed MemoryKeyring."""

    import keyring  # type: ignore[import-not-found]

    class MemoryKeyring(keyring.backend.KeyringBackend):  # type: ignore[misc]
        priority = 1

        def __init__(self) -> None:
            self._store: dict[tuple[str, str], str] = {}

        def set_password(self, service, username, password):
            self._store[(service, username)] = password

        def get_password(self, service, username):
            return self._store.get((service, username))

        def delete_password(self, service, username):
            self._store.pop((service, username), None)

    backend = MemoryKeyring()
    monkeypatch.setattr(keyring, "get_keyring", lambda: backend)

    # Reset the module-level lru_cache on _keyring_module so it re-imports fresh.
    from timesfm_studio.services import secrets as s
    s._keyring_module.cache_clear()
    return backend


@pytest.fixture
def fail_keyring(monkeypatch):
    """Install the fail.Keyring backend to simulate a headless Linux box."""

    import keyring  # type: ignore[import-not-found]
    from keyring.backends import fail as fail_backend  # type: ignore[import-not-found]

    monkeypatch.setattr(keyring, "get_keyring", lambda: fail_backend.Keyring())
    from timesfm_studio.services import secrets as s
    s._keyring_module.cache_clear()


@pytest.mark.unit
def test_store_and_get_roundtrip(memory_keyring) -> None:
    from timesfm_studio.services import secrets

    secrets.store_password("abc123", "alice", "hunter2")
    assert secrets.get_password("abc123", "alice") == "hunter2"


@pytest.mark.unit
def test_service_name_prefix() -> None:
    from timesfm_studio.services import secrets

    assert secrets.service_name("abc") == "foresee-connection-abc"


@pytest.mark.unit
def test_delete_is_idempotent(memory_keyring) -> None:
    from timesfm_studio.services import secrets

    # No entry yet -> must not raise.
    secrets.delete_password("nope", "nobody")

    secrets.store_password("abc", "alice", "pw")
    secrets.delete_password("abc", "alice")
    assert secrets.get_password("abc", "alice") is None


@pytest.mark.unit
def test_is_available_true_for_memory_backend(memory_keyring) -> None:
    from timesfm_studio.services import secrets

    assert secrets.is_available() is True
    assert secrets.active_backend_name() is not None


@pytest.mark.unit
def test_is_available_false_for_fail_backend(fail_keyring) -> None:
    from timesfm_studio.services import secrets

    assert secrets.is_available() is False
    assert secrets.active_backend_name() is None


@pytest.mark.unit
def test_store_raises_when_backend_unavailable(fail_keyring) -> None:
    from timesfm_studio.services import secrets

    with pytest.raises(secrets.KeyringUnavailable):
        secrets.store_password("abc", "alice", "pw")


@pytest.mark.unit
def test_get_raises_when_backend_unavailable(fail_keyring) -> None:
    from timesfm_studio.services import secrets

    with pytest.raises(secrets.KeyringUnavailable):
        secrets.get_password("abc", "alice")


@pytest.mark.unit
def test_delete_is_noop_when_backend_unavailable(fail_keyring) -> None:
    """Delete on an unavailable backend shouldn't fail: it's cleanup work."""

    from timesfm_studio.services import secrets

    secrets.delete_password("abc", "alice")  # must not raise
