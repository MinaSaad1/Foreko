"""API tests for issuing a forecast, importing actuals, and post-issue accuracy."""

from __future__ import annotations

import io
import time
from typing import Any

import pytest


def _csv(rows: int = 48) -> bytes:
    lines = ["month,sales,region"]
    for index, region in enumerate(("egypt", "uae")):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            lines.append(f"{year}-{month:02d}-01,{100 + i * 2 + index * 50},{region}")
    return "\n".join(lines).encode("utf-8")


def _upload(client) -> str:
    response = client.post(
        "/api/datasets/upload", files={"file": ("s.csv", io.BytesIO(_csv()), "text/csv")}
    )
    assert response.status_code == 200
    return response.json()["id"]


def _await(client, job_id: str, timeout: float = 30.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/project-jobs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def _issuable_project(client) -> tuple[str, str, list[str]]:
    dataset_id = _upload(client)
    project = client.post(
        "/api/projects", json={"name": "Issue", "dataset_id": dataset_id}
    ).json()
    pid = project["id"]
    client.post(
        f"/api/projects/{pid}/revisions",
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
            "covariate_roles": {},
        },
    )
    _await(client, client.post(f"/api/projects/{pid}/prepare").json()["job_id"])
    _await(client, client.post(f"/api/projects/{pid}/validate").json()["job_id"])
    job = _await(
        client, client.post(f"/api/projects/{pid}/forecast", json={}).json()["job_id"]
    )
    run_id = [
        r for r in client.get(f"/api/projects/{pid}/runs").json() if r["stage"] == "forecast"
    ][0]["id"]
    dates = job["result"]["series"][0]["dates"]
    return pid, run_id, dates


@pytest.mark.unit
def test_issuing_requires_confirming_the_assumptions(client) -> None:
    pid, run_id, _ = _issuable_project(client)

    unconfirmed = client.post(f"/api/projects/{pid}/runs/{run_id}/issue", json={})
    # Issuing is a statement about the future that will be scored later.
    assert unconfirmed.status_code == 409
    assert "Confirm the assumptions" in unconfirmed.json()["detail"]
    assert client.get(f"/api/projects/{pid}/issued").json() == []

    confirmed = client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue",
        json={"confirm_assumptions": True},
    )
    assert confirmed.status_code == 201, confirmed.text
    assert confirmed.json()["run_id"] == run_id


