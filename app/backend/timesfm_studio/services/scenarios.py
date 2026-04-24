"""Scenario service: what-if forecasting with user-supplied future covariate values.

A scenario is a named config: (dataset_id, mapping, horizon, factors, future_values,
counterfactuals, xreg_mode). Running it produces a forecast just like /api/factors
but with user-overridden future factor values instead of forward-filled ones.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader
from .forecaster import _infer_future_dates
from .model_registry import ModelRegistry

logger = logging.getLogger(__name__)


def _build_numeric_cov(
    df: pd.DataFrame,
    col: str,
    n_hist: int,
    horizon: int,
    future_values: list[float] | None,
    counterfactual_zero: bool,
) -> list[float]:
    raw = pd.to_numeric(df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
    hist = raw[:n_hist].tolist() if len(raw) >= n_hist else list(raw) + [0.0] * (n_hist - len(raw))
    if counterfactual_zero:
        future = [0.0] * horizon
    elif future_values is not None:
        if len(future_values) >= horizon:
            future = future_values[:horizon]
        else:
            last = future_values[-1] if future_values else (hist[-1] if hist else 0.0)
            future = list(future_values) + [last] * (horizon - len(future_values))
    else:
        last = hist[-1] if hist else 0.0
        future = [last] * horizon
    return hist + future


def _build_categorical_cov(
    df: pd.DataFrame,
    col: str,
    n_hist: int,
    horizon: int,
    future_values: list[int] | None,
) -> list[int]:
    labels = sorted(df[col].fillna("__NA__").astype(str).unique().tolist())
    mp = {v: i for i, v in enumerate(labels)}
    encoded = df[col].fillna("__NA__").astype(str).map(mp).fillna(0).astype(int).to_numpy()
    hist = encoded[:n_hist].tolist() if len(encoded) >= n_hist else list(encoded) + [0] * (n_hist - len(encoded))
    if future_values is not None and len(future_values) >= horizon:
        future = [int(v) for v in future_values[:horizon]]
    elif future_values is not None and future_values:
        last = int(future_values[-1])
        future = [int(v) for v in future_values] + [last] * (horizon - len(future_values))
    else:
        last = int(hist[-1]) if hist else 0
        future = [last] * horizon
    return hist + future


async def run_scenario(
    *,
    dataset_id: str,
    mapping: Any,
    horizon: int,
    numeric_factors: list[str],
    categorical_factors: list[str],
    future_numeric: dict[str, list[float]] | None,
    future_categorical: dict[str, list[int]] | None,
    counterfactuals: list[str],
    xreg_mode: str,
    datasets_dir: Path,
    registry: ModelRegistry,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, mapping)
    if not ids:
        raise ValueError("Dataset has no series.")
    series = values[0]
    series_dates = dates[0]
    n_hist = len(series)

    mode_map = {"additive": "xreg + timesfm", "multiplicative": "timesfm + xreg"}
    model_mode = mode_map.get(xreg_mode, "xreg + timesfm")

    from ..schemas.forecast import ForecastConfigIn

    if not numeric_factors and not categorical_factors:
        point_all, q_all, _ = await registry.forecast(
            config=ForecastConfigIn(),
            horizon=horizon,
            inputs=[series.copy()],
        )
        point = np.asarray(point_all[0], dtype=float)
        q = np.asarray(q_all[0], dtype=float)
    else:
        dyn_num: dict[str, list[list[float]]] = {}
        for col in numeric_factors:
            if col in df.columns:
                cf_zero = col in counterfactuals
                future = (future_numeric or {}).get(col)
                series_vals = _build_numeric_cov(df, col, n_hist, horizon, future, cf_zero)
                dyn_num[col] = [series_vals]
        dyn_cat: dict[str, list[list[int]]] = {}
        for col in categorical_factors:
            if col in df.columns:
                future = (future_categorical or {}).get(col)
                series_vals = _build_categorical_cov(df, col, n_hist, horizon, future)
                dyn_cat[col] = [series_vals]

        point_all, q_all, _ = await registry.forecast_with_covariates(
            config=ForecastConfigIn(),
            inputs=[series.copy()],
            dynamic_numerical_covariates=dyn_num or None,
            dynamic_categorical_covariates=dyn_cat or None,
            xreg_mode=model_mode,
        )
        point = np.asarray(point_all[0], dtype=float)
        q = np.asarray(q_all[0], dtype=float)

    future_dates = _infer_future_dates(series_dates, horizon)
    p10 = q[:, 1]
    p90 = q[:, 9]

    return {
        "historical_dates": [str(d.date()) for d in series_dates],
        "historical_values": [float(v) for v in series],
        "forecast_dates": [str(d.date()) for d in future_dates],
        "forecast": [float(v) for v in point],
        "p10": [float(v) for v in p10],
        "p90": [float(v) for v in p90],
        "total": float(point.sum()),
    }
