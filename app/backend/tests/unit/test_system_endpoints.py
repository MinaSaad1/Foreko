"""Smoke tests for /api/health and /api/model-info using the fake registry."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.mark.unit
def test_health(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["model_status"] in {"loading", "ready", "error"}
    assert body["device"]["kind"] in {"cpu", "cuda"}


@pytest.mark.unit
def test_model_info(client: TestClient) -> None:
    resp = client.get("/api/model-info")
    assert resp.status_code == 200
    body = resp.json()
    assert body["model_id"] == "fake/timesfm"
    assert body["compile_count"] == 0
    assert body["queue_depth"] == 0
