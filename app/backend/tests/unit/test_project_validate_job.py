"""API tests for the Validate stage job."""

from __future__ import annotations

import io
import time
from typing import Any

import pytest


def _csv(rows: int = 48, regions=("egypt", "uae")) -> bytes:
    lines = ["month,sales,region"]
    for index, region in enumerate(regions):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            lines.append(f"{year}-{month:02d}-01,{100 + i * 2 + index * 50},{region}")
    return "\n".join(lines).encode("utf-8")


def _upload(client) -> str:
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.csv", io.BytesIO(_csv()), "text/csv")},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _project(client, dataset_id: str, **overrides: Any) -> str:
    project = client.post(
        "/api/projects", json={"name": "Validate", "dataset_id": dataset_id}
    ).json()
    body = {
        "mapping": {
            "date_col": "month",
            "value_col": "sales",
            "series_id_col": "region",
        },
        "frequency": "MS",
        "horizon": 3,
        "preparation_steps": [],
        "candidate_models": ["seasonal_naive", "ets"],
        "folds": 2,
        "primary_metric": "mase",
        "covariate_roles": {},
    }
    body.update(overrides)
    created = client.post(f"/api/projects/{project['id']}/revisions", json=body)
    assert created.status_code == 201, created.text
    return project["id"]


def _await(client, job_id: str, timeout: float = 30.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/project-jobs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish within {timeout}s")


def _prepare(client, project_id: str) -> None:
    job = client.post(f"/api/projects/{project_id}/prepare").json()
    assert _await(client, job["job_id"])["status"] == "done"


@pytest.mark.unit
def test_validate_selects_a_policy_for_every_series(client) -> None:
    project_id = _project(client, _upload(client))
    _prepare(client, project_id)

    started = client.post(f"/api/projects/{project_id}/validate")
    assert started.status_code == 202, started.text
    job = _await(client, started.json()["job_id"])
    assert job["status"] == "done", job

    result = job["result"]
    assert result["primary_metric"] == "mase"
    assert set(result["series_policies"]) == {"egypt", "uae"}
    for policy in result["series_policies"].values():
        assert policy["champion"] in ("seasonal_naive", "ets", "ensemble")
        assert policy["reason"]
    assert result["portfolio_metrics"]["mase"] is not None

    workflow = client.get(f"/api/projects/{project_id}/workflow").json()
    assert workflow["stages"]["validate"]["status"] == "complete"
    assert workflow["next_stage"] == "forecast"


@pytest.mark.unit
def test_validate_is_blocked_until_prepare_completes(client) -> None:
    project_id = _project(client, _upload(client))

    response = client.post(f"/api/projects/{project_id}/validate")
    # A stage cannot run before its dependency, and the refusal must say why.
    assert response.status_code == 409
    assert "Prepare" in response.json()["detail"]


@pytest.mark.unit
def test_validate_requires_a_revision(client) -> None:
    dataset_id = _upload(client)
    project = client.post(
        "/api/projects", json={"name": "Bare", "dataset_id": dataset_id}
    ).json()
    assert client.post(f"/api/projects/{project['id']}/validate").status_code == 409


@pytest.mark.unit
def test_validate_writes_an_immutable_run_artifact(client) -> None:
    project_id = _project(client, _upload(client))
    _prepare(client, project_id)
    started = client.post(f"/api/projects/{project_id}/validate").json()
    _await(client, started["job_id"])

    runs = client.get(f"/api/projects/{project_id}/runs").json()
    validate_runs = [r for r in runs if r["stage"] == "validate"]
    assert len(validate_runs) == 1
    assert validate_runs[0]["status"] == "done"
    assert validate_runs[0]["artifact_path"].endswith("validation.json")
    assert validate_runs[0]["summary"]["series_policies"]


@pytest.mark.unit
def test_a_candidate_failure_is_reported_without_failing_the_run(
    client, monkeypatch
) -> None:
    from foreko.services import backtest as backtest_service

    real = backtest_service._forecast_one_model

    async def _fail_ets(*, model: str, **kwargs):
        if model == "ets":
            raise RuntimeError("ets exploded")
        return await real(model=model, **kwargs)

    monkeypatch.setattr(backtest_service, "_forecast_one_model", _fail_ets)

    project_id = _project(client, _upload(client))
    _prepare(client, project_id)
    started = client.post(f"/api/projects/{project_id}/validate").json()
    job = _await(client, started["job_id"])

    # One broken candidate must not sink the run while another still qualifies.
    assert job["status"] == "done"
    result = job["result"]
    assert any(f["model"] == "ets" for f in result["failures"])
    for policy in result["series_policies"].values():
        assert policy["champion"] == "seasonal_naive"
        assert policy["ineligible"]["ets"] == "Failed at least one fold."


@pytest.mark.unit
def test_validation_is_invalidated_by_a_new_revision(client) -> None:
    dataset_id = _upload(client)
    project_id = _project(client, dataset_id)
    _prepare(client, project_id)
    started = client.post(f"/api/projects/{project_id}/validate").json()
    _await(client, started["job_id"])

    client.post(
        f"/api/projects/{project_id}/revisions",
        json={
            "mapping": {
                "date_col": "month",
                "value_col": "sales",
                "series_id_col": "region",
            },
            "frequency": "MS",
            "horizon": 6,
            "preparation_steps": [],
            "candidate_models": ["seasonal_naive"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": {},
        },
    )

    workflow = client.get(f"/api/projects/{project_id}/workflow").json()
    # Changing the horizon invalidates Prepare, which blocks Validate again.
    assert workflow["stages"]["prepare"]["status"] == "not_started"
    assert workflow["stages"]["validate"]["status"] == "blocked"
