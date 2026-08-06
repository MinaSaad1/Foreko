"""Run manifests and export packages.

An export is what a user hands to someone else. It must carry enough to audit
the number, and must never carry a credential: a manifest is meant to be shared,
and a leaked secret cannot be unshared.
"""

from __future__ import annotations

import io
import json
import time
import zipfile
from typing import Any

import pytest

from tempolith.services.project_exports import _scrub, build_manifest, forecast_csv


def _csv(rows: int = 48) -> bytes:
    lines = ["month,sales,region"]
    for index, region in enumerate(("egypt", "uae")):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            lines.append(f"{year}-{month:02d}-01,{100 + i * 2 + index * 50},{region}")
    return "\n".join(lines).encode("utf-8")


def _await(client, job_id: str, timeout: float = 30.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/project-jobs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError("job did not finish")


@pytest.fixture()
def issued_project(client) -> str:
    dataset_id = client.post(
        "/api/datasets/upload", files={"file": ("s.csv", io.BytesIO(_csv()), "text/csv")}
    ).json()["id"]
    pid = client.post(
        "/api/projects", json={"name": "Export Me", "dataset_id": dataset_id}
    ).json()["id"]
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
            "preparation_steps": [{"kind": "log"}],
            "candidate_models": ["seasonal_naive"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": {},
        },
    )
    _await(client, client.post(f"/api/projects/{pid}/prepare").json()["job_id"])
    _await(client, client.post(f"/api/projects/{pid}/validate").json()["job_id"])
    _await(
        client, client.post(f"/api/projects/{pid}/forecast", json={}).json()["job_id"]
    )
    run_id = [
        r for r in client.get(f"/api/projects/{pid}/runs").json() if r["stage"] == "forecast"
    ][0]["id"]
    client.post(
        f"/api/projects/{pid}/runs/{run_id}/issue", json={"confirm_assumptions": True}
    )
    return pid


@pytest.mark.unit
def test_scrub_removes_credentials_at_any_depth() -> None:
    payload = {
        "connection": {"host": "db", "password": "hunter2", "token": "abc"},
        "runs": [{"api_key": "k", "model": "timesfm"}],
        "model": "timesfm",
    }
    scrubbed = _scrub(payload)
    assert scrubbed == {
        "connection": {"host": "db"},
        "runs": [{"model": "timesfm"}],
        "model": "timesfm",
    }


@pytest.mark.unit
def test_forecast_csv_is_one_row_per_series_and_period() -> None:
    forecast = {
        "series": [
            {
                "series_id": "egypt",
                "model": "timesfm",
                "dates": ["2026-08-01", "2026-09-01"],
                "point": [100.0, 110.0],
                "p10": [90.0, 100.0],
                "p90": [110.0, 120.0],
            }
        ]
    }
    rows = forecast_csv(forecast).strip().splitlines()
    assert rows[0] == "series_id,date,point,p10,p90,model"
    assert rows[1] == "egypt,2026-08-01,100.0,90.0,110.0,timesfm"
    assert len(rows) == 3


@pytest.mark.unit
def test_forecast_package_contains_manifest_and_machine_readable_values(
    client, issued_project: str
) -> None:
    response = client.get(f"/api/projects/{issued_project}/exports/package")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert set(archive.namelist()) >= {
            "manifest.json",
            "forecast.csv",
            "assumptions.json",
            "validation-summary.json",
            "accuracy.json",
        }
        manifest = json.loads(archive.read("manifest.json"))
        csv_text = archive.read("forecast.csv").decode()

    assert manifest["schema_version"] == 1
    assert manifest["project"]["name"] == "Export Me"
    assert csv_text.startswith("series_id,date,point,p10,p90,model")
    assert "egypt" in csv_text


@pytest.mark.unit
def test_the_manifest_pins_the_data_and_the_recipe(client, issued_project: str) -> None:
    run_id = [
        r
        for r in client.get(f"/api/projects/{issued_project}/runs").json()
        if r["stage"] == "forecast"
    ][0]["id"]
    manifest = client.get(
        f"/api/projects/{issued_project}/runs/{run_id}/manifest"
    ).json()

    # Without these a reader cannot tell which data or recipe produced the
    # number they are being asked to act on.
    assert manifest["data"]["dataset_fingerprint"]
    assert manifest["data"]["preparation_steps"] == [
        {
            "kind": "log",
            "method": None,
            "period": None,
            "lower_quantile": None,
            "upper_quantile": None,
        }
    ]
    assert manifest["tempolith_version"]


