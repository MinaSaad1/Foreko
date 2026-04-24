"""Classical time-series baselines: seasonal naive, ETS, ARIMA, Prophet.

Each function returns ``(point_forecast, p10, p90)`` as numpy arrays of length
``horizon``. Failures degrade gracefully: on exception, the function returns
the naive seasonal/last-value forecast so callers never hard-fail the
comparison loop.
"""

from __future__ import annotations

import logging
import warnings
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


def _detect_period(values: np.ndarray, freq: str | None) -> int:
    """Pick a sensible seasonal period based on freq and series length."""
    n = len(values)
    if freq in ("D", "B"):
        return 7 if n >= 14 else 1
    if freq in ("W",):
        return 52 if n >= 104 else 1
    if freq in ("MS", "M"):
        return 12 if n >= 24 else 1
    if freq in ("H",):
        return 24 if n >= 48 else 1
    if n >= 14:
        return 7
    return 1


def seasonal_naive(values: np.ndarray, horizon: int, freq: str | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    period = _detect_period(values, freq)
    n = len(values)
    if period <= 1 or n < period:
        last = values[-1] if n else 0.0
        point = np.full(horizon, last, dtype=float)
    else:
        last_season = values[-period:]
        reps = int(np.ceil(horizon / period))
        tiled = np.tile(last_season, reps)[:horizon]
        point = tiled.astype(float)

    resid_std = float(np.std(np.diff(values))) if n > 1 else 1.0
    width = 1.28 * resid_std  # ~p10/p90 for normal
    return point, point - width, point + width


def ets_forecast(values: np.ndarray, horizon: int, freq: str | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
    except ImportError:
        return seasonal_naive(values, horizon, freq)

    period = _detect_period(values, freq)
    try:
        if period > 1 and len(values) >= 2 * period:
            model = ExponentialSmoothing(
                values,
                trend="add",
                seasonal="add",
                seasonal_periods=period,
                initialization_method="estimated",
            ).fit(disp=False)
        else:
            model = ExponentialSmoothing(
                values,
                trend="add",
                seasonal=None,
                initialization_method="estimated",
            ).fit(disp=False)
        point = np.asarray(model.forecast(horizon), dtype=float)
        residuals = np.asarray(model.resid, dtype=float)
        std = float(np.std(residuals)) if len(residuals) else 1.0
        return point, point - 1.28 * std, point + 1.28 * std
    except Exception as exc:
        logger.warning("ETS failed: %s, falling back to seasonal naive", exc)
        return seasonal_naive(values, horizon, freq)


def arima_forecast(values: np.ndarray, horizon: int, freq: str | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    try:
        import pmdarima as pm
    except ImportError:
        return _arima_statsmodels(values, horizon, freq)

    period = _detect_period(values, freq)
    try:
        model = pm.auto_arima(
            values,
            seasonal=period > 1,
            m=period if period > 1 else 1,
            suppress_warnings=True,
            error_action="ignore",
            stepwise=True,
            max_p=3,
            max_q=3,
            max_P=2,
            max_Q=2,
            with_intercept=True,
        )
        point, conf = model.predict(n_periods=horizon, return_conf_int=True, alpha=0.2)
        point = np.asarray(point, dtype=float)
        p10 = np.asarray(conf[:, 0], dtype=float)
        p90 = np.asarray(conf[:, 1], dtype=float)
        return point, p10, p90
    except Exception as exc:
        logger.warning("ARIMA failed: %s, falling back", exc)
        return _arima_statsmodels(values, horizon, freq)


def _arima_statsmodels(values: np.ndarray, horizon: int, freq: str | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    try:
        from statsmodels.tsa.arima.model import ARIMA
        model = ARIMA(values, order=(1, 1, 1)).fit()
        fc = model.get_forecast(steps=horizon)
        point = np.asarray(fc.predicted_mean, dtype=float)
        conf = fc.conf_int(alpha=0.2)
        p10 = np.asarray(conf[:, 0], dtype=float)
        p90 = np.asarray(conf[:, 1], dtype=float)
        return point, p10, p90
    except Exception:
        return seasonal_naive(values, horizon, freq)


def prophet_forecast(
    dates: list[Any],
    values: np.ndarray,
    horizon: int,
    freq: str | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    try:
        from prophet import Prophet
        import pandas as pd
    except ImportError:
        return seasonal_naive(values, horizon, freq)

    try:
        df = pd.DataFrame({"ds": pd.to_datetime(dates), "y": values})
        m = Prophet(interval_width=0.8, uncertainty_samples=200)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m.fit(df)
        pf = freq if freq in ("D", "W", "MS", "M", "H") else "D"
        future = m.make_future_dataframe(periods=horizon, freq=pf)
        fc = m.predict(future).tail(horizon)
        return (
            np.asarray(fc["yhat"].values, dtype=float),
            np.asarray(fc["yhat_lower"].values, dtype=float),
            np.asarray(fc["yhat_upper"].values, dtype=float),
        )
    except Exception as exc:
        logger.warning("Prophet failed: %s, falling back", exc)
        return seasonal_naive(values, horizon, freq)
