"""Comprehensive integration tests for walk-forward backtest and calibration.

Coverage:
- Happy paths: classical models, timesfm (fake), all models, various data sizes
- Result structure: required keys, metric types, fold counts, per-horizon length
- Caching: identical params hit cache; different params create new job
- Job lifecycle: polling, 404 on missing IDs, 409 on bad cancel
- SSE streaming: done/error reconnect events carry correct payloads
- Data validation: bad column names, constant values, non-numeric, bad dates, too few rows
- Date mapping: date_col string, year+month parts, year+month+day, named months
- Edge cases: unknown model graceful fallback, schema bounds (horizon/folds limits)
- Calibration: happy path, caching, dataset not found, too few rows, nominal levels
"""

from __future__ import annotations

import json
import math
import time

import pandas as pd
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _monthly_csv(
    n: int,
    *,
    date_col: str = "Date",
    val_col: str = "Value",
    start: str = "2018-01-01",
    base: float = 100.0,
) -> str:
    """Generate a monotonically increasing monthly CSV with n rows."""
    dates = pd.date_range(start, periods=n, freq="MS")
    rows = [f"{date_col},{val_col}"]
    for i, d in enumerate(dates):
        rows.append(f"{d.strftime('%Y-%m-%d')},{base + i * 3.7:.2f}")
    return "\n".join(rows)


def _year_month_csv(
    n: int,
    *,
    year_col: str = "Year",
    month_col: str = "Month",
    val_col: str = "Value",
) -> str:
    """Generate a year+month parts CSV with abbreviated month names."""
    dates = pd.date_range("2018-01-01", periods=n, freq="MS")
    rows = [f"{year_col},{month_col},{val_col}"]
    for i, d in enumerate(dates):
        rows.append(f"{d.year},{d.strftime('%b')},{100 + i * 2.5:.2f}")
    return "\n".join(rows)


