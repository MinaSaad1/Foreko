"""The fake-model flag must be off unless explicitly set.

A deterministic stand-in exists so the browser journey does not need a 1.2 GB
download and returns the same numbers every run. Its forecasts are arithmetic,
not predictions, so the one property that matters is that a real install cannot
reach it by accident.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from foreko.services.fake_registry import FakeModelRegistry
from foreko.settings import Settings


@pytest.mark.unit
def test_the_flag_defaults_to_off(tmp_path: Path) -> None:
    # The whole safety of this feature rests on this default.
    assert Settings(storage_dir=tmp_path).fake_models is False


@pytest.mark.unit
def test_the_flag_reads_from_the_environment(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FOREKO_FAKE_MODELS", "1")
    assert Settings(storage_dir=tmp_path).fake_models is True


@pytest.mark.unit
def test_a_real_app_builds_a_real_registry(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from foreko.main import create_app

    settings = Settings(storage_dir=tmp_path, preload_model=False, fake_models=False)
    with TestClient(create_app(settings=settings)) as client:
        registry = client.app.state.registry
    # Without the flag the app must build the real registry, whatever else is
    # true of the environment.
    assert not isinstance(registry, FakeModelRegistry)


@pytest.mark.unit
def test_the_flag_swaps_in_the_stand_in(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from foreko.main import create_app

    settings = Settings(storage_dir=tmp_path, preload_model=False, fake_models=True)
    with TestClient(create_app(settings=settings)) as client:
        registry = client.app.state.registry
    assert isinstance(registry, FakeModelRegistry)
    assert registry.status == "ready"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_the_stand_in_is_deterministic() -> None:
    from foreko.schemas.forecast import ForecastConfigIn

    registry = FakeModelRegistry()
    series = [np.array([10.0, 12.0, 14.0, 16.0])]

    first, _q1, _h1 = await registry.forecast(
        config=ForecastConfigIn(), horizon=3, inputs=series
    )
    second, _q2, _h2 = await registry.forecast(
        config=ForecastConfigIn(), horizon=3, inputs=series
    )
    # A journey that asserts on numbers needs the same numbers every run.
    assert np.array_equal(np.asarray(first), np.asarray(second))
    assert np.allclose(np.asarray(first)[0], 13.0)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_the_stand_in_responds_to_covariates() -> None:
    from foreko.schemas.forecast import ForecastConfigIn

    registry = FakeModelRegistry()
    history = np.array([10.0, 10.0, 10.0, 10.0])

    low, _q, _h = await registry.forecast_with_covariates(
        config=ForecastConfigIn(),
        inputs=[history],
        dynamic_numerical_covariates={"price": [[10.0] * 4 + [1.0, 1.0]]},
    )
    high, _q2, _h2 = await registry.forecast_with_covariates(
        config=ForecastConfigIn(),
        inputs=[history],
        dynamic_numerical_covariates={"price": [[10.0] * 4 + [9.0, 9.0]]},
    )
    # A fake that ignored covariates would let them be disconnected from the
    # model while every test stayed green. That is how blocker B1 survived.
    assert low[0] != high[0]
