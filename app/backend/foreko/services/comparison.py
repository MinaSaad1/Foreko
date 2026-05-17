"""Comparison service: TimesFM vs LightGBM with auto backtest and winner selection."""

from __future__ import annotations

import asyncio
import logging

import numpy as np
import pandas as pd

from ..schemas.comparison import (
    ComparisonRequest,
    ComparisonResponse,
    FeatureImportanceItem,
    ModelResult,
)
from . import csv_loader
from .forecaster import _infer_future_dates
from .lightgbm_baseline import fit_and_forecast
from .model_registry import ModelRegistry

logger = logging.getLogger(__name__)

# Quantile column indices in TimesFM 2.5 output (horizon, 10):
# [mean, p10, p20, p30, p40, p50, p60, p70, p80, p90]
_IDX_Q10 = 1
_IDX_Q90 = 9


def _mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    mask = actual != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])))


def _confidence(mape: float) -> str:
    if mape < 0.10:
        return "High"
    if mape < 0.25:
        return "Medium"
    return "Low"


def _winner_explanation(
    lgb_mape: float,
    tfm_mape: float,
    n_months: int,
    lgb_won: bool,
) -> str:
    diff = abs(lgb_mape - tfm_mape)

    if lgb_won:
        if n_months < 12:
            return (
                "LightGBM still won, though confidence is lower due to limited history."
            )
        if diff > 0.05:
            return (
                "LightGBM won because it picked up your data's repeating patterns"
                " better than TimesFM."
            )
        return "The two models agree closely, so this forecast is high confidence."
    else:
        if diff > 0.05:
            return (
                "TimesFM won because it learned from millions of similar series"
                " worldwide, which helps when local data is limited."
            )
        return "The two models agree closely, so this forecast is high confidence."


def _importance_items(
    importance_dict: dict[str, float],
) -> list[FeatureImportanceItem]:
    sorted_items = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)
    return [
        FeatureImportanceItem(category=cat, weight=weight)
        for cat, weight in sorted_items
        if weight > 0
    ]


def _build_model_result(
    name: str,
    display_name: str,
    point: np.ndarray,
    q10: np.ndarray | None,
    q90: np.ndarray | None,
    mape: float,
    importance: dict[str, float] | None,
) -> ModelResult:
    accuracy = max(0.0, min(1.0, 1.0 - mape))

    return ModelResult(
        name=name,  # type: ignore[arg-type]
        display_name=display_name,
        point_forecast=[round(float(v), 4) for v in point],
        p10=[round(float(v), 4) for v in (q10 if q10 is not None else point)],
        p90=[round(float(v), 4) for v in (q90 if q90 is not None else point)],
        mape=round(mape, 6),
        accuracy=round(accuracy, 4),
        confidence=_confidence(mape),
        total_forecast=round(float(point.sum()), 2),
        feature_importance=_importance_items(importance) if importance else None,
    )


async def run_comparison(
    *,
    df: pd.DataFrame,
    request: ComparisonRequest,
    registry: ModelRegistry,
) -> ComparisonResponse:
    """Backtest TimesFM and LightGBM, pick winner, return full comparison."""

    ids, values, dates = csv_loader.extract_series(df, request.mapping)

    # Use only the first series for the comparison page
    series_values = values[0]
    series_dates = dates[0]

    n = len(series_values)
    horizon = request.horizon
    holdout = min(horizon, max(6, int(n * 0.2)))
    n_train = n - holdout

    if n_train < 4:
        raise ValueError(
            f"Series has only {n} points. Need at least {holdout + 4} to run a backtest."
        )

    train_values = series_values[:n_train]
    train_dates = series_dates[:n_train]
    holdout_actual = series_values[n_train:]

    # Future dates for the actual horizon forecast (full data)
    future_dates = _infer_future_dates(series_dates, horizon)
    # Holdout window dates (for backtest forecast)
    holdout_dates = series_dates[n_train:]

    # --- TimesFM backtest ---
    tfm_holdout_point, tfm_full_quantiles, _ = await registry.forecast(
        config=request.forecast_config,
        horizon=holdout,
        inputs=[train_values.copy()],
    )
    tfm_holdout = np.asarray(tfm_holdout_point[0])

    # TimesFM full-horizon forecast (on complete history)
    tfm_full_point_raw, tfm_full_quant_raw, _ = await registry.forecast(
        config=request.forecast_config,
        horizon=horizon,
        inputs=[series_values.copy()],
    )
    tfm_full_point = np.asarray(tfm_full_point_raw[0])
    tfm_full_quant = np.asarray(tfm_full_quant_raw[0])  # (horizon, 10)
    tfm_q10 = tfm_full_quant[:, _IDX_Q10]
    tfm_q90 = tfm_full_quant[:, _IDX_Q90]

    # --- LightGBM backtest + full forecast (in thread) ---
    def _run_lgb() -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, float]]:
        holdout_res = fit_and_forecast(
            train_dates, train_values, holdout_dates, holdout
        )
        full_res = fit_and_forecast(
            series_dates, series_values, future_dates, horizon
        )
        return (
            holdout_res.point_forecast,
            full_res.point_forecast,
            full_res.point_forecast,
            full_res.feature_importance,
        )

    loop = asyncio.get_running_loop()
    lgb_holdout, lgb_full_point, _, lgb_importance = await loop.run_in_executor(
        None, _run_lgb
    )

    # --- Compute MAPEs ---
    holdout_arr = np.asarray(holdout_actual, dtype=float)
    lgb_mape = _mape(holdout_arr, lgb_holdout)
    tfm_mape = _mape(holdout_arr, tfm_holdout)

    lgb_won = lgb_mape <= tfm_mape
    n_months = int(round(n / 1.0))  # approximate; works for monthly data

    explanation = _winner_explanation(lgb_mape, tfm_mape, n_months, lgb_won)

    lgb_result = _build_model_result(
        name="your_model",
        display_name="LightGBM",
        point=lgb_full_point,
        q10=None,
        q90=None,
        mape=lgb_mape,
        importance=lgb_importance,
    )
    tfm_result = _build_model_result(
        name="global_model",
        display_name="TimesFM",
        point=tfm_full_point,
        q10=tfm_q10,
        q90=tfm_q90,
        mape=tfm_mape,
        importance=None,
    )

    winner = lgb_result if lgb_won else tfm_result
    alternative = tfm_result if lgb_won else lgb_result

    logger.info(
        "Comparison done. LightGBM MAPE=%.4f, TimesFM MAPE=%.4f. Winner: %s",
        lgb_mape,
        tfm_mape,
        winner.display_name,
    )

    return ComparisonResponse(
        winner=winner,
        alternative=alternative,
        winner_explanation=explanation,
        dates=[str(d.date()) for d in future_dates],
        historical_dates=[str(d.date()) for d in series_dates],
        historical_values=[round(float(v), 4) for v in series_values],
        backtest_holdout=holdout,
    )
