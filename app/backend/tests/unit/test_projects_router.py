"""API tests for project CRUD, revisions, and workflow state."""

from __future__ import annotations

from typing import Any

import pytest


def _revision_body(horizon: int = 12) -> dict[str, Any]:
    return {
        "mapping": {"date_col": "month", "value_col": "sales"},
        "frequency": "MS",
        "horizon": horizon,
        "preparation_steps": [],
        "candidate_models": ["timesfm", "lightgbm"],
        "folds": 5,
        "primary_metric": "mase",
        "covariate_roles": {},
    }


def _create(client, name: str = "Demand Plan") -> dict[str, Any]:
    response = client.post(
        "/api/projects",
        json={"name": name, "dataset_id": "data-1", "description": ""},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.unit
def test_create_get_and_list_project(client) -> None:
    project = _create(client)
    assert project["status"] == "draft"
    assert project["current_revision"] == 0
    assert project["is_archived"] is False

    fetched = client.get(f"/api/projects/{project['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Demand Plan"

    listed = client.get("/api/projects").json()
    assert [p["id"] for p in listed] == [project["id"]]


@pytest.mark.unit
def test_unknown_project_is_404_not_500(client) -> None:
    assert client.get("/api/projects/nope").status_code == 404
    assert client.patch("/api/projects/nope", json={"name": "x"}).status_code == 404
    assert client.get("/api/projects/nope/runs").status_code == 404


@pytest.mark.unit
def test_delete_requires_explicit_confirmation(client) -> None:
    project = _create(client)

    unconfirmed = client.delete(f"/api/projects/{project['id']}")
    assert unconfirmed.status_code == 409
    # The refusal must not have deleted anything.
    assert client.get(f"/api/projects/{project['id']}").status_code == 200

    confirmed = client.delete(f"/api/projects/{project['id']}?confirm=true")
    assert confirmed.status_code == 204
    assert client.get(f"/api/projects/{project['id']}").status_code == 404


@pytest.mark.unit
def test_archive_hides_from_the_default_list_and_reopen_restores(client) -> None:
    project = _create(client, name="Archived Sales Plan")

    client.patch(f"/api/projects/{project['id']}", json={"archived": True})
    assert client.get("/api/projects").json() == []
    archived = client.get("/api/projects?include_archived=true").json()
    assert len(archived) == 1
    assert archived[0]["is_archived"] is True

    client.patch(f"/api/projects/{project['id']}", json={"archived": False})
    assert len(client.get("/api/projects").json()) == 1


@pytest.mark.unit
def test_revisions_are_created_and_listed(client) -> None:
    project = _create(client)

    created = client.post(
        f"/api/projects/{project['id']}/revisions", json=_revision_body()
    )
    assert created.status_code == 201, created.text
    assert created.json()["revision_no"] == 1

    second = client.post(
        f"/api/projects/{project['id']}/revisions", json=_revision_body(horizon=24)
    )
    assert second.json()["revision_no"] == 2

    listed = client.get(f"/api/projects/{project['id']}/revisions").json()
    assert [r["revision_no"] for r in listed] == [1, 2]

    detail = client.get(f"/api/projects/{project['id']}").json()
    assert detail["status"] == "ready"
    assert detail["config"]["horizon"] == 24


@pytest.mark.unit
def test_mutation_schemas_reject_unknown_fields(client) -> None:
    rejected = client.post(
        "/api/projects",
        json={"name": "X", "dataset_id": "d", "surprise": "field"},
    )
    assert rejected.status_code == 422


@pytest.mark.unit
def test_revision_rejects_an_unknown_preparation_step(client) -> None:
    project = _create(client)
    body = _revision_body()
    body["preparation_steps"] = [{"kind": "not_a_transform"}]
    response = client.post(f"/api/projects/{project['id']}/revisions", json=body)
    assert response.status_code == 422


@pytest.mark.unit
def test_workflow_starts_at_prepare_and_blocks_the_rest(client) -> None:
    project = _create(client)
    client.post(f"/api/projects/{project['id']}/revisions", json=_revision_body())

    workflow = client.get(f"/api/projects/{project['id']}/workflow").json()
    assert workflow["revision"] == 1
    assert workflow["next_stage"] == "prepare"
    assert workflow["stages"]["prepare"]["status"] == "not_started"
    assert workflow["stages"]["validate"]["status"] == "blocked"
    assert workflow["stages"]["review"]["status"] == "blocked"


@pytest.mark.unit
def test_workflow_blocks_prepare_until_the_project_is_configured(client) -> None:
    # A freshly created project has no revision. The workflow has to say that,
    # because the Prepare screen reads its reason to explain the locked run.
    project = _create(client)

    workflow = client.get(f"/api/projects/{project['id']}/workflow").json()
    assert workflow["revision"] == 0
    assert workflow["stages"]["prepare"]["status"] == "blocked"
    assert "Configure the project" in workflow["stages"]["prepare"]["reason"]

    client.post(f"/api/projects/{project['id']}/revisions", json=_revision_body())
    unblocked = client.get(f"/api/projects/{project['id']}/workflow").json()
    assert unblocked["stages"]["prepare"]["status"] == "not_started"


@pytest.mark.unit
def test_project_ids_are_safe_path_segments(client) -> None:
    # The id is concatenated onto storage_dir to build the artifact directory.
    project = _create(client)
    assert project["id"].isalnum()


@pytest.mark.unit
def test_patch_is_allowed_by_cors(client) -> None:
    # PATCH is the only method the project API adds. If it is missing from the
    # allowlist every patch works here but fails preflight in a browser, so
    # this asserts the wiring TestClient would otherwise hide.
    response = client.options(
        "/api/projects/anything",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
        },
    )
    assert response.status_code == 200
    allowed = response.headers["access-control-allow-methods"]
    assert "PATCH" in allowed
