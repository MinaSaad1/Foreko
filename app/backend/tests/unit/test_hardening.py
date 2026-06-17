"""Tests for the 1.0 hardening work: path-traversal guards, the
minimum-series-length guard, the upload size cap, and the dataset TTL janitor.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from foreko.main import create_app
from foreko.services import dataset_store, janitor
from foreko.services.paths import validate_segment
from foreko.services.series import ensure_min_length
from foreko.settings import Settings

from ..conftest import FakeModelRegistry


# --------------------------------------------------------------------------
# Path-traversal guard
# --------------------------------------------------------------------------


@pytest.mark.unit
@pytest.mark.parametrize(
    "good",
    ["0123456789abcdef0123456789abcdef", "abc-123_DEF", "dataset.v1"],
)
def test_validate_segment_accepts_safe_ids(good: str) -> None:
    assert validate_segment(good) == good


@pytest.mark.unit
@pytest.mark.parametrize(
    "bad",
    ["", ".", "..", "../models", "..\\..\\models", "a/b", "a\\b", "C:\\x", "a:b"],
)
def test_validate_segment_rejects_traversal(bad: str) -> None:
    with pytest.raises(ValueError):
        validate_segment(bad)


@pytest.mark.unit
def test_dataset_dir_rejects_traversal(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        dataset_store.dataset_dir(tmp_path, "..\\..\\models")


# --------------------------------------------------------------------------
# Minimum-series-length guard
# --------------------------------------------------------------------------


@pytest.mark.unit
def test_ensure_min_length_rejects_short_series() -> None:
    short = [np.arange(8, dtype=float)]
    with pytest.raises(ValueError, match="needs at least"):
        ensure_min_length(["series"], short, horizon=12)


@pytest.mark.unit
def test_ensure_min_length_allows_adequate_series() -> None:
    ok = [np.arange(30, dtype=float)]
    ensure_min_length(["series"], ok, horizon=12)  # no raise


@pytest.mark.unit
def test_short_series_forecast_returns_422_not_fake_forecast(client: TestClient) -> None:
    """A series shorter than 2x horizon must error, not return padded zeros."""

    # 12 rows clears the upload's >=10-row check, but a horizon of 12 needs
    # 24 points, so the forecast-time guard must reject it.
    rows = "\n".join(f"2021-{m:02d}-01,{10 * m}" for m in range(1, 13))  # 12 rows
    csv = f"Date,QTY\n{rows}\n".encode()
    up = client.post(
        "/api/datasets/upload",
        files={"file": ("short.csv", csv, "text/csv")},
    )
    assert up.status_code == 200, up.text
    dataset_id = up.json()["id"]

    resp = client.post(
        "/api/forecast",
        json={
            "dataset_id": dataset_id,
            "mapping": {"date_col": "Date", "value_col": "QTY"},
            "horizon": 12,
        },
    )
    assert resp.status_code == 422, resp.text
    assert "needs at least" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Upload size cap (enforced before/while buffering)
# --------------------------------------------------------------------------


@pytest.mark.unit
def test_upload_over_cap_returns_413(tmp_path: Path) -> None:
    settings = Settings(
        storage_dir=tmp_path / "foreko",
        preload_model=False,
        max_upload_bytes=1024,
    )
    settings.ensure_dirs()
    app = create_app(settings=settings)
    from foreko.deps import get_registry

    fake = FakeModelRegistry()
    app.dependency_overrides[get_registry] = lambda: fake
    with TestClient(app) as c:
        c.app.state.registry = fake
        oversized = b"Date,QTY\n" + b"2021-01-01,1\n" * 500  # > 1 KB
        resp = c.post(
            "/api/datasets/upload",
            files={"file": ("big.csv", oversized, "text/csv")},
        )
    assert resp.status_code == 413, resp.text


# --------------------------------------------------------------------------
# Dataset TTL janitor
# --------------------------------------------------------------------------


def _write_dataset(datasets_dir: Path, name: str, uploaded_at: datetime) -> None:
    d = datasets_dir / name
    d.mkdir(parents=True)
    (d / "meta.json").write_text(
        json.dumps({"id": name, "uploaded_at": uploaded_at.isoformat()}),
        encoding="utf-8",
    )


@pytest.mark.unit
def test_janitor_removes_expired_keeps_recent(tmp_path: Path) -> None:
    datasets_dir = tmp_path / "datasets"
    datasets_dir.mkdir()
    now = datetime.now(timezone.utc)
    _write_dataset(datasets_dir, "old", now - timedelta(hours=48))
    _write_dataset(datasets_dir, "fresh", now - timedelta(hours=1))

    removed = janitor.sweep_expired_datasets(datasets_dir, ttl_hours=24)

    assert removed == 1
    assert not (datasets_dir / "old").exists()
    assert (datasets_dir / "fresh").exists()


@pytest.mark.unit
def test_janitor_disabled_when_ttl_not_positive(tmp_path: Path) -> None:
    datasets_dir = tmp_path / "datasets"
    datasets_dir.mkdir()
    _write_dataset(datasets_dir, "old", datetime.now(timezone.utc) - timedelta(days=900))

    removed = janitor.sweep_expired_datasets(datasets_dir, ttl_hours=0)

    assert removed == 0
    assert (datasets_dir / "old").exists()


@pytest.mark.unit
def test_janitor_keeps_datasets_with_unparseable_timestamp(tmp_path: Path) -> None:
    datasets_dir = tmp_path / "datasets"
    d = datasets_dir / "weird"
    d.mkdir(parents=True)
    (d / "meta.json").write_text(json.dumps({"id": "weird"}), encoding="utf-8")

    removed = janitor.sweep_expired_datasets(datasets_dir, ttl_hours=24)

    assert removed == 0
    assert d.exists()
