"""Factor analytics: per-factor stats + dual forecast (baseline vs augmented).

The core idea: give the analyst a crisp, quantitative answer to "how much does
each factor move the forecast?" by running two forecasts in parallel (no
factors, all factors) and returning both plus the descriptive + correlation
stats used to rank each factor's apparent influence.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import numpy as np
import pandas as pd

from ..schemas.factors import (
    FactorAnalysisRequest,
    FactorAnalysisResponse,
    FactorImpact,
    FactorStat,
)
from . import csv_loader
from .forecaster import _infer_future_dates
from .model_registry import ModelRegistry
from .series import aggregate_duplicates_by_date

logger = logging.getLogger(__name__)

# Quantile column indices in TimesFM 2.5 output (horizon, 10).
_IDX_Q10 = 1
_IDX_Q90 = 9


def _pad_or_slice(arr: np.ndarray, target_len: int) -> list[float]:
    """Forward-fill *arr* to *target_len* or slice it down."""
    if len(arr) >= target_len:
        return arr[:target_len].tolist()
    last = arr[-1] if len(arr) else 0.0
    pad = np.full(target_len - len(arr), last)
    return np.concatenate([arr, pad]).tolist()


def _safe_corr(x: np.ndarray, y: np.ndarray) -> float:
    """Pearson correlation, returning 0.0 if either series has no variance."""
    if len(x) < 2 or len(y) < 2:
        return 0.0
    if np.std(x) == 0.0 or np.std(y) == 0.0:
        return 0.0
    r = float(np.corrcoef(x, y)[0, 1])
    if np.isnan(r):
        return 0.0
    return r


def _safe_slope(x: np.ndarray, y: np.ndarray) -> float | None:
    """Linear regression slope of y on x (the factor's elasticity)."""
    if len(x) < 2 or np.std(x) == 0.0:
        return None
    try:
        # Use polyfit for numerical stability.
        slope, _ = np.polyfit(x, y, 1)
        if np.isnan(slope):
            return None
        return float(slope)
    except Exception:
        return None


def _numeric_stat(
    name: str,
    factor_values: np.ndarray,
    target_values: np.ndarray,
) -> FactorStat:
    """Compute descriptive + correlation stats for a numeric factor."""
    correlation = _safe_corr(factor_values, target_values)
    elasticity = _safe_slope(factor_values, target_values)
    return FactorStat(
        name=name,
        kind="numeric",
        mean=float(np.mean(factor_values)),
        std=float(np.std(factor_values)),
        min_value=float(np.min(factor_values)),
        max_value=float(np.max(factor_values)),
        last_value=float(factor_values[-1]) if len(factor_values) else None,
        correlation=round(correlation, 4),
        elasticity=round(elasticity, 6) if elasticity is not None else None,
        influence=0.0,  # filled in later after normalization
    )


def _categorical_stat(
    name: str,
    raw_series: pd.Series,
    target_values: np.ndarray,
) -> FactorStat:
    """Compute correlation + descriptors for a categorical factor.

    Categoricals are label-encoded and then Pearson-correlated with the target.
    For binary flags (0/1) this is the point-biserial correlation; for
    multi-class it's a crude but interpretable proxy that respects the category
    ordering. Good enough for influence ranking.
    """

    filled = raw_series.fillna("__NA__").astype(str)
    categories = sorted(filled.unique().tolist())
    label_map = {c: i for i, c in enumerate(categories)}
    encoded = filled.map(label_map).to_numpy(dtype=float)
    correlation = _safe_corr(encoded, target_values)

    mode = filled.mode()
    top = str(mode.iloc[0]) if len(mode) else None

    return FactorStat(
        name=name,
        kind="categorical",
        unique_count=len(categories),
        top_category=top,
        correlation=round(correlation, 4),
        elasticity=None,
        influence=0.0,
    )


def _normalize_influence(stats: list[FactorStat]) -> list[FactorStat]:
    """Set each factor's influence to |corr| / sum(|corr|)."""
    abs_corrs = [abs(s.correlation) for s in stats]
    total = sum(abs_corrs)
    if total <= 0.0:
        # All factors uncorrelated: split evenly so the UI still shows something.
        even = 1.0 / len(stats) if stats else 0.0
        return [s.model_copy(update={"influence": round(even, 4)}) for s in stats]
    return [
        s.model_copy(update={"influence": round(abs(s.correlation) / total, 4)})
        for s in stats
    ]


def _build_covariate_dicts(
    df: pd.DataFrame,
    mapping: Any,
    values_len: int,
    horizon: int,
    numeric_factors: list[str],
    categorical_factors: list[str],
) -> tuple[dict[str, list[list[float]]] | None, dict[str, list[list[int]]] | None]:
    """Build single-series covariate dicts by forward-filling the future window."""

    dyn_num: dict[str, list[list[float]]] = {}
    for col in numeric_factors:
        if col not in df.columns:
            continue
        raw = pd.to_numeric(df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        dyn_num[col] = [_pad_or_slice(raw, values_len + horizon)]

    dyn_cat: dict[str, list[list[int]]] = {}
    for col in categorical_factors:
        if col not in df.columns:
            continue
        sorted_unique = sorted(df[col].fillna("__NA__").astype(str).unique().tolist())
        label_map = {v: i for i, v in enumerate(sorted_unique)}
        raw = df[col].fillna("__NA__").astype(str).map(label_map).fillna(0).astype(int).to_numpy()
        padded = _pad_or_slice(raw.astype(float), values_len + horizon)
        dyn_cat[col] = [[int(x) for x in padded]]

    return (dyn_num or None, dyn_cat or None)


async def analyze_factors(
    *,
    df: pd.DataFrame,
    request: FactorAnalysisRequest,
    registry: ModelRegistry,
) -> FactorAnalysisResponse:
    """Compute per-factor stats and run baseline + factor-augmented forecasts.

    Kept to a single series (first one in the dataset) because the factors page
    is framed around a single business metric.
    """

    # When the user left series_id_col empty but the CSV stacks multiple
    # series, collapse duplicate dates so factor stats and covariate arrays
    # line up with the single aggregated series extract_series will return.
    if request.mapping.series_id_col is None:
        df = aggregate_duplicates_by_date(df, request.mapping)
    ids, values, dates = csv_loader.extract_series(df, request.mapping)

    if not ids:
        raise ValueError("Dataset produced zero series after mapping.")

    series_values = values[0]
    series_dates = dates[0]
    n = len(series_values)

    # Build a dataframe that is aligned to the target series order so factor
    # stats are computed against the matching target values.
    if request.mapping.series_id_col is None:
        aligned = df.copy()
    else:
        sid = ids[0]
        aligned = df[df[request.mapping.series_id_col].astype(str) == sid].copy()
    aligned = aligned.reset_index(drop=True)
    # Make sure aligned and series_values have the same length; truncate to min.
    k = min(len(aligned), n)
    aligned = aligned.iloc[:k].copy()
    aligned_target = series_values[:k]

    # Per-factor stats.
    stats: list[FactorStat] = []
    for col in request.numeric_factors:
        if col not in aligned.columns:
            continue
        raw = (
            pd.to_numeric(aligned[col], errors="coerce")
            .fillna(0.0)
            .to_numpy(dtype=float)
        )
        stats.append(_numeric_stat(col, raw, aligned_target))

    for col in request.categorical_factors:
        if col not in aligned.columns:
            continue
        stats.append(_categorical_stat(col, aligned[col], aligned_target))

    stats = _normalize_influence(stats)

    # Run baseline (no factors) and augmented (with factors) forecasts in
    # parallel so total latency is ~1 forecast, not 2.
    baseline_task = registry.forecast(
        config=request.forecast_config,
        horizon=request.horizon,
        inputs=[series_values.copy()],
    )

    # Map the API-friendly xreg_mode to the model's strings.
    mode_map = {"additive": "xreg + timesfm", "multiplicative": "timesfm + xreg"}
    model_mode = mode_map.get(request.xreg_mode, "xreg + timesfm")

    has_factors = bool(request.numeric_factors or request.categorical_factors)

    if has_factors:
        dyn_num, dyn_cat = _build_covariate_dicts(
            df=df,
            mapping=request.mapping,
            values_len=n,
            horizon=request.horizon,
            numeric_factors=request.numeric_factors,
            categorical_factors=request.categorical_factors,
        )
        factors_task = registry.forecast_with_covariates(
            config=request.forecast_config,
            inputs=[series_values.copy()],
            dynamic_numerical_covariates=dyn_num,
            dynamic_categorical_covariates=dyn_cat,
            xreg_mode=model_mode,
        )
        (base_point, base_q, _), (fact_point, fact_q, _) = await asyncio.gather(
            baseline_task, factors_task
        )
    else:
        base_point, base_q, _ = await baseline_task
        fact_point, fact_q = base_point, base_q

    baseline_arr = np.asarray(base_point[0], dtype=float)
    baseline_quantiles = np.asarray(base_q[0], dtype=float)
    factors_arr = np.asarray(fact_point[0], dtype=float)
    factors_quantiles = np.asarray(fact_q[0], dtype=float)

    future_dates = _infer_future_dates(series_dates, request.horizon)

    # Impact: delta between sums over the horizon.
    total_baseline = float(baseline_arr.sum())
    total_with = float(factors_arr.sum())
    delta_abs = total_with - total_baseline
    delta_pct = (delta_abs / total_baseline) if abs(total_baseline) > 1e-9 else 0.0

    if not has_factors:
        direction = "flat"
        top_driver = None
    else:
        direction = "up" if delta_abs > 0.01 * abs(total_baseline) else (
            "down" if delta_abs < -0.01 * abs(total_baseline) else "flat"
        )
        ranked = sorted(stats, key=lambda s: abs(s.correlation), reverse=True)
        top_driver = ranked[0].name if ranked else None

    impact = FactorImpact(
        total_baseline=round(total_baseline, 2),
        total_with_factors=round(total_with, 2),
        delta_absolute=round(delta_abs, 2),
        delta_percent=round(delta_pct, 6),
        top_driver=top_driver,
        direction=direction,
    )

    return FactorAnalysisResponse(
        factors=stats,
        impact=impact,
        historical_dates=[str(d.date()) for d in series_dates],
        historical_values=[float(v) for v in series_values],
        forecast_dates=[str(d.date()) for d in future_dates],
        baseline_forecast=[float(v) for v in baseline_arr],
        baseline_p10=[float(v) for v in baseline_quantiles[:, _IDX_Q10]],
        baseline_p90=[float(v) for v in baseline_quantiles[:, _IDX_Q90]],
        factors_forecast=[float(v) for v in factors_arr],
        factors_p10=[float(v) for v in factors_quantiles[:, _IDX_Q10]],
        factors_p90=[float(v) for v in factors_quantiles[:, _IDX_Q90]],
    )