@pytest.mark.unit
def test_the_manifest_records_the_selected_policy(client, issued_project: str) -> None:
    run_id = [
        r
        for r in client.get(f"/api/projects/{issued_project}/runs").json()
        if r["stage"] == "forecast"
    ][0]["id"]
    manifest = client.get(
        f"/api/projects/{issued_project}/runs/{run_id}/manifest"
    ).json()

    selected = manifest["policy"]["selected"]
    assert set(selected) == {"egypt", "uae"}
    for entry in selected.values():
        assert entry["champion"] == "seasonal_naive"
        assert entry["reason"]
    assert manifest["policy"]["folds"] == 2
    assert manifest["policy"]["primary_metric"] == "mase"


@pytest.mark.unit
def test_the_manifest_names_the_issued_forecast(client, issued_project: str) -> None:
    run_id = [
        r
        for r in client.get(f"/api/projects/{issued_project}/runs").json()
        if r["stage"] == "forecast"
    ][0]["id"]
    manifest = client.get(
        f"/api/projects/{issued_project}/runs/{run_id}/manifest"
    ).json()
    assert manifest["issued"]["run_id"] == run_id
    assert manifest["issued"]["revision_no"] == 1


@pytest.mark.unit
def test_the_package_carries_no_credentials(client, issued_project: str) -> None:
    response = client.get(f"/api/projects/{issued_project}/exports/package")
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        blob = b" ".join(archive.read(name) for name in archive.namelist()).lower()
    for forbidden in (b"password", b"secret", b"api_key", b"token"):
        assert forbidden not in blob


@pytest.mark.unit
def test_exporting_without_a_forecast_is_refused(client) -> None:
    dataset_id = client.post(
        "/api/datasets/upload", files={"file": ("s.csv", io.BytesIO(_csv()), "text/csv")}
    ).json()["id"]
    pid = client.post(
        "/api/projects", json={"name": "Bare", "dataset_id": dataset_id}
    ).json()["id"]
    response = client.get(f"/api/projects/{pid}/exports/package")
    assert response.status_code == 409
    assert "forecast" in response.json()["detail"]


@pytest.mark.unit
def test_the_package_exports_what_was_issued_not_a_later_rerun(
    client, issued_project: str
) -> None:
    # Change the project and rerun, so the latest forecast differs from the
    # issued one.
    client.post(
        f"/api/projects/{issued_project}/revisions",
        json={
            "mapping": {
                "date_col": "month",
                "value_col": "sales",
                "series_id_col": "region",
            },
            "frequency": "MS",
            "horizon": 3,
            "preparation_steps": [],
            "candidate_models": ["ets"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": {},
        },
    )

    response = client.get(f"/api/projects/{issued_project}/exports/package")
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        csv_text = archive.read("forecast.csv").decode()

    # An export is what the reader will act on, so it carries what was
    # committed, not whatever the project has since become.
    assert manifest["issued"]["revision_no"] == 1
    assert "seasonal_naive" in csv_text


@pytest.mark.unit
def test_an_unknown_project_or_run_is_404(client, issued_project: str) -> None:
    assert client.get("/api/projects/nope/exports/package").status_code == 404
    assert (
        client.get(f"/api/projects/{issued_project}/runs/nope/manifest").status_code
        == 404
    )


@pytest.mark.unit
def test_a_manifest_scrubs_a_credential_that_reaches_it() -> None:
    from tempolith.schemas.project import ProjectDetail, ProjectRun

    project = ProjectDetail(
        id="p1",
        name="P",
        description="",
        dataset_id="d1",
        status="ready",
        current_revision=1,
        created_at="t",
        updated_at="t",
    )
    run = ProjectRun(
        id="r1",
        project_id="p1",
        revision_no=1,
        stage="forecast",
        status="done",
        started_at="t",
        summary={"assumptions": {"password": "hunter2", "price": 12.0}},
    )
    manifest = build_manifest(project=project, run=run)
    assert "password" not in manifest["assumptions"]
    assert manifest["assumptions"]["price"] == 12.0
