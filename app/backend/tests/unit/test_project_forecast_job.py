"""API tests for the Forecast stage job and its factor-plan gate."""

from __future__ import annotations

import io
import time
from typing import Any

import pytest


def _csv(rows: int = 48, with_price: bool = False) -> bytes:
    header = "month,sales,region" + (",price" if with_price else "")
    lines = [header]
    for index, region in enumerate(("egypt", "uae")):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            row = f"{year}-{month:02d}-01,{100 + i * 2 + index * 50},{region}"
            if with_price:
                row += f",{10 + i * 0.1:.2f}"
            lines.append(row)
    return "\n".join(lines).encode("utf-8")


def _upload(client, content: bytes | None = None) -> str:
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.csv", io.BytesIO(content or _csv()), "text/csv")},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _project(client, dataset_id: str, roles: dict[str, str] | None = None) -> str:
    project = client.post(
        "/api/projects", json={"name": "Forecast", "dataset_id": dataset_id}
    ).json()
    created = client.post(
        f"/api/projects/{project['id']}/revisions",
        json={
            "mapping": {
                "date_col": "month",
                "value_col": "sales",
                "series_id_col": "region",
            },
            "frequency": "MS",
            "horizon": 3,
            "preparation_steps": [],
            "candidate_models": ["seasonal_naive"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": roles or {},
        },
    )
    assert created.status_code == 201, created.text
    return project["id"]


def _await(client, job_id: str, timeout: float = 30.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/project-jobs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish")


def _through_validate(client, project_id: str) -> None:
    prepare = client.post(f"/api/projects/{project_id}/prepare").json()
    assert _await(client, prepare["job_id"])["status"] == "done"
    validate = client.post(f"/api/projects/{project_id}/validate").json()
    assert _await(client, validate["job_id"])["status"] == "done"


@pytest.mark.unit
def test_baseline_forecast_covers_every_series(client) -> None:
    project_id = _project(client, _upload(client))
    _through_validate(client, project_id)

    started = client.post(f"/api/projects/{project_id}/forecast", json={})
    assert started.status_code == 202, started.text
    job = _await(client, started.json()["job_id"])
    assert job["status"] == "done", job

    result = job["result"]
    assert result["series_count"] == 2
    assert result["exception_count"] == 0
    assert {s["series_id"] for s in result["series"]} == {"egypt", "uae"}
    for series in result["series"]:
        assert len(series["point"]) == 3
        assert len(series["dates"]) == 3

    workflow = client.get(f"/api/projects/{project_id}/workflow").json()
    assert workflow["stages"]["forecast"]["status"] == "complete"


@pytest.mark.unit
def test_forecast_is_blocked_until_validation_completes(client) -> None:
    project_id = _project(client, _upload(client))
    prepare = client.post(f"/api/projects/{project_id}/prepare").json()
    _await(client, prepare["job_id"])

    response = client.post(f"/api/projects/{project_id}/forecast", json={})
    assert response.status_code == 409
    assert "Validate" in response.json()["detail"]


@pytest.mark.unit
def test_missing_future_factors_block_the_forecast_and_name_the_gaps(client) -> None:
    dataset_id = _upload(client, _csv(with_price=True))
    project_id = _project(client, dataset_id, roles={"price": "known_future_numerical"})
    _through_validate(client, project_id)

    response = client.post(f"/api/projects/{project_id}/forecast", json={})
    # The model needs price for every future period, and no model runs until the
    # user supplies it or says how to fill it.
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["missing"]
    assert {m["covariate"] for m in detail["missing"]} == {"price"}
    assert len(detail["missing"]) == 3

    # Nothing was run, so no forecast run exists.
    runs = client.get(f"/api/projects/{project_id}/runs").json()
    assert not [r for r in runs if r["stage"] == "forecast"]


@pytest.mark.unit
def test_the_factor_plan_endpoint_states_what_is_required(client) -> None:
    dataset_id = _upload(client, _csv(with_price=True))
    project_id = _project(client, dataset_id, roles={"price": "known_future_numerical"})

    body = client.get(f"/api/projects/{project_id}/factor-plan").json()
    assert body["required"] == ["price"]
    assert len(body["periods"]) == 3
    assert "calendar_month" in body["calendar"]


@pytest.mark.unit
def test_supplying_the_factors_lets_the_forecast_run(client) -> None:
    dataset_id = _upload(client, _csv(with_price=True))
    project_id = _project(client, dataset_id, roles={"price": "known_future_numerical"})
    _through_validate(client, project_id)

    periods = client.get(f"/api/projects/{project_id}/factor-plan").json()["periods"]
    started = client.post(
        f"/api/projects/{project_id}/forecast",
        json={"values": {"price": {p: 15.0 for p in periods}}},
    )
    assert started.status_code == 202, started.text
    job = _await(client, started.json()["job_id"])

    assert job["status"] == "done"
    assert job["result"]["assumptions"]["price"] == {p: 15.0 for p in periods}
    assert job["result"]["applied_fills"] == []


@pytest.mark.unit
def test_an_explicit_fill_policy_is_recorded_in_the_run(client) -> None:
    dataset_id = _upload(client, _csv(with_price=True))
    project_id = _project(client, dataset_id, roles={"price": "known_future_numerical"})
    _through_validate(client, project_id)

    periods = client.get(f"/api/projects/{project_id}/factor-plan").json()["periods"]
    started = client.post(
        f"/api/projects/{project_id}/forecast",
        json={
            "values": {"price": {periods[0]: 15.0}},
            "fill_policies": {"price": "forward_fill"},
        },
    )
    job = _await(client, started.json()["job_id"])
    assert job["status"] == "done"

    fills = job["result"]["applied_fills"]
    # The assumption must be visible in the run, not implied by its absence.
    assert fills == [
        {"covariate": "price", "policy": "forward_fill", "periods": periods[1:]}
    ]
    assert job["result"]["assumptions"]["price"][periods[2]] == 15.0


@pytest.mark.unit
def test_the_forecast_run_records_its_artifact_and_revision(client) -> None:
    project_id = _project(client, _upload(client))
    _through_validate(client, project_id)
    started = client.post(f"/api/projects/{project_id}/forecast", json={}).json()
    _await(client, started["job_id"])

    runs = client.get(f"/api/projects/{project_id}/runs").json()
    forecast_runs = [r for r in runs if r["stage"] == "forecast"]
    assert len(forecast_runs) == 1
    assert forecast_runs[0]["status"] == "done"
    assert forecast_runs[0]["revision_no"] == 1
    assert forecast_runs[0]["artifact_path"].endswith("forecast.json")
