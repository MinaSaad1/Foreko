"""Backtest must record candidate failures rather than score a substitute.

Previously a model that raised on a fold had its forecast replaced with a flat
last-value series, which was then scored like any other result. A broken model
came out looking mediocre instead of broken, and any eligibility rule built on
top was reading a number no model produced.
"""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from foreko.services import backtest as backtest_service


def _monthly_csv(n: int = 48) -> str:
    lines = ["Date,Value"]
    for i in range(n):
        year = 2019 + i // 12
        month = (i % 12) + 1
        lines.append(f"{year}-{month:02d}-01,{100 + i * 2}")
    return "\n".join(lines)


def _upload(client: TestClient) -> str:
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.csv", _monthly_csv().encode(), "text/csv")},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _run(client: TestClient, dataset_id: str, models: list[str]) -> dict:
    handle = client.post(
        "/api/backtest/walk-forward",
        json={
            "dataset_id": dataset_id,
            "mapping": {"value_col": "Value", "date_col": "Date"},
            "horizon": 3,
            "folds": 3,
            "models": models,
        },
    )
    assert handle.status_code == 200, handle.text
    job_id = handle.json()["job_id"]

    deadline = time.monotonic() + 20.0
    while time.monotonic() < deadline:
        body = client.get(f"/api/backtest/jobs/{job_id}").json()
        if body["status"] in ("done", "error", "cancelled"):
            return body
        time.sleep(0.05)
    raise TimeoutError("backtest did not settle")


@pytest.mark.unit
def test_failed_model_records_failure_and_does_not_score(client, monkeypatch) -> None:
    real = backtest_service._forecast_one_model

    async def _fail_seasonal_naive(*, model: str, **kwargs):
        if model == "seasonal_naive":
            raise RuntimeError("seasonal_naive exploded")
        return await real(model=model, **kwargs)

    monkeypatch.setattr(backtest_service, "_forecast_one_model", _fail_seasonal_naive)

    dataset_id = _upload(client)
    job = _run(client, dataset_id, ["ets", "seasonal_naive"])
    assert job["status"] == "done"
    result = job["result"]

    reported = sorted((f["model"], f["fold"]) for f in result["failures"])
    assert reported == [("seasonal_naive", 1), ("seasonal_naive", 2), ("seasonal_naive", 3)]

    # No laundered scores: the model produced nothing, so it has no folds and no
    # aggregate. Previously it would have had three plausible-looking MAPEs.
    assert result["fold_details"]["seasonal_naive"] == []
    assert "seasonal_naive" not in result["aggregate"]

    # The healthy candidate is unaffected and still wins.
    assert len(result["fold_details"]["ets"]) == 3
    assert result["winner"] == "ets"


@pytest.mark.unit
def test_a_model_failing_one_fold_cannot_win(client, monkeypatch) -> None:
    real = backtest_service._forecast_one_model
    seen = {"n": 0}

    async def _fail_second_fold(*, model: str, **kwargs):
        if model == "ets":
            seen["n"] += 1
            if seen["n"] == 2:
                raise RuntimeError("transient failure")
        return await real(model=model, **kwargs)

    monkeypatch.setattr(backtest_service, "_forecast_one_model", _fail_second_fold)

    dataset_id = _upload(client)
    job = _run(client, dataset_id, ["ets"])
    result = job["result"]

    # Its surviving folds are a biased sample of the ones it happened to
    # survive, so averaging them is not comparable evidence for a champion.
    assert len(result["failures"]) == 1
    assert len(result["fold_details"]["ets"]) == 2
    assert result["winner"] is None


@pytest.mark.unit
def test_a_clean_run_reports_no_failures(client) -> None:
    dataset_id = _upload(client)
    result = _run(client, dataset_id, ["seasonal_naive"])["result"]
    assert result["failures"] == []
    assert result["winner"] == "seasonal_naive"


@pytest.mark.unit
def test_an_unknown_model_scores_nothing_and_cannot_win(client) -> None:
    dataset_id = _upload(client)
    result = _run(client, dataset_id, ["seasonal_naive", "totally_nonexistent_model"])[
        "result"
    ]
    # It is still reported so the user can see what they asked for, but it has
    # no scores and cannot be selected.
    assert "totally_nonexistent_model" in result["models"]
    assert result["fold_details"]["totally_nonexistent_model"] == []
    assert any(
        f["model"] == "totally_nonexistent_model" for f in result["failures"]
    )
    assert result["winner"] == "seasonal_naive"