def _upload(client: TestClient, csv_text: str, filename: str = "test.csv") -> str:
    r = client.post(
        "/api/datasets/upload",
        files={"file": (filename, csv_text.encode(), "text/csv")},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _start_backtest(
    client: TestClient,
    dataset_id: str,
    *,
    mapping: dict | None = None,
    horizon: int = 6,
    folds: int = 2,
    models: list[str] | None = None,
) -> dict:
    if mapping is None:
        mapping = {"value_col": "Value", "date_col": "Date"}
    if models is None:
        models = ["seasonal_naive"]
    r = client.post(
        "/api/backtest/walk-forward",
        json={
            "dataset_id": dataset_id,
            "mapping": mapping,
            "horizon": horizon,
            "folds": folds,
            "models": models,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _poll_job(client: TestClient, job_id: str, *, timeout: float = 10.0) -> dict:
    """Poll GET /backtest/jobs/{id} until the job reaches a terminal state."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = client.get(f"/api/backtest/jobs/{job_id}")
        assert r.status_code == 200
        data = r.json()
        if data["status"] in ("done", "error", "cancelled"):
            return data
        time.sleep(0.05)
    raise TimeoutError(f"Job {job_id} did not settle within {timeout}s")


def _parse_sse(text: str) -> list[dict]:
    """Extract JSON payloads from raw SSE response text."""
    events: list[dict] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("data: "):
            events.append(json.loads(stripped[6:]))
    return events


# Reusable default mapping
_MAPPING = {"value_col": "Value", "date_col": "Date"}


# ---------------------------------------------------------------------------
# Section 1 – Happy paths
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_backtest_classical_models_completes(client: TestClient) -> None:
    """Three classical models complete without error on 36 monthly rows."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(
        client, did, models=["seasonal_naive", "ets", "arima"], horizon=6, folds=2
    )
    assert handle["status"] in ("running", "done")
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    assert job["result"] is not None


@pytest.mark.unit
def test_backtest_with_timesfm_fake_model(client: TestClient) -> None:
    """timesfm runs through FakeModelRegistry and appears in aggregate results."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(
        client, did, models=["timesfm", "seasonal_naive"], horizon=6, folds=2
    )
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    assert "timesfm" in job["result"]["aggregate"]
    assert "seasonal_naive" in job["result"]["aggregate"]


@pytest.mark.unit
def test_backtest_four_models_all_present_in_result(client: TestClient) -> None:
    """All four selected models appear in result['models'] and aggregate."""
    did = _upload(client, _monthly_csv(48))
    models = ["timesfm", "lightgbm", "seasonal_naive", "ets"]
    handle = _start_backtest(client, did, models=models, horizon=6, folds=3)
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    assert set(job["result"]["models"]) == set(models)
    for m in models:
        assert m in job["result"]["aggregate"]


@pytest.mark.unit
def test_backtest_single_fold_minimal_data(client: TestClient) -> None:
    """Exactly min_train+horizon rows (24) succeeds with folds=1 and horizon=12."""
    did = _upload(client, _monthly_csv(24))
    handle = _start_backtest(
        client, did, models=["seasonal_naive"], horizon=12, folds=1
    )
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    assert job["result"]["folds"] == 1


@pytest.mark.unit
def test_backtest_auto_fold_reduction(client: TestClient) -> None:
    """Requesting more folds than the data can support silently reduces fold count."""
    # 30 rows, horizon=6 → min_train=12; available=(30-12)//6=3 → max 3 folds
    did = _upload(client, _monthly_csv(30))
    handle = _start_backtest(
        client, did, models=["seasonal_naive"], horizon=6, folds=5
    )
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    assert job["result"]["folds"] <= 3


@pytest.mark.unit
def test_backtest_horizon_one(client: TestClient) -> None:
    """Minimum valid horizon of 1 completes successfully."""
    did = _upload(client, _monthly_csv(24))
    handle = _start_backtest(
        client, did, models=["seasonal_naive"], horizon=1, folds=1
    )
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"


@pytest.mark.unit
def test_backtest_large_horizon_with_sufficient_data(client: TestClient) -> None:
    """horizon=24 with 60 rows is valid (min_train=24, need 48 for 1 fold)."""
    did = _upload(client, _monthly_csv(60))
    handle = _start_backtest(
        client, did, models=["seasonal_naive"], horizon=24, folds=1
    )
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"


# ---------------------------------------------------------------------------
# Section 2 – Result structure and metric validity
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_backtest_result_has_required_top_level_keys(client: TestClient) -> None:
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(client, did, models=["seasonal_naive"], horizon=6, folds=2)
    job = _poll_job(client, handle["job_id"])
    result = job["result"]
    for key in ("horizon", "folds", "models", "aggregate", "per_horizon_mape",
                "fold_details", "winner"):
        assert key in result, f"Missing top-level key: {key!r}"


@pytest.mark.unit
def test_backtest_aggregate_has_all_metric_keys(client: TestClient) -> None:
    """Each model entry in aggregate contains all nine expected metric keys."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(
        client, did, models=["seasonal_naive", "ets"], horizon=6, folds=2
    )
    job = _poll_job(client, handle["job_id"])
    expected = {
        "mape_mean", "mape_std", "smape_mean", "rmse_mean",
        "mae_mean", "mase_mean", "pinball_10_mean", "pinball_50_mean", "pinball_90_mean",
    }
    for model, agg in job["result"]["aggregate"].items():
        missing = expected - set(agg)
        assert not missing, f"Model {model!r} aggregate missing keys: {missing}"


@pytest.mark.unit
def test_backtest_metrics_are_finite_and_nonnegative(client: TestClient) -> None:
    """MAPE, RMSE, MAE, sMAPE are all finite non-negative floats."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(client, did, models=["seasonal_naive"], horizon=6, folds=2)
    job = _poll_job(client, handle["job_id"])
    agg = job["result"]["aggregate"]["seasonal_naive"]
    for key in ("mape_mean", "rmse_mean", "mae_mean", "smape_mean"):
        v = agg[key]
        assert math.isfinite(v), f"{key}={v} is not finite"
        assert v >= 0.0, f"{key}={v} is negative"


@pytest.mark.unit
def test_backtest_per_horizon_mape_length_matches_horizon(client: TestClient) -> None:
    """per_horizon_mape has exactly `horizon` entries for every model."""
    did = _upload(client, _monthly_csv(36))
    horizon = 6
    handle = _start_backtest(
        client, did, models=["seasonal_naive"], horizon=horizon, folds=2
    )
    job = _poll_job(client, handle["job_id"])
    for model, values in job["result"]["per_horizon_mape"].items():
        assert len(values) == horizon, (
            f"{model}: expected {horizon} per-horizon values, got {len(values)}"
        )


@pytest.mark.unit
def test_backtest_winner_equals_lowest_mape_model(client: TestClient) -> None:
    """result['winner'] is the model with the lowest mape_mean in aggregate."""
    did = _upload(client, _monthly_csv(48))
    handle = _start_backtest(
        client, did, models=["timesfm", "seasonal_naive", "ets"], horizon=6, folds=2
    )
    job = _poll_job(client, handle["job_id"])
    result = job["result"]
    if result["winner"] and result["aggregate"]:
        best = min(result["aggregate"], key=lambda m: result["aggregate"][m]["mape_mean"])
        assert result["winner"] == best


@pytest.mark.unit
def test_backtest_fold_details_have_correct_count_and_fields(client: TestClient) -> None:
    """fold_details[model] contains exactly folds entries, each with required keys."""
    did = _upload(client, _monthly_csv(36))
    folds = 2
    handle = _start_backtest(
        client, did, models=["seasonal_naive"], horizon=6, folds=folds
    )
    job = _poll_job(client, handle["job_id"])
    for model, fold_list in job["result"]["fold_details"].items():
        assert len(fold_list) == folds, (
            f"{model}: expected {folds} folds, got {len(fold_list)}"
        )
        for f in fold_list:
            for key in ("fold", "mape", "smape", "rmse", "mae", "mase",
                        "pinball_10", "pinball_50", "pinball_90"):
                assert key in f, f"fold entry for {model!r} missing key {key!r}"


@pytest.mark.unit
def test_backtest_result_horizon_matches_request(client: TestClient) -> None:
    """result['horizon'] echoes the requested horizon for several values."""
    did = _upload(client, _monthly_csv(48))
    for h in (3, 6, 12):
        handle = _start_backtest(
            client, did, models=["seasonal_naive"], horizon=h, folds=1
        )
        job = _poll_job(client, handle["job_id"])
        assert job["status"] == "done"
        assert job["result"]["horizon"] == h


@pytest.mark.unit
def test_backtest_single_model_winner_is_that_model(client: TestClient) -> None:
    """When exactly one model is run, winner must equal that model."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(client, did, models=["ets"], horizon=6, folds=2)
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    assert job["result"]["winner"] == "ets"


# ---------------------------------------------------------------------------
# Section 3 – Caching
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_cached_result_returned_immediately_on_second_call(client: TestClient) -> None:
    """Second POST with identical params returns status='done' without a new job run."""
    did = _upload(client, _monthly_csv(36))
    params = {
        "dataset_id": did,
        "mapping": _MAPPING,
        "horizon": 6,
        "folds": 2,
        "models": ["seasonal_naive"],
    }
    r1 = client.post("/api/backtest/walk-forward", json=params)
    assert r1.status_code == 200
    _poll_job(client, r1.json()["job_id"])

    r2 = client.post("/api/backtest/walk-forward", json=params)
    assert r2.status_code == 200
    assert r2.json()["status"] == "done"  # cache hit — no polling needed


@pytest.mark.unit
def test_different_params_bypass_cache(client: TestClient) -> None:
    """Changing any param (e.g. folds) creates a distinct new job."""
    did = _upload(client, _monthly_csv(36))
    base = {"dataset_id": did, "mapping": _MAPPING, "horizon": 6, "models": ["seasonal_naive"]}
    r1 = client.post("/api/backtest/walk-forward", json={**base, "folds": 2})
    _poll_job(client, r1.json()["job_id"])

    r2 = client.post("/api/backtest/walk-forward", json={**base, "folds": 3})
    assert r2.json()["job_id"] != r1.json()["job_id"]


# ---------------------------------------------------------------------------
# Section 4 – Job lifecycle and REST polling
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_get_job_not_found_returns_404(client: TestClient) -> None:
    r = client.get("/api/backtest/jobs/no-such-job-id")
    assert r.status_code == 404


@pytest.mark.unit
def test_get_job_events_not_found_returns_404(client: TestClient) -> None:
    r = client.get("/api/backtest/jobs/no-such-job-id/events")
    assert r.status_code == 404


@pytest.mark.unit
def test_cancel_completed_job_returns_409(client: TestClient) -> None:
    """Cancelling a job that has already finished returns 409 Conflict."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(client, did, models=["seasonal_naive"], horizon=6, folds=2)
    _poll_job(client, handle["job_id"])
    r = client.post(f"/api/backtest/jobs/{handle['job_id']}/cancel")
    assert r.status_code == 409


@pytest.mark.unit
def test_cancel_nonexistent_job_returns_409(client: TestClient) -> None:
    r = client.post("/api/backtest/jobs/completely-made-up-id/cancel")
    assert r.status_code == 409


@pytest.mark.unit
def test_job_status_response_has_required_fields(client: TestClient) -> None:
    """GET /jobs/{id} always includes job_id, kind, status, and progress."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(client, did, models=["seasonal_naive"], horizon=6, folds=2)
    job = _poll_job(client, handle["job_id"])
    for key in ("job_id", "kind", "status", "progress"):
        assert key in job
    assert job["progress"]["current"] >= 0
    assert job["progress"]["total"] >= 0


# ---------------------------------------------------------------------------
# Section 5 – SSE streaming (reconnect on already-settled jobs)
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_sse_done_job_emits_state_and_done_events(client: TestClient) -> None:
    """Connecting to SSE after completion delivers a state event then a done event."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(client, did, models=["seasonal_naive"], horizon=6, folds=2)
    _poll_job(client, handle["job_id"])

    r = client.get(f"/api/backtest/jobs/{handle['job_id']}/events")
    assert r.status_code == 200
    events = _parse_sse(r.text)
    types = [e["type"] for e in events]
    assert "state" in types
    assert "done" in types

    state_ev = next(e for e in events if e["type"] == "state")
    assert state_ev["status"] == "done"

    done_ev = next(e for e in events if e["type"] == "done")
    assert done_ev.get("result") is not None


@pytest.mark.unit
def test_sse_error_job_emits_state_and_error_events(client: TestClient) -> None:
    """Connecting to SSE after a failed job delivers state+error events with error text."""
    # Trigger validation error: 10 rows, horizon=12 → cannot form fold
    did = _upload(client, _monthly_csv(10))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 12, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    _poll_job(client, job_id)

    sse_r = client.get(f"/api/backtest/jobs/{job_id}/events")
    assert sse_r.status_code == 200
    events = _parse_sse(sse_r.text)
    types = [e["type"] for e in events]
    assert "state" in types
    assert "error" in types

    error_ev = next(e for e in events if e["type"] == "error")
    assert error_ev.get("error"), "error event should carry a non-empty error string"


# ---------------------------------------------------------------------------
# Section 6 – Data validation errors
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_backtest_unknown_dataset_id_errors_job(client: TestClient) -> None:
    """A dataset_id that does not exist causes the job to reach error status."""
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": "deadbeef" * 4, "mapping": _MAPPING,
              "horizon": 6, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "error"
    assert job["error"]


@pytest.mark.unit
def test_backtest_missing_value_column_errors_with_column_name(client: TestClient) -> None:
    """Mapping to a non-existent value column errors and names the missing column."""
    did = _upload(client, _monthly_csv(36))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did,
              "mapping": {"value_col": "DoesNotExist", "date_col": "Date"},
              "horizon": 6, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "error"
    assert "DoesNotExist" in (job["error"] or "")


@pytest.mark.unit
def test_backtest_constant_value_series_rejected(client: TestClient) -> None:
    """A value column where every row is the same number is rejected as unforecastable."""
    dates = pd.date_range("2018-01-01", periods=36, freq="MS")
    rows = ["Date,Value"] + [f"{d.strftime('%Y-%m-%d')},42.0" for d in dates]
    did = _upload(client, "\n".join(rows))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 6, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "error"
    assert "constant" in (job["error"] or "").lower()


@pytest.mark.unit
def test_backtest_non_numeric_value_column_rejected(client: TestClient) -> None:
    """Mapping backtest to a text column causes the job to error with a validation message."""
    # Upload succeeds because there IS a numeric column (Revenue).
    # Backtest fails because we map value_col to the non-numeric Notes column.
    dates = pd.date_range("2018-01-01", periods=24, freq="MS")
    rows = ["Date,Revenue,Notes"]
    for i, d in enumerate(dates):
        rows.append(f"{d.strftime('%Y-%m-%d')},{100 + i},label_{i}")
    did = _upload(client, "\n".join(rows))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did,
              "mapping": {"value_col": "Notes", "date_col": "Date"},
              "horizon": 6, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "error"


@pytest.mark.unit
def test_backtest_unparseable_dates_rejected(client: TestClient) -> None:
    """Date column containing garbage strings causes an error."""
    rows = ["Date,Value"] + [f"garbage-date-{i},{i * 5 + 10}" for i in range(24)]
    did = _upload(client, "\n".join(rows))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 6, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "error"


@pytest.mark.unit
def test_backtest_too_few_rows_for_any_fold_errors_with_hint(client: TestClient) -> None:
    """Dataset too small to form even 1 fold errors with an actionable message."""
    # horizon=12, min_train=12, need 24 rows; provide only 10
    did = _upload(client, _monthly_csv(10))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 12, "folds": 1, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "error"
    assert job["error"]
    err = (job["error"] or "").lower()
    assert any(w in err for w in ("data", "points", "horizon", "fold")), (
        f"Error message lacks context: {job['error']!r}"
    )


@pytest.mark.unit
def test_backtest_duplicate_timestamps_auto_aggregated(client: TestClient) -> None:
    """Duplicate timestamps are summed automatically when series_id_col is absent."""
    # 24 months × 2 duplicate rows each → auto-aggregated to 24 unique months
    dates = pd.date_range("2018-01-01", periods=24, freq="MS")
    rows = ["Date,Value"]
    for i, d in enumerate(dates):
        dstr = d.strftime("%Y-%m-%d")
        rows.append(f"{dstr},{100 + i * 2}")
        rows.append(f"{dstr},{10 + i}")     # duplicate row for same date
    did = _upload(client, "\n".join(rows))
    handle = _start_backtest(client, did, models=["seasonal_naive"], horizon=12, folds=1)
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"


# ---------------------------------------------------------------------------
# Section 7 – Date mapping variations
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_backtest_year_month_parts_mapping(client: TestClient) -> None:
    """date_parts with year_col + month_col works end-to-end."""
    did = _upload(client, _year_month_csv(36), filename="ym.csv")
    r = client.post(
        "/api/backtest/walk-forward",
        json={
            "dataset_id": did,
            "mapping": {
                "value_col": "Value",
                "date_parts": {"year_col": "Year", "month_col": "Month"},
            },
            "horizon": 6, "folds": 2, "models": ["seasonal_naive"],
        },
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "done"


@pytest.mark.unit
def test_backtest_year_month_day_parts_mapping(client: TestClient) -> None:
    """date_parts with year_col + month_col + day_col works end-to-end."""
    dates = pd.date_range("2018-01-01", periods=36, freq="MS")
    rows = ["Year,Month,Day,Value"]
    for i, d in enumerate(dates):
        rows.append(f"{d.year},{d.month},{d.day},{100 + i * 3}")
    did = _upload(client, "\n".join(rows), filename="ymd.csv")
    r = client.post(
        "/api/backtest/walk-forward",
        json={
            "dataset_id": did,
            "mapping": {
                "value_col": "Value",
                "date_parts": {"year_col": "Year", "month_col": "Month", "day_col": "Day"},
            },
            "horizon": 6, "folds": 2, "models": ["seasonal_naive"],
        },
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "done"


@pytest.mark.unit
def test_backtest_full_english_month_names(client: TestClient) -> None:
    """Month column with full English month names is parsed without errors."""
    months = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December",
    ] * 3
    rows = ["Year,Month,Value"]
    for i, m in enumerate(months):
        rows.append(f"{2018 + i // 12},{m},{50 + i * 1.5:.1f}")
    did = _upload(client, "\n".join(rows), filename="named_months.csv")
    r = client.post(
        "/api/backtest/walk-forward",
        json={
            "dataset_id": did,
            "mapping": {
                "value_col": "Value",
                "date_parts": {"year_col": "Year", "month_col": "Month"},
            },
            "horizon": 6, "folds": 2, "models": ["seasonal_naive"],
        },
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "done"


@pytest.mark.unit
def test_backtest_numeric_month_in_date_parts(client: TestClient) -> None:
    """Month column with integer values 1–12 is parsed correctly."""
    dates = pd.date_range("2018-01-01", periods=36, freq="MS")
    rows = ["Year,Month,Value"]
    for i, d in enumerate(dates):
        rows.append(f"{d.year},{d.month},{100 + i}")
    did = _upload(client, "\n".join(rows), filename="numeric_months.csv")
    r = client.post(
        "/api/backtest/walk-forward",
        json={
            "dataset_id": did,
            "mapping": {
                "value_col": "Value",
                "date_parts": {"year_col": "Year", "month_col": "Month"},
            },
            "horizon": 6, "folds": 2, "models": ["seasonal_naive"],
        },
    )
    assert r.status_code == 200
    job = _poll_job(client, r.json()["job_id"])
    assert job["status"] == "done"


# ---------------------------------------------------------------------------
# Section 8 – Edge cases
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_backtest_unknown_model_falls_back_gracefully(client: TestClient) -> None:
    """An unknown model name fails per fold but does not crash the whole backtest."""
    did = _upload(client, _monthly_csv(36))
    handle = _start_backtest(
        client, did,
        models=["seasonal_naive", "totally_nonexistent_model"],
        horizon=6, folds=2,
    )
    job = _poll_job(client, handle["job_id"])
    assert job["status"] == "done"
    # Unknown model still appears in result (with last-value fallback predictions)
    assert "totally_nonexistent_model" in job["result"]["models"]


@pytest.mark.unit
def test_backtest_schema_rejects_horizon_below_minimum(client: TestClient) -> None:
    """horizon=0 violates the ge=1 constraint and returns 422."""
    did = _upload(client, _monthly_csv(36))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 0, "folds": 2, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 422


@pytest.mark.unit
def test_backtest_schema_rejects_horizon_above_maximum(client: TestClient) -> None:
    """horizon=257 violates the le=256 constraint and returns 422."""
    did = _upload(client, _monthly_csv(36))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 257, "folds": 2, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 422


@pytest.mark.unit
def test_backtest_schema_rejects_folds_below_minimum(client: TestClient) -> None:
    """folds=0 violates the ge=1 constraint and returns 422."""
    did = _upload(client, _monthly_csv(36))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 6, "folds": 0, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 422


@pytest.mark.unit
def test_backtest_schema_rejects_folds_above_maximum(client: TestClient) -> None:
    """folds=11 violates the le=10 constraint and returns 422."""
    did = _upload(client, _monthly_csv(36))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 6, "folds": 11, "models": ["seasonal_naive"]},
    )
    assert r.status_code == 422


@pytest.mark.unit
def test_backtest_extra_fields_in_request_rejected(client: TestClient) -> None:
    """extra='forbid' on BacktestRequest means unknown fields return 422."""
    did = _upload(client, _monthly_csv(36))
    r = client.post(
        "/api/backtest/walk-forward",
        json={"dataset_id": did, "mapping": _MAPPING,
              "horizon": 6, "folds": 2, "models": ["seasonal_naive"],
              "sneaky_extra_field": "injected"},
    )
    assert r.status_code == 422


@pytest.mark.unit
def test_backtest_multiple_sequential_jobs_independent(client: TestClient) -> None:
    """Running two backtests in sequence produces two independent results."""
    did = _upload(client, _monthly_csv(36))

    h1 = _start_backtest(client, did, models=["seasonal_naive"], horizon=3, folds=2)
    h2 = _start_backtest(client, did, models=["ets"], horizon=6, folds=1)

    j1 = _poll_job(client, h1["job_id"])
    j2 = _poll_job(client, h2["job_id"])

    assert j1["status"] == "done"
    assert j2["status"] == "done"
    assert j1["job_id"] != j2["job_id"]
    assert j1["result"]["horizon"] == 3
    assert j2["result"]["horizon"] == 6


# ---------------------------------------------------------------------------
# Section 9 – Calibration endpoint
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_calibration_happy_path(client: TestClient) -> None:
    """Calibration returns a reliability diagram with empirical coverages in [0, 1]."""
    # min_train=max(12*2,24)=24; need 24+12=36 rows for 1 fold
    did = _upload(client, _monthly_csv(48))
    r = client.post(
        "/api/backtest/calibration",
        json={"dataset_id": did, "mapping": _MAPPING, "horizon": 12, "folds": 1},
    )
    assert r.status_code == 200
    body = r.json()
    for key in ("reliability", "n_observations", "folds", "horizon"):
        assert key in body, f"Missing calibration key: {key!r}"
    assert len(body["reliability"]) > 0
    assert body["n_observations"] > 0
    for point in body["reliability"]:
        assert 0.0 <= point["empirical"] <= 1.0
        assert "nominal" in point and "empirical" in point


@pytest.mark.unit
def test_calibration_nominal_levels_are_valid(client: TestClient) -> None:
    """Nominal coverage levels in the reliability output are a subset of {0.2,0.4,0.6,0.8}."""
    did = _upload(client, _monthly_csv(48))
    r = client.post(
        "/api/backtest/calibration",
        json={"dataset_id": did, "mapping": _MAPPING, "horizon": 12, "folds": 1},
    )
    assert r.status_code == 200
    nominals = {pt["nominal"] for pt in r.json()["reliability"]}
    valid = {0.2, 0.4, 0.6, 0.8}
    assert nominals.issubset(valid), (
        f"Unexpected nominal levels: {nominals - valid}"
    )


@pytest.mark.unit
def test_calibration_cached_result_is_identical(client: TestClient) -> None:
    """Identical calibration requests return the exact same result from cache."""
    did = _upload(client, _monthly_csv(48))
    params = {"dataset_id": did, "mapping": _MAPPING, "horizon": 12, "folds": 1}
    r1 = client.post("/api/backtest/calibration", json=params)
    r2 = client.post("/api/backtest/calibration", json=params)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()


@pytest.mark.unit
def test_calibration_dataset_not_found_returns_error(client: TestClient) -> None:
    """Calibration with a non-existent dataset_id returns an HTTP error status."""
    r = client.post(
        "/api/backtest/calibration",
        json={"dataset_id": "deadbeef" * 4, "mapping": _MAPPING, "horizon": 12, "folds": 1},
    )
    assert r.status_code >= 400


@pytest.mark.unit
def test_calibration_too_few_rows_returns_error(client: TestClient) -> None:
    """Dataset too small for calibration (n=10, need 36) returns an HTTP error status."""
    did = _upload(client, _monthly_csv(10))
    r = client.post(
        "/api/backtest/calibration",
        json={"dataset_id": did, "mapping": _MAPPING, "horizon": 12, "folds": 1},
    )
    assert r.status_code >= 400


@pytest.mark.unit
def test_calibration_different_horizons_produce_different_results(client: TestClient) -> None:
    """Changing the horizon produces different calibration output (different n_obs)."""
    did = _upload(client, _monthly_csv(72))
    r6 = client.post(
        "/api/backtest/calibration",
        json={"dataset_id": did, "mapping": _MAPPING, "horizon": 6, "folds": 2},
    )
    r12 = client.post(
        "/api/backtest/calibration",
        json={"dataset_id": did, "mapping": _MAPPING, "horizon": 12, "folds": 2},
    )
    assert r6.status_code == 200
    assert r12.status_code == 200
    assert r6.json()["horizon"] == 6
    assert r12.json()["horizon"] == 12
    assert r6.json()["n_observations"] != r12.json()["n_observations"]
