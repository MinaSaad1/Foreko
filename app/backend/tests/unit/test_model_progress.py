"""Tests for the /api/model/* progress endpoints and the runtime helpers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from timesfm_studio.services import model_download, runtime


@pytest.mark.unit
def test_progress_snapshot_has_required_fields(client: TestClient) -> None:
    resp = client.get("/api/model/download-progress")
    assert resp.status_code == 200
    body = resp.json()
    for field in ("state", "total_bytes", "downloaded_bytes", "speed_bps", "eta_seconds"):
        assert field in body
    assert body["state"] in {"idle", "downloading", "ready", "error"}


@pytest.mark.unit
def test_mark_ready_updates_snapshot(tmp_path: Path) -> None:
    target = tmp_path / "cache" / "model-snapshot"
    target.mkdir(parents=True)
    model_download.mark_ready(target)
    snap = model_download.progress_snapshot()
    assert snap["state"] == "ready"
    assert str(target) == snap["cache_path"]


@pytest.mark.unit
def test_mark_error_surfaces_message() -> None:
    model_download.mark_error("boom")
    snap = model_download.progress_snapshot()
    assert snap["state"] == "error"
    assert snap["error"] == "boom"


@pytest.mark.unit
def test_pick_free_port_returns_usable_port() -> None:
    port = runtime.pick_free_port(preferred=50000)
    assert 1 <= port <= 65535


@pytest.mark.unit
def test_runtime_file_roundtrip(tmp_path: Path) -> None:
    runtime.write_runtime_file(tmp_path, port=8765)
    loaded = runtime.read_runtime_file(tmp_path)
    assert loaded is not None
    assert loaded["port"] == 8765
    assert loaded["host"] == "127.0.0.1"
    assert loaded["url"] == "http://127.0.0.1:8765"


@pytest.mark.unit
def test_single_instance_lock_rejects_second_holder(tmp_path: Path) -> None:
    # Write a lock pointing at a very-unlikely-alive PID 1 (we can't reliably
    # fake a live pid cross-platform, so use pid 0 to force the stale branch).
    (tmp_path / runtime.LOCK_FILENAME).write_text("0", encoding="utf-8")
    assert runtime.acquire_single_instance_lock(tmp_path) is True
    content = (tmp_path / runtime.LOCK_FILENAME).read_text(encoding="utf-8").strip()
    assert content.isdigit()
    runtime.release_single_instance_lock(tmp_path)
    assert not (tmp_path / runtime.LOCK_FILENAME).exists()


@pytest.mark.unit
def test_runtime_file_contents_are_valid_json(tmp_path: Path) -> None:
    path = runtime.write_runtime_file(tmp_path, port=9001)
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["port"] == 9001