@pytest.mark.unit
def test_an_issued_forecast_survives_a_later_revision(client) -> None:
    pid, run_id, _ = _issuable_project(client)
    issued = client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    ).json()

    client.post(
        f"/api/projects/{pid}/revisions",
        json={
            "mapping": {
                "date_col": "month",
                "value_col": "sales",
                "series_id_col": "region",
            },
            "frequency": "MS",
            "horizon": 12,
            "preparation_steps": [],
            "candidate_models": ["ets"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": {},
        },
    )

    after = client.get(f"/api/projects/{pid}/issued").json()[0]
    # Everything about the project moved on; what was issued did not.
    assert after["forecast"] == issued["forecast"]
    assert after["revision_no"] == 1


@pytest.mark.unit
def test_a_stale_run_cannot_be_issued(client) -> None:
    pid, run_id, _ = _issuable_project(client)
    client.post(
        f"/api/projects/{pid}/revisions",
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

    response = client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    )
    assert response.status_code == 409
    assert "revision" in response.json()["detail"]


@pytest.mark.unit
def test_accuracy_is_empty_until_a_forecast_is_issued(client) -> None:
    pid, _, _ = _issuable_project(client)
    body = client.get(f"/api/projects/{pid}/accuracy").json()
    assert body["matched_points"] == 0
    assert "No forecast has been issued yet." in body["metric_warnings"]


@pytest.mark.unit
def test_importing_actuals_scores_the_issued_forecast(client) -> None:
    pid, run_id, dates = _issuable_project(client)
    client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    )

    rows = ["month,sales,region"]
    for date in dates:
        rows.append(f"{date},150,egypt")
        rows.append(f"{date},200,uae")
    content = "\n".join(rows).encode("utf-8")

    imported = client.post(
        f"/api/projects/{pid}/actuals",
        files={"file": ("actuals.csv", io.BytesIO(content), "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["imported"] == len(dates) * 2

    accuracy = client.get(f"/api/projects/{pid}/accuracy").json()
    assert accuracy["matched_points"] == len(dates) * 2
    assert accuracy["metrics"]["wape"] is not None
    assert {s["series_id"] for s in accuracy["series"]} == {"egypt", "uae"}


@pytest.mark.unit
def test_importing_actuals_does_not_change_the_issued_forecast(client) -> None:
    pid, run_id, dates = _issuable_project(client)
    issued = client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    ).json()

    content = f"month,sales,region\n{dates[0]},999,egypt\n".encode()
    client.post(
        f"/api/projects/{pid}/actuals",
        files={"file": ("a.csv", io.BytesIO(content), "text/csv")},
    )

    after = client.get(f"/api/projects/{pid}/issued").json()[0]
    assert after["forecast"] == issued["forecast"]


@pytest.mark.unit
def test_an_unreadable_actuals_file_is_rejected_with_a_reason(client) -> None:
    pid, _, _ = _issuable_project(client)
    response = client.post(
        f"/api/projects/{pid}/actuals",
        files={"file": ("a.csv", io.BytesIO(b"wrong,columns\n1,2\n"), "text/csv")},
    )
    assert response.status_code == 422
    assert "month" in response.json()["detail"]


@pytest.mark.unit
def test_reimporting_actuals_corrects_rather_than_duplicates(client) -> None:
    pid, run_id, dates = _issuable_project(client)
    client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    )

    for value in (150, 175):
        content = f"month,sales,region\n{dates[0]},{value},egypt\n".encode()
        client.post(
            f"/api/projects/{pid}/actuals",
            files={"file": ("a.csv", io.BytesIO(content), "text/csv")},
        )

    accuracy = client.get(f"/api/projects/{pid}/accuracy").json()
    # A correction replaces the value rather than adding a second one.
    assert accuracy["matched_points"] == 1


@pytest.mark.unit
def test_review_opens_only_once_a_forecast_is_issued(client) -> None:
    pid, run_id, dates = _issuable_project(client)

    before = client.get(f"/api/projects/{pid}/workflow").json()
    assert before["stages"]["review"]["status"] == "blocked"
    assert "Issue a forecast" in before["stages"]["review"]["reason"]

    client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    )
    ready = client.get(f"/api/projects/{pid}/workflow").json()
    assert ready["stages"]["review"]["status"] == "ready"
    assert "actuals" in ready["stages"]["review"]["reason"]

    content = f"month,sales,region\n{dates[0]},150,egypt\n".encode()
    client.post(
        f"/api/projects/{pid}/actuals",
        files={"file": ("a.csv", io.BytesIO(content), "text/csv")},
    )
    complete = client.get(f"/api/projects/{pid}/workflow").json()
    assert complete["stages"]["review"]["status"] == "complete"
    # Review being scored does not make the project finished: Plan was never
    # run here, and next_stage names the first stage that is not complete.
    assert complete["next_stage"] == "plan"


@pytest.mark.unit
def test_a_new_revision_blocks_review_without_touching_the_issued_forecast(
    client,
) -> None:
    pid, run_id, _ = _issuable_project(client)
    issued = client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    ).json()

    client.post(
        f"/api/projects/{pid}/revisions",
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

    workflow = client.get(f"/api/projects/{pid}/workflow").json()
    # Nothing has been issued for the configuration now being edited, so the
    # Studio's Review stage is stale.
    assert workflow["stages"]["review"]["status"] == "blocked"
    assert "revision 1" in workflow["stages"]["review"]["reason"]

    # The issued forecast itself remains scoreable and untouched.
    assert client.get(f"/api/projects/{pid}/issued").json()[0]["forecast"] == issued["forecast"]
