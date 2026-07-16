"""API tests for the Prepare stage job."""

from __future__ import annotations

import io
import time
from typing import Any

import pytest


def _csv_bytes(rows: int = 48, negative: bool = False) -> bytes:
    lines = ["month,sales,region"]
    for i in range(rows):
        year = 2022 + i // 12
        month = (i % 12) + 1
        value = 100 + i if not negative else (100 + i if i != 3 else -20)
        lines.append(f"{year}-{month:02d}-01,{value},egypt")
    return "\n".join(lines).encode("utf-8")


def _upload(client, data: bytes | None = None) -> str:
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.csv", io.BytesIO(data or _csv_bytes()), "text/csv")},
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


def _project_with_recipe(client, dataset_id: str, steps: list[dict[str, Any]]) -> str:
    project = client.post(
        "/api/projects", json={"name": "Prep", "dataset_id": dataset_id}
    ).json()
    revision = client.post(
        f"/api/projects/{project['id']}/revisions",
        json={
            "mapping": {"date_col": "month", "value_col": "sales"},
            "frequency": "MS",
            "horizon": 6,
            "preparation_steps": steps,
            "candidate_models": ["timesfm"],
            "covariate_roles": {},
        },
    )
    assert revision.status_code == 201, revision.text
    return project["id"]


def _await_job(client, job_id: str, timeout: float = 10.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/project-jobs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish within {timeout}s")


@pytest.mark.unit
def test_prepare_writes_a_derived_artifact_and_completes_the_stage(client) -> None:
    dataset_id = _upload(client)
    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])

    started = client.post(f"/api/projects/{project_id}/prepare")
    assert started.status_code == 202, started.text

    job = _await_job(client, started.json()["job_id"])
    assert job["status"] == "done", job
    assert job["result"]["series_count"] == 1
    assert job["result"]["recipe_hash"]

    workflow = client.get(f"/api/projects/{project_id}/workflow").json()
    assert workflow["stages"]["prepare"]["status"] == "complete"
    assert workflow["stages"]["validate"]["status"] == "not_started"
    assert workflow["next_stage"] == "validate"


@pytest.mark.unit
def test_prepare_does_not_modify_the_source_dataset(client, settings) -> None:
    dataset_id = _upload(client)
    source = settings.datasets_dir / dataset_id
    before = {p.name: p.read_bytes() for p in source.rglob("*") if p.is_file()}

    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])
    job = _await_job(client, client.post(f"/api/projects/{project_id}/prepare").json()["job_id"])
    assert job["status"] == "done"

    after = {p.name: p.read_bytes() for p in source.rglob("*") if p.is_file()}
    # The original ingested dataset is immutable; preparation derives from it.
    assert after == before


@pytest.mark.unit
def test_an_invalid_recipe_fails_the_run_and_names_the_transform(client) -> None:
    dataset_id = _upload(client, _csv_bytes(negative=True))
    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])

    job = _await_job(client, client.post(f"/api/projects/{project_id}/prepare").json()["job_id"])
    assert job["status"] == "error"
    assert "above zero" in job["error"]

    workflow = client.get(f"/api/projects/{project_id}/workflow").json()
    # A failed run must not read as complete, and must not silently restart.
    assert workflow["stages"]["prepare"]["status"] == "needs_attention"
    assert workflow["stages"]["validate"]["status"] == "blocked"


@pytest.mark.unit
def test_prepare_requires_a_revision(client) -> None:
    dataset_id = _upload(client)
    project = client.post(
        "/api/projects", json={"name": "No revision", "dataset_id": dataset_id}
    ).json()
    response = client.post(f"/api/projects/{project['id']}/prepare")
    assert response.status_code == 409
    assert "revision" in response.json()["detail"]


@pytest.mark.unit
def test_prepare_on_an_unknown_project_is_404(client) -> None:
    assert client.post("/api/projects/nope/prepare").status_code == 404


@pytest.mark.unit
def test_prepare_records_an_immutable_run_linked_to_its_revision(client) -> None:
    dataset_id = _upload(client)
    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])
    _await_job(client, client.post(f"/api/projects/{project_id}/prepare").json()["job_id"])

    runs = client.get(f"/api/projects/{project_id}/runs").json()
    assert len(runs) == 1
    assert runs[0]["stage"] == "prepare"
    assert runs[0]["status"] == "done"
    assert runs[0]["revision_no"] == 1
    assert runs[0]["artifact_path"]


@pytest.mark.unit
def test_a_new_revision_makes_the_previous_prepare_stale_without_deleting_it(
    client,
) -> None:
    dataset_id = _upload(client)
    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])
    _await_job(client, client.post(f"/api/projects/{project_id}/prepare").json()["job_id"])

    # Change the recipe: revision 2.
    client.post(
        f"/api/projects/{project_id}/revisions",
        json={
            "mapping": {"date_col": "month", "value_col": "sales"},
            "frequency": "MS",
            "horizon": 6,
            "preparation_steps": [{"kind": "diff", "period": 1}],
            "candidate_models": ["timesfm"],
            "covariate_roles": {},
        },
    )

    workflow = client.get(f"/api/projects/{project_id}/workflow").json()
    assert workflow["revision"] == 2
    assert workflow["stages"]["prepare"]["status"] == "not_started"
    assert "revision 1" in workflow["stages"]["prepare"]["reason"]

    # The completed run is kept, not deleted.
    runs = client.get(f"/api/projects/{project_id}/runs").json()
    assert len(runs) == 1
    assert runs[0]["status"] == "done"


@pytest.mark.unit
def test_job_events_endpoint_reports_a_finished_job(client) -> None:
    dataset_id = _upload(client)
    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])
    job_id = client.post(f"/api/projects/{project_id}/prepare").json()["job_id"]
    _await_job(client, job_id)

    with client.stream("GET", f"/api/project-jobs/{job_id}/events") as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())
    assert '"type": "done"' in body or '"type": "state"' in body


@pytest.mark.unit
def test_cancelling_a_finished_job_is_a_conflict(client) -> None:
    dataset_id = _upload(client)
    project_id = _project_with_recipe(client, dataset_id, [{"kind": "log"}])
    job_id = client.post(f"/api/projects/{project_id}/prepare").json()["job_id"]
    _await_job(client, job_id)
    assert client.post(f"/api/project-jobs/{job_id}/cancel").status_code == 409
