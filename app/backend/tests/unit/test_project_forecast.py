"""Per-series forecast execution.

The rules under test: each series runs the model its own validation selected, a
failure is an exception row rather than another model's numbers, and values come
back on the scale the user reads.
"""

from __future__ import annotations

import numpy as np
import pytest

from tempolith.schemas.dataset import ColumnMapping
from tempolith.schemas.project import PreparationStep, ProjectRevisionCreate
from tempolith.services import project_forecast
from tempolith.services.loaders.csv import ingest_upload
from tempolith.services.project_forecast import run_project_forecast


def _csv(regions=("egypt", "uae"), rows: int = 48) -> bytes:
    lines = ["month,sales,region"]
    for index, region in enumerate(regions):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            lines.append(f"{year}-{month:02d}-01,{100 + i * 2 + index * 50},{region}")
    return "\n".join(lines).encode("utf-8")


def _config(steps: list[PreparationStep] | None = None) -> ProjectRevisionCreate:
    return ProjectRevisionCreate(
        mapping=ColumnMapping(
            date_col="month", value_col="sales", series_id_col="region"
        ),
        frequency="MS",
        horizon=3,
        preparation_steps=steps or [],
        candidate_models=["seasonal_naive", "ets"],
        folds=2,
        primary_metric="mase",
        covariate_roles={},
    )


def _policies(**by_series: str | None) -> dict[str, dict]:
    return {
        series_id: {
            "series_id": series_id,
            "champion": champion,
            "challenger": None,
            "reason": "no champion" if champion is None else f"{champion} won",
            "ensemble_weights": {},
            "metrics": {},
            "eligible": [] if champion is None else [champion],
            "ineligible": {},
        }
        for series_id, champion in by_series.items()
    }


@pytest.fixture()
def dataset(settings):
    return ingest_upload(
        filename="sales.csv", content=_csv(), datasets_dir=settings.datasets_dir
    ).id


@pytest.fixture()
def registry():
    from tests.conftest import FakeModelRegistry

    return FakeModelRegistry()


async def _run(settings, registry, dataset, policies, config=None):
    return await run_project_forecast(
        dataset_id=dataset,
        config=config or _config(),
        series_policies=policies,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_each_series_runs_the_model_its_own_validation_selected(
    settings, registry, dataset
) -> None:
    result = await _run(
        settings,
        registry,
        dataset,
        _policies(egypt="seasonal_naive", uae="ets"),
    )

    assert result.exceptions == []
    by_series = {f.series_id: f for f in result.forecasts}
    assert by_series["egypt"].model == "seasonal_naive"
    assert by_series["uae"].model == "ets"
    assert len(by_series["egypt"].point) == 3
    assert len(by_series["egypt"].dates) == 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_series_without_a_champion_is_not_forecast(
    settings, registry, dataset
) -> None:
    result = await _run(
        settings, registry, dataset, _policies(egypt="seasonal_naive", uae=None)
    )

    # Validation already said the evidence does not support a model here, so
    # producing a number anyway would contradict it.
    assert [f.series_id for f in result.forecasts] == ["egypt"]
    assert [e.series_id for e in result.exceptions] == ["uae"]
    assert "no champion" in result.exceptions[0].reason


@pytest.mark.unit
@pytest.mark.asyncio
async def test_an_unvalidated_series_is_reported_not_guessed(
    settings, registry, dataset
) -> None:
    result = await _run(settings, registry, dataset, _policies(egypt="seasonal_naive"))
    assert [e.series_id for e in result.exceptions] == ["uae"]
    assert "not validated" in result.exceptions[0].reason


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_failing_champion_is_an_exception_not_another_models_numbers(
    settings, registry, dataset, monkeypatch
) -> None:
    real = project_forecast._forecast_one_model

    async def _fail_ets(*, model: str, **kwargs):
        if model == "ets":
            raise RuntimeError("ets exploded")
        return await real(model=model, **kwargs)

    monkeypatch.setattr(project_forecast, "_forecast_one_model", _fail_ets)

    result = await _run(
        settings, registry, dataset, _policies(egypt="seasonal_naive", uae="ets")
    )

    assert [f.series_id for f in result.forecasts] == ["egypt"]
    exception = result.exceptions[0]
    assert exception.series_id == "uae"
    assert exception.model == "ets"
    assert "ets exploded" in exception.reason


@pytest.mark.unit
@pytest.mark.asyncio
async def test_values_return_to_the_original_scale_through_a_log_recipe(
    settings, registry, dataset
) -> None:
    config = _config([PreparationStep(kind="log")])
    result = await _run(
        settings,
        registry,
        dataset,
        _policies(egypt="seasonal_naive", uae="seasonal_naive"),
        config=config,
    )

    egypt = next(f for f in result.forecasts if f.series_id == "egypt")
    # The series runs 100..194. A forecast still in log space would be near 5.
    assert all(50 < v < 500 for v in egypt.point), egypt.point


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_recipe_invalid_for_one_series_does_not_stop_the_others(
    settings, registry
) -> None:
    content = _csv(regions=("good",)) + b"\n2019-01-01,-5,negative\n2019-02-01,-6,negative"
    dataset_id = ingest_upload(
        filename="mixed.csv", content=content, datasets_dir=settings.datasets_dir
    ).id

    result = await run_project_forecast(
        dataset_id=dataset_id,
        config=_config([PreparationStep(kind="log")]),
        series_policies=_policies(good="seasonal_naive", negative="seasonal_naive"),
        datasets_dir=settings.datasets_dir,
        registry=FakeRegistry(),
    )

    assert [f.series_id for f in result.forecasts] == ["good"]
    assert result.exceptions[0].series_id == "negative"
    assert "above zero" in result.exceptions[0].reason


@pytest.mark.unit
@pytest.mark.asyncio
async def test_intervals_are_ordered_after_inversion(
    settings, registry, dataset
) -> None:
    result = await _run(
        settings,
        registry,
        dataset,
        _policies(egypt="ets", uae="ets"),
        config=_config([PreparationStep(kind="log")]),
    )
    for forecast in result.forecasts:
        for low, high in zip(forecast.p10, forecast.p90):
            assert low <= high


def FakeRegistry():
    from tests.conftest import FakeModelRegistry

    return FakeModelRegistry()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_an_ensemble_champion_blends_its_members(
    settings, registry, dataset
) -> None:
    policies = _policies(egypt="ensemble", uae="seasonal_naive")
    policies["egypt"]["ensemble_weights"] = {"seasonal_naive": 0.5, "ets": 0.5}

    result = await _run(settings, registry, dataset, policies)

    egypt = next(f for f in result.forecasts if f.series_id == "egypt")
    assert egypt.model == "ensemble"
    assert egypt.ensemble_weights == {"seasonal_naive": 0.5, "ets": 0.5}
    assert len(egypt.point) == 3
    assert all(np.isfinite(egypt.point))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_an_ensemble_without_weights_is_an_exception(
    settings, registry, dataset
) -> None:
    policies = _policies(egypt="ensemble", uae="seasonal_naive")
    result = await _run(settings, registry, dataset, policies)

    assert [e.series_id for e in result.exceptions] == ["egypt"]
    assert "no weights" in result.exceptions[0].reason
