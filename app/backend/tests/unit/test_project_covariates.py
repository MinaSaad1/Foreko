"""Covariates must reach the model, and only be demanded when one can read them.

This file exists because of blocker B1: every Task 6 test passed while
covariates were entirely disconnected, because none asserted that an assumption
changes an outcome. That is the assertion here.
"""

from __future__ import annotations

import numpy as np
import pytest

from tempolith.schemas.dataset import ColumnMapping
from tempolith.schemas.project import ProjectRevisionCreate
from tempolith.services.loaders.csv import ingest_upload
from tempolith.services.project_forecast import (
    champions_of,
    policy_consumes_covariates,
    required_future_factors,
    run_project_forecast,
)


ROLES = {"price": "known_future_numerical"}


def _csv(rows: int = 36) -> bytes:
    lines = ["month,sales,region,price"]
    for i in range(rows):
        year = 2020 + i // 12
        month = (i % 12) + 1
        lines.append(f"{year}-{month:02d}-01,{100 + i * 2},egypt,{10 + i * 0.1:.2f}")
    return "\n".join(lines).encode("utf-8")


def _config() -> ProjectRevisionCreate:
    return ProjectRevisionCreate(
        mapping=ColumnMapping(
            date_col="month", value_col="sales", series_id_col="region"
        ),
        frequency="MS",
        horizon=3,
        preparation_steps=[],
        candidate_models=["timesfm"],
        folds=2,
        primary_metric="mase",
        covariate_roles=ROLES,
    )


def _policies(champion: str, weights: dict | None = None) -> dict:
    return {
        "egypt": {
            "series_id": "egypt",
            "champion": champion,
            "challenger": None,
            "reason": f"{champion} won",
            "ensemble_weights": weights or {},
            "metrics": {},
            "eligible": [champion],
            "ineligible": {},
        }
    }


@pytest.fixture()
def dataset(settings):
    return ingest_upload(
        filename="s.csv", content=_csv(), datasets_dir=settings.datasets_dir
    ).id


@pytest.fixture()
def registry():
    from tests.conftest import FakeModelRegistry

    return FakeModelRegistry()


# ---------------------------------------------------------------------------
# The gate: only demand what a model can read
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_only_covariate_capable_champions_require_factors() -> None:
    # Asking for a value that no selected model can read means asking the user
    # to supply an input which provably does nothing (design 6.5).
    assert required_future_factors(ROLES, _policies("timesfm")) == ("price",)
    assert required_future_factors(ROLES, _policies("seasonal_naive")) == ()
    assert required_future_factors(ROLES, _policies("ets")) == ()


@pytest.mark.unit
def test_an_ensemble_is_judged_by_its_members() -> None:
    ensemble = _policies("ensemble", weights={"timesfm": 0.5, "ets": 0.5})
    assert champions_of(ensemble) == {"timesfm", "ets"}
    assert policy_consumes_covariates(ensemble) is True

    classical_only = _policies("ensemble", weights={"ets": 0.5, "seasonal_naive": 0.5})
    assert policy_consumes_covariates(classical_only) is False


@pytest.mark.unit
def test_a_mixed_portfolio_requires_factors_if_any_champion_reads_them() -> None:
    mixed = {**_policies("seasonal_naive")}
    mixed["uae"] = {**_policies("timesfm")["egypt"], "series_id": "uae"}
    assert required_future_factors(ROLES, mixed) == ("price",)


@pytest.mark.unit
def test_a_series_without_a_champion_contributes_nothing() -> None:
    assert champions_of({"x": {"champion": None}}) == set()
    assert policy_consumes_covariates({"x": {"champion": None}}) is False


# ---------------------------------------------------------------------------
# The assertion B1 was missing: an assumption must change the outcome
# ---------------------------------------------------------------------------


async def _forecast(settings, registry, dataset, price: float):
    plan = {"price": {"2023-01-01": price, "2023-02-01": price, "2023-03-01": price}}
    return await run_project_forecast(
        dataset_id=dataset,
        config=_config(),
        series_policies=_policies("timesfm"),
        datasets_dir=settings.datasets_dir,
        registry=registry,
        future_factors=plan,
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_different_assumption_produces_a_different_forecast(
    settings, registry, dataset
) -> None:
    low = await _forecast(settings, registry, dataset, 10.0)
    high = await _forecast(settings, registry, dataset, 40.0)

    assert not low.exceptions and not high.exceptions
    low_points = low.forecasts[0].point
    high_points = high.forecasts[0].point

    # The whole purpose of the Plan stage. Before B1 was fixed these were
    # identical, because the covariate never reached the model.
    assert low_points != high_points, (
        "A changed future factor produced an identical forecast: the covariate "
        "is not reaching the model."
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_the_covariate_spans_history_and_horizon(
    settings, registry, dataset
) -> None:
    # A dynamic covariate must cover the observed history as well as the future,
    # so the model can learn the relationship before applying it.
    captured: dict = {}

    class Recording(type(registry)):
        async def forecast_with_covariates(self, **kwargs):
            captured.update(kwargs)
            return await super().forecast_with_covariates(**kwargs)

    result = await _forecast(settings, Recording(), dataset, 15.0)
    assert not result.exceptions

    price = captured["dynamic_numerical_covariates"]["price"][0]
    history_length = 36
    assert len(price) == history_length + 3
    assert price[-3:] == [15.0, 15.0, 15.0]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_classical_champion_ignores_factors_without_failing(
    settings, registry, dataset
) -> None:
    result = await run_project_forecast(
        dataset_id=dataset,
        config=_config(),
        series_policies=_policies("seasonal_naive"),
        datasets_dir=settings.datasets_dir,
        registry=registry,
        future_factors={"price": {"2023-01-01": 99.0}},
    )
    # seasonal_naive cannot read price, but supplying it must not break the run.
    assert not result.exceptions
    assert all(np.isfinite(result.forecasts[0].point))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_planned_factor_absent_from_the_dataset_is_an_exception(
    settings, registry, dataset
) -> None:
    config = _config().model_copy(
        update={"covariate_roles": {"not_a_column": "known_future_numerical"}}
    )
    result = await run_project_forecast(
        dataset_id=dataset,
        config=config,
        series_policies=_policies("timesfm"),
        datasets_dir=settings.datasets_dir,
        registry=registry,
        future_factors={"not_a_column": {"2023-01-01": 1.0}},
    )
    assert result.exceptions
    assert "absent from the dataset" in result.exceptions[0].reason
