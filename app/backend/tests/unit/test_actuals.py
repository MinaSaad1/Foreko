"""Issued forecasts are immutable, and accuracy is scored against them.

The guarantee under test: once issued, what you predicted cannot change. If a
later revision or rerun could alter it, Tempolith would be rescoring a forecast the
user never issued, and its accuracy claim would be worthless.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tempolith.schemas.dataset import ColumnMapping
from tempolith.schemas.project import (
    ActualRow,
    IssuedForecast,
    ProjectCreate,
    ProjectRevisionCreate,
    ProjectRunCreate,
)
from tempolith.services.actuals import (
    ActualsImportError,
    parse_actuals,
    score_issued_forecast,
)
from tempolith.services.project_store import ProjectStore


FORECAST = {
    "series": [
        {
            "series_id": "egypt",
            "model": "timesfm",
            "dates": ["2026-08-01", "2026-09-01"],
            "point": [100.0, 110.0],
            "p10": [90.0, 100.0],
            "p90": [110.0, 120.0],
        },
        {
            "series_id": "uae",
            "model": "ets",
            "dates": ["2026-08-01"],
            "point": [80.0],
            "p10": [70.0],
            "p90": [90.0],
        },
    ],
    "assumptions": {"price": {"2026-08-01": 12.5}},
}


def _revision(horizon: int = 2) -> ProjectRevisionCreate:
    return ProjectRevisionCreate(
        mapping=ColumnMapping(date_col="month", value_col="sales"),
        frequency="MS",
        horizon=horizon,
        preparation_steps=[],
        candidate_models=["timesfm"],
        folds=2,
        primary_metric="mase",
        covariate_roles={},
    )


@pytest.fixture()
def store(tmp_path: Path) -> ProjectStore:
    return ProjectStore(tmp_path / "tempolith.db")


@pytest.fixture()
def issued(store: ProjectStore) -> IssuedForecast:
    project = store.create_project(ProjectCreate(name="P", dataset_id="d1"))
    store.create_revision(project.id, _revision())
    run = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="forecast")
    )
    store.finish_run(run.id, "runs/x/forecast.json", FORECAST)
    return store.issue_run(run.id, assumptions={"price": 12.5})


# ---------------------------------------------------------------------------
# Immutability
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_issued_forecast_remains_unchanged_after_new_revision(
    store: ProjectStore, issued: IssuedForecast
) -> None:
    store.create_revision(issued.project_id, _revision(horizon=99))

    reloaded = store.get_issued_forecast(issued.id)
    assert reloaded is not None
    assert reloaded.run_id == issued.run_id
    assert reloaded.revision_no == 1
    # The values are a copy. A new revision cannot rewrite what was predicted.
    assert reloaded.forecast == issued.forecast


@pytest.mark.unit
def test_issuing_copies_the_values_rather_than_referencing_the_run(
    store: ProjectStore, issued: IssuedForecast
) -> None:
    # Overwrite the source run's summary entirely.
    store.finish_run(issued.run_id, "runs/x/forecast.json", {"series": []})

    reloaded = store.get_issued_forecast(issued.id)
    assert reloaded is not None
    assert len(reloaded.forecast["series"]) == 2
    assert reloaded.forecast["series"][0]["point"] == [100.0, 110.0]


@pytest.mark.unit
def test_only_a_completed_run_can_be_issued(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="P", dataset_id="d1"))
    store.create_revision(project.id, _revision())
    run = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="forecast")
    )
    with pytest.raises(ValueError, match="completed"):
        store.issue_run(run.id)


@pytest.mark.unit
def test_a_stale_run_cannot_be_issued(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="P", dataset_id="d1"))
    store.create_revision(project.id, _revision())
    run = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="forecast")
    )
    store.finish_run(run.id, "a.json", FORECAST)
    store.create_revision(project.id, _revision(horizon=6))

    # Issuing a result produced by a configuration the project has moved past
    # would freeze a forecast nobody could reproduce.
    with pytest.raises(ValueError, match="revision"):
        store.issue_run(run.id)


@pytest.mark.unit
def test_a_non_forecast_run_cannot_be_issued(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="P", dataset_id="d1"))
    store.create_revision(project.id, _revision())
    run = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="validate")
    )
    store.finish_run(run.id, "v.json", {"series_policies": {}})
    with pytest.raises(ValueError, match="forecast or scenario"):
        store.issue_run(run.id)


@pytest.mark.unit
def test_a_scenario_run_can_be_issued(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="P", dataset_id="d1"))
    store.create_revision(project.id, _revision())
    run = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="plan")
    )
    store.finish_run(run.id, "s.json", FORECAST)
    assert store.issue_run(run.id).run_id == run.id


@pytest.mark.unit
def test_importing_actuals_does_not_touch_the_issued_forecast(
    store: ProjectStore, issued: IssuedForecast
) -> None:
    store.upsert_actuals(
        issued.project_id,
        [ActualRow(series_id="egypt", date="2026-08-01", value=103.0)],
    )
    reloaded = store.get_issued_forecast(issued.id)
    assert reloaded is not None
    assert reloaded.forecast == issued.forecast


@pytest.mark.unit
def test_actuals_upsert_replaces_a_correction(store: ProjectStore, issued) -> None:
    pid = issued.project_id
    store.upsert_actuals(pid, [ActualRow(series_id="egypt", date="2026-08-01", value=100.0)])
    store.upsert_actuals(pid, [ActualRow(series_id="egypt", date="2026-08-01", value=105.0)])

    rows = store.list_actuals(pid)
    assert len(rows) == 1
    assert rows[0].value == 105.0


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_score_matches_series_and_period_only(issued: IssuedForecast) -> None:
    result = score_issued_forecast(
        issued,
        [
            ActualRow(series_id="egypt", date="2026-08-01", value=103.0),
            ActualRow(series_id="uae", date="2026-08-01", value=81.0),
        ],
    )
    assert result.matched_points == 2
    assert result.unmatched_periods == 1  # egypt's second period has no actual
    assert result.metrics.coverage_p10_p90 == 1.0
    assert result.issued_id == issued.id


@pytest.mark.unit
def test_an_actual_for_an_unforecast_series_is_ignored(issued: IssuedForecast) -> None:
    result = score_issued_forecast(
        issued,
        [
            ActualRow(series_id="egypt", date="2026-08-01", value=103.0),
            ActualRow(series_id="not_forecast", date="2026-08-01", value=999.0),
        ],
    )
    # Scoring against a series the forecast never covered would be measuring a
    # claim that was not made.
    assert result.matched_points == 1


@pytest.mark.unit
def test_an_actual_for_an_unforecast_period_is_ignored(issued: IssuedForecast) -> None:
    result = score_issued_forecast(
        issued, [ActualRow(series_id="egypt", date="2030-01-01", value=103.0)]
    )
    assert result.matched_points == 0
    assert "No actuals matched" in result.metric_warnings[0]


@pytest.mark.unit
def test_bias_keeps_its_direction(issued: IssuedForecast) -> None:
    over = score_issued_forecast(
        issued, [ActualRow(series_id="egypt", date="2026-08-01", value=50.0)]
    )
    under = score_issued_forecast(
        issued, [ActualRow(series_id="egypt", date="2026-08-01", value=200.0)]
    )
    # Forecast 100 against actual 50 is over-forecasting: positive bias.
    assert over.metrics.bias_pct > 0
    assert under.metrics.bias_pct < 0


@pytest.mark.unit
def test_coverage_counts_an_actual_outside_the_issued_band(
    issued: IssuedForecast,
) -> None:
    result = score_issued_forecast(
        issued, [ActualRow(series_id="egypt", date="2026-08-01", value=500.0)]
    )
    assert result.metrics.coverage_p10_p90 == 0.0


@pytest.mark.unit
def test_mase_needs_two_periods_and_says_so(issued: IssuedForecast) -> None:
    result = score_issued_forecast(
        issued, [ActualRow(series_id="egypt", date="2026-08-01", value=103.0)]
    )
    # One point cannot scale, and a None with a reason beats a fabricated zero.
    assert result.metrics.mase is None
    assert any("two matched periods" in w for w in result.metric_warnings)


@pytest.mark.unit
def test_flat_actuals_make_mase_undefined_not_infinite(issued: IssuedForecast) -> None:
    result = score_issued_forecast(
        issued,
        [
            ActualRow(series_id="egypt", date="2026-08-01", value=100.0),
            ActualRow(series_id="egypt", date="2026-09-01", value=100.0),
        ],
    )
    assert result.metrics.mase is None
    assert any("do not change" in w for w in result.metric_warnings)


@pytest.mark.unit
def test_per_series_accuracy_is_reported_separately(issued: IssuedForecast) -> None:
    result = score_issued_forecast(
        issued,
        [
            ActualRow(series_id="egypt", date="2026-08-01", value=103.0),
            ActualRow(series_id="egypt", date="2026-09-01", value=115.0),
        ],
    )
    by_series = {s.series_id: s for s in result.series}
    assert by_series["egypt"].matched_points == 2
    assert by_series["uae"].matched_points == 0
    assert "No actuals matched" in by_series["uae"].metric_warnings[0]


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_parse_actuals_reads_named_columns() -> None:
    content = b"month,sales,region\n2026-08-01,103,egypt\n2026-09-01,115,egypt\n"
    rows = parse_actuals(
        content, date_col="month", value_col="sales", series_id_col="region"
    )
    assert rows == [
        ActualRow(series_id="egypt", date="2026-08-01", value=103.0),
        ActualRow(series_id="egypt", date="2026-09-01", value=115.0),
    ]


@pytest.mark.unit
def test_parse_actuals_names_the_missing_column() -> None:
    with pytest.raises(ActualsImportError) as exc:
        parse_actuals(b"a,b\n1,2\n", date_col="month", value_col="sales")
    assert "month" in str(exc.value)
    assert "sales" in str(exc.value)


@pytest.mark.unit
def test_parse_actuals_rejects_unreadable_dates() -> None:
    with pytest.raises(ActualsImportError, match="unreadable"):
        parse_actuals(b"month,sales\nnot-a-date,5\n", date_col="month", value_col="sales")


@pytest.mark.unit
def test_parse_actuals_rejects_non_numeric_values() -> None:
    with pytest.raises(ActualsImportError, match="non-numeric"):
        parse_actuals(b"month,sales\n2026-08-01,abc\n", date_col="month", value_col="sales")
