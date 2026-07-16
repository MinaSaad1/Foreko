"""Scenario runs and deltas against a versioned baseline."""

from __future__ import annotations

import io
import time
from typing import Any

import pytest

from foreko.services.project_forecast import scenario_deltas


def _csv(rows: int = 48) -> bytes:
    lines = ["month,sales,region,price"]
    for index, region in enumerate(("egypt", "uae")):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            lines.append(
                f"{year}-{month:02d}-01,{100 + i * 2 + index * 50},{region},"
                f"{10 + i * 0.1:.2f}"
            )
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


def _ready_project(client) -> tuple[str, list[str]]:
    dataset_id = _upload(client)
    project = client.post(
        "/api/projects", json={"name": "Plan", "dataset_id": dataset_id}
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
            "candidate_models": ["timesfm"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": {"price": "known_future_numerical"},
        },
    )
    _await(client, client.post(f"/api/projects/{pid}/prepare").json()["job_id"])
    _await(client, client.post(f"/api/projects/{pid}/validate").json()["job_id"])
    periods = client.get(f"/api/projects/{pid}/factor-plan").json()["periods"]
    _await(
        client,
        client.post(
            f"/api/projects/{pid}/forecast",
            json={"values": {"price": {p: 10.0 for p in periods}}},
        ).json()["job_id"],
    )
    return pid, periods


@pytest.mark.unit
def test_scenario_deltas_report_absolute_percent_and_cumulative() -> None:
    baseline = {
        "series": [
            {"series_id": "egypt", "dates": ["a", "b"], "point": [100.0, 200.0]}
        ]
    }
    scenario = {
        "series": [{"series_id": "egypt", "dates": ["a", "b"], "point": [110.0, 180.0]}]
    }
    deltas = scenario_deltas(baseline, scenario)
    egypt = deltas["series"][0]

    assert egypt["absolute"] == [10.0, -20.0]
    assert egypt["percent"] == [10.0, -10.0]
    assert egypt["cumulative_absolute"] == -10.0
    assert deltas["portfolio"]["absolute"] == -10.0


@pytest.mark.unit
def test_a_zero_baseline_has_no_percentage() -> None:
    baseline = {"series": [{"series_id": "x", "dates": ["a"], "point": [0.0]}]}
    scenario = {"series": [{"series_id": "x", "dates": ["a"], "point": [5.0]}]}
    deltas = scenario_deltas(baseline, scenario)
    # A change from nothing has no percentage; inventing one would be a lie.
    assert deltas["series"][0]["percent"] == [None]
    assert deltas["series"][0]["absolute"] == [5.0]


@pytest.mark.unit
def test_series_present_in_only_one_side_are_reported_not_dropped() -> None:
    baseline = {
        "series": [
            {"series_id": "a", "dates": ["d"], "point": [1.0]},
            {"series_id": "gone", "dates": ["d"], "point": [1.0]},
        ]
    }
    scenario = {"series": [{"series_id": "a", "dates": ["d"], "point": [2.0]}]}
    deltas = scenario_deltas(baseline, scenario)

    assert deltas["only_in_baseline"] == ["gone"]
    assert deltas["only_in_scenario"] == []
    # Totals must cover the same series on both sides or they would not compare.
    assert deltas["portfolio"]["baseline_total"] == 1.0


@pytest.mark.unit
def test_a_scenario_runs_and_reports_its_deltas(client) -> None:
    pid, periods = _ready_project(client)

    started = client.post(
        f"/api/projects/{pid}/scenarios/run",
        json={
            "name": "Price increase",
            "values": {"price": {p: 20.0 for p in periods}},
        },
    )
    assert started.status_code == 202, started.text
    job = _await(client, started.json()["job_id"])
    assert job["status"] == "done", job

    result = job["result"]
    assert result["scenario_name"] == "Price increase"
    assert result["assumptions"]["price"] == {p: 20.0 for p in periods}
    assert "deltas" in result
    assert result["deltas"]["portfolio"]["baseline_total"] > 0


@pytest.mark.unit
def test_a_scenario_does_not_disturb_the_baseline(client) -> None:
    pid, periods = _ready_project(client)
    before = [
        r for r in client.get(f"/api/projects/{pid}/runs").json() if r["stage"] == "forecast"
    ]

    _await(
        client,
        client.post(
            f"/api/projects/{pid}/scenarios/run",
            json={"name": "What if", "values": {"price": {p: 30.0 for p in periods}}},
        ).json()["job_id"],
    )

    after = [
        r for r in client.get(f"/api/projects/{pid}/runs").json() if r["stage"] == "forecast"
    ]
    # Design 7.3: a scenario-only change must not invalidate the baseline.
    assert after == before

    workflow = client.get(f"/api/projects/{pid}/workflow").json()
    assert workflow["stages"]["forecast"]["status"] == "complete"


@pytest.mark.unit
def test_a_scenario_inherits_the_baseline_assumptions_it_does_not_edit(client) -> None:
    pid, periods = _ready_project(client)

    job = _await(
        client,
        client.post(
            f"/api/projects/{pid}/scenarios/run",
            json={"name": "Partial", "values": {"price": {periods[0]: 25.0}}},
        ).json()["job_id"],
    )

    price = job["result"]["assumptions"]["price"]
    # Edited period changes; the rest carry the baseline's value, not a gap.
    assert price[periods[0]] == 25.0
    assert price[periods[1]] == 10.0
    assert price[periods[2]] == 10.0


@pytest.mark.unit
def test_a_scenario_needs_a_baseline_first(client) -> None:
    dataset_id = _upload(client)
    project = client.post(
        "/api/projects", json={"name": "Bare", "dataset_id": dataset_id}
    ).json()
    client.post(
        f"/api/projects/{project['id']}/revisions",
        json={
            "mapping": {"date_col": "month", "value_col": "sales", "series_id_col": "region"},
            "frequency": "MS",
            "horizon": 3,
            "preparation_steps": [],
            "candidate_models": ["seasonal_naive"],
            "folds": 2,
            "primary_metric": "mase",
            "covariate_roles": {},
        },
    )
    response = client.post(
        f"/api/projects/{project['id']}/scenarios/run", json={"name": "X"}
    )
    assert response.status_code == 409
    assert "baseline" in response.json()["detail"]


@pytest.mark.unit
def test_a_scenario_needs_a_name(client) -> None:
    pid, _ = _ready_project(client)
    assert client.post(f"/api/projects/{pid}/scenarios/run", json={}).status_code == 422


@pytest.mark.unit
def test_scenarios_are_listed_for_comparison(client) -> None:
    pid, periods = _ready_project(client)
    for name, price in (("Low", 5.0), ("High", 30.0)):
        _await(
            client,
            client.post(
                f"/api/projects/{pid}/scenarios/run",
                json={"name": name, "values": {"price": {p: price for p in periods}}},
            ).json()["job_id"],
        )

    scenarios = client.get(f"/api/projects/{pid}/scenarios").json()
    assert {s["name"] for s in scenarios} == {"Low", "High"}
    for scenario in scenarios:
        assert scenario["deltas"]["portfolio"] is not None
