"""HTTP-level tests for /api/datasets/connections/*.

Uses a MemoryKeyring via monkeypatch + a local SQLite file so every route is
exercised end-to-end without external infra.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

pytest.importorskip("keyring")


@pytest.fixture(autouse=True)
def memory_keyring(monkeypatch):
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

    monkeypatch.setattr(keyring, "get_keyring", lambda: MemoryKeyring())
    from timesfm_studio.services import secrets as s
    s._keyring_module.cache_clear()


def _seed_sqlite(path: Path) -> None:
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE sales (date TEXT, qty INTEGER)"))
        conn.execute(
            text("INSERT INTO sales (date, qty) VALUES (:d, :q)"),
            [{"d": f"2021-{m:02d}-01", "q": m * 10} for m in range(1, 13)],
        )
    engine.dispose()


@pytest.mark.unit
def test_secrets_backend_endpoint_reports_available(client: TestClient) -> None:
    resp = client.get("/api/datasets/connections/secrets-backend")
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is True
    assert body["backend"] is not None


@pytest.mark.unit
def test_create_list_delete_roundtrip(client: TestClient, tmp_path: Path) -> None:
    db = tmp_path / "sample.db"
    _seed_sqlite(db)

    create = client.post(
        "/api/datasets/connections",
        json={
            "name": "local sqlite",
            "dialect": "sqlite",
            "database": str(db),
        },
    )
    assert create.status_code == 201, create.text
    connection = create.json()
    assert connection["dialect"] == "sqlite"
    cid = connection["id"]

    listing = client.get("/api/datasets/connections")
    assert listing.status_code == 200
    assert any(c["id"] == cid for c in listing.json())

    delete = client.delete(f"/api/datasets/connections/{cid}")
    assert delete.status_code == 204

    after = client.get("/api/datasets/connections")
    assert all(c["id"] != cid for c in after.json())


@pytest.mark.unit
def test_test_endpoint_ok(client: TestClient, tmp_path: Path) -> None:
    db = tmp_path / "sample.db"
    _seed_sqlite(db)

    resp = client.post(
        "/api/datasets/connections/test",
        json={
            "draft": {
                "name": "draft",
                "dialect": "sqlite",
                "database": str(db),
            }
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["server_version"].startswith("SQLite")


@pytest.mark.unit
def test_test_endpoint_rejects_empty_request(client: TestClient) -> None:
    resp = client.post("/api/datasets/connections/test", json={})
    assert resp.status_code == 400


@pytest.mark.unit
def test_list_tables_and_preview(client: TestClient, tmp_path: Path) -> None:
    db = tmp_path / "sample.db"
    _seed_sqlite(db)

    create = client.post(
        "/api/datasets/connections",
        json={"name": "x", "dialect": "sqlite", "database": str(db)},
    )
    cid = create.json()["id"]

    tables = client.get(f"/api/datasets/connections/{cid}/tables")
    assert tables.status_code == 200
    assert any(t["name"] == "sales" for t in tables.json())

    preview = client.post(
        f"/api/datasets/connections/{cid}/preview",
        json={"sql": "SELECT * FROM sales", "limit": 3},
    )
    assert preview.status_code == 200
    assert preview.json()["row_count"] == 3


@pytest.mark.unit
def test_ingest_then_preview_and_series(client: TestClient, tmp_path: Path) -> None:
    """End-to-end: create connection, ingest a query, then /datasets/{id}/preview
    and /datasets/{id}/series must work on the resulting SQL-backed dataset."""

    db = tmp_path / "sample.db"
    _seed_sqlite(db)

    create = client.post(
        "/api/datasets/connections",
        json={"name": "x", "dialect": "sqlite", "database": str(db)},
    )
    cid = create.json()["id"]

    ingest = client.post(
        f"/api/datasets/connections/{cid}/ingest",
        json={"sql": "SELECT date, qty FROM sales ORDER BY date"},
    )
    assert ingest.status_code == 200, ingest.text
    dataset_id = ingest.json()["id"]

    prev = client.get(f"/api/datasets/{dataset_id}/preview")
    assert prev.status_code == 200
    assert prev.json()["row_count"] == 12

    listed = client.get("/api/datasets")
    assert any(d["id"] == dataset_id for d in listed.json())

    series = client.post(
        f"/api/datasets/{dataset_id}/series",
        json={"value_col": "qty", "date_col": "date"},
    )
    assert series.status_code == 200
    assert len(series.json()["series"]) == 1


@pytest.mark.unit
def test_bad_sql_surfaces_400(client: TestClient, tmp_path: Path) -> None:
    db = tmp_path / "sample.db"
    _seed_sqlite(db)
    create = client.post(
        "/api/datasets/connections",
        json={"name": "x", "dialect": "sqlite", "database": str(db)},
    )
    cid = create.json()["id"]

    resp = client.post(
        f"/api/datasets/connections/{cid}/preview",
        json={"sql": "SELECT * FROM no_such_table"},
    )
    assert resp.status_code == 400
    assert "no_such_table" in resp.text.lower() or "could not" in resp.text.lower()


@pytest.mark.unit
def test_delete_missing_connection_is_404(client: TestClient) -> None:
    resp = client.delete("/api/datasets/connections/does_not_exist")
    assert resp.status_code == 404
