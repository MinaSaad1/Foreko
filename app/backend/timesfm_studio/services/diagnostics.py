"""Forecast diagnostics: residuals, Q-Q, ACF, STL decomposition.

Computes everything a reviewer expects to see before trusting a forecast.
All inputs come from a single (dataset, mapping, model) tuple; the caller
is expected to have already performed a recent forecast so that we can
recompute residuals on a fresh hold-out.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from . import csv_loader
from .classical_baselines import ets_forecast, seasonal_naive
from .forecaster import _infer_future_dates
from .model_registry import ModelRegistry

logger = logging.getLogger(__name__)


def _detect_period(freq: str | None, n: int) -> int:
    if freq in ("D", "B") and n >= 14:
        return 7
    if freq in ("MS", "M") and n >= 24:
        return 12
    if freq in ("W",) and n >= 104:
        return 52
    return 1


async def _forecast_for_diagnostics(
    model: str,
    values: np.ndarray,
    dates: pd.DatetimeIndex,
    horizon: int,
    freq: str | None,
    registry: ModelRegistry,
) -> np.ndarray:
    if model == "timesfm":
        from ..schemas.forecast import ForecastConfigIn
        point_all, _, _ = await registry.forecast(
            config=ForecastConfigIn(),
            horizon=horizon,
            inputs=[values.copy()],
        )
        return np.asarray(point_all[0], dtype=float)
    if model == "ets":
        p, _, _ = ets_forecast(values, horizon, freq)
        return p
    if model == "seasonal_naive":
        p, _, _ = seasonal_naive(values, horizon, freq)
        return p
    p, _, _ = seasonal_naive(values, horizon, freq)
    return p


def _histogram(values: np.ndarray, bins: int = 30) -> dict[str, list[float]]:
    counts, edges = np.histogram(values, bins=bins)
    centers = ((edges[:-1] + edges[1:]) / 2).tolist()
    return {"centers": centers, "counts": [int(c) for c in counts]}


def _qq_points(residuals: np.ndarray) -> list[list[float]]:
    if len(residuals) < 3:
        return []
    std = np.std(residuals)
    if std < 1e-9:
        return []
    normalized = (residuals - np.mean(residuals)) / std
    sorted_n = np.sort(normalized)
    n = len(sorted_n)
    theoretical = stats.norm.ppf((np.arange(1, n + 1) - 0.5) / n)
    return [[float(t), float(s)] for t, s in zip(theoretical, sorted_n)]


def _acf(residuals: np.ndarray, nlags: int = 30) -> list[float]:
    try:
        from statsmodels.tsa.stattools import acf as sm_acf
        nlags = min(nlags, max(1, len(residuals) // 2 - 1))
        vals = sm_acf(residuals, nlags=nlags, fft=True)
        return [float(v) for v in vals]
    except Exception:
        return []


def _stl(values: np.ndarray, period: int) -> dict[str, list[float]]:
    try:
        from statsmodels.tsa.seasonal import STL
        if period <= 1 or len(values) < 2 * period:
            return {
                "observed": [float(v) for v in values],
                "trend": [float(v) for v in values],
                "seasonal": [0.0] * len(values),
                "residual": [0.0] * len(values),
            }
        result = STL(values, period=period, robust=True).fit()
        return {
            "observed": [float(v) for v in values],
            "trend": [float(v) for v in result.trend],
            "seasonal": [float(v) for v in result.seasonal],
            "residual": [float(v) for v in result.resid],
        }
    except Exception as exc:
        logger.warning("STL failed: %s", exc)
        return {
            "observed": [float(v) for v in values],
            "trend": [float(v) for v in values],
            "seasonal": [0.0] * len(values),
            "residual": [0.0] * len(values),
        }


def _ljung_box(residuals: np.ndarray, lags: int = 10) -> dict[str, float]:
    try:
        from statsmodels.stats.diagnostic import acorr_ljungbox
        if len(residuals) < lags + 2:
            return {"statistic": 0.0, "p_value": 1.0}
        result = acorr_ljungbox(residuals, lags=[lags], return_df=True)
        return {
            "statistic": float(result["lb_stat"].iloc[-1]),
            "p_value": float(result["lb_pvalue"].iloc[-1]),
        }
    except Exception:
        return {"statistic": 0.0, "p_value": 1.0}


async def run_diagnostics(
    *,
    dataset_id: str,
    mapping: Any,
    horizon: int,
    model: str,
    datasets_dir: Path,
    registry: ModelRegistry,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, mapping)
    if not ids:
        raise ValueError("Dataset has no series.")

    series = values[0]
    series_dates = dates[0]
    n = len(series)
    if n < horizon + 24:
        raise ValueError(f"Need at least {horizon + 24} points, have {n}.")

    freq = None
    try:
        freq = pd.infer_freq(series_dates)
    except Exception:
        pass

    period = _detect_period(freq, n)

    # Hold out last `horizon` points for residual computation
    train = series[:-horizon]
    train_dates = series_dates[:-horizon]
    actual = series[-horizon:]

    forecast = await _forecast_for_diagnostics(
        model=model,
        values=train,
        dates=train_dates,
        horizon=horizon,
        freq=freq,
        registry=registry,
    )
    residuals = actual - forecast

    # Per-horizon MAPE (single hold-out)
    per_horizon_mape = []
    for h in range(horizon):
        if abs(actual[h]) > 1e-9:
            per_horizon_mape.append(float(abs((actual[h] - forecast[h]) / actual[h])))
        else:
            per_horizon_mape.append(0.0)

    # STL on the full history
    stl_result = _stl(series, period)

    return {
        "model": model,
        "horizon": horizon,
        "n_points": int(n),
        "freq": freq or "unknown",
        "period": period,
        "forecast_dates": [str(d.date()) for d in series_dates[-horizon:]],
        "forecast": [float(v) for v in forecast],
        "actual": [float(v) for v in actual],
        "residuals": [float(v) for v in residuals],
        "residual_stats": {
            "mean": float(np.mean(residuals)),
            "std": float(np.std(residuals)),
            "skew": float(stats.skew(residuals)) if len(residuals) > 2 else 0.0,
            "kurtosis": float(stats.kurtosis(residuals)) if len(residuals) > 3 else 0.0,
        },
        "residual_histogram": _histogram(residuals, bins=20),
        "qq_points": _qq_points(residuals),
        "acf": _acf(residuals, nlags=min(30, len(residuals) - 1)),
        "ljung_box": _ljung_box(residuals, lags=min(10, len(residuals) - 2)),
        "per_horizon_mape": per_horizon_mape,
        "stl": stl_result,
        "stl_dates": [str(d.date()) for d in series_dates],
    }
