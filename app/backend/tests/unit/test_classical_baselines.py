"""Classical baselines must be the model they claim to be.

ETS called .fit(disp=False), which statsmodels' ExponentialSmoothing does not
accept, so it raised on every call and returned seasonal_naive's forecast under
the ETS name. Every "ETS" number the app ever showed was seasonal naive.
"""

from __future__ import annotations

import numpy as np
import pytest

from tempolith.services.classical_baselines import (
    arima_forecast,
    ets_forecast,
    seasonal_naive,
)


def _seasonal_series(n: int = 48) -> np.ndarray:
    return np.array(
        [100.0 + i * 2 + 8 * np.sin(i * 2 * np.pi / 12) for i in range(n)],
        dtype=float,
    )


@pytest.mark.unit
def test_ets_is_not_secretly_seasonal_naive(caplog) -> None:
    values = _seasonal_series()
    with caplog.at_level("WARNING"):
        ets_point, _p10, _p90 = ets_forecast(values, 3, "MS")
    naive_point, _n10, _n90 = seasonal_naive(values, 3, "MS")

    # The fallback is legitimate when ETS genuinely cannot fit. It is not
    # legitimate as the permanent behaviour of a candidate the user selected.
    assert "ETS failed" not in caplog.text
    assert not np.allclose(ets_point, naive_point), (
        "ETS returned seasonal naive's forecast, so it is not fitting at all"
    )


@pytest.mark.unit
def test_ets_fits_a_trend() -> None:
    # A clean upward trend: a fitted ETS must continue it, not repeat history.
    values = np.arange(100, 148, 1.0)
    point, _p10, _p90 = ets_forecast(values, 3, "MS")

    assert np.all(np.diff(point) > 0)
    assert point[0] > values[-1]


@pytest.mark.unit
def test_ets_returns_an_ordered_band() -> None:
    point, p10, p90 = ets_forecast(_seasonal_series(), 3, "MS")
    assert np.all(p10 <= point)
    assert np.all(point <= p90)


@pytest.mark.unit
def test_ets_without_enough_history_for_a_season_still_fits() -> None:
    # Fewer than 2 full periods takes the non-seasonal branch, which must fit
    # rather than fall back.
    values = np.arange(100, 118, 1.0)
    point, _p10, _p90 = ets_forecast(values, 3, "MS")
    naive, _a, _b = seasonal_naive(values, 3, "MS")
    assert not np.allclose(point, naive)


@pytest.mark.unit
def test_a_genuinely_unfittable_series_still_falls_back_rather_than_raising() -> None:
    # One point cannot fit anything. Falling back is right here; the bug was
    # falling back always.
    point, _p10, _p90 = ets_forecast(np.array([5.0]), 2, None)
    assert len(point) == 2
    assert np.isfinite(point).all()


@pytest.mark.unit
def test_arima_produces_a_finite_forecast() -> None:
    point, p10, p90 = arima_forecast(_seasonal_series(), 3, "MS")
    assert np.isfinite(point).all()
    assert np.all(p10 <= p90)
