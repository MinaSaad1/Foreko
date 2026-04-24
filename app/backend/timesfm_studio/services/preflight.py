"""Data-quality preflight for time-series forecasting.

Scans the target series and reports: stationarity (ADF), seasonality strength,
missing fraction, outlier count, range, and recommended data transformations
(log, diff, seasonal diff, Box-Cox) based on the diagnostics.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader

logger = logging.getLogger(__name__)


def _detect_period(freq: str | None, n: int) -> int:
    if freq in ("D", "B") and n >= 14:
        return 7
    if freq in ("MS", "M") and n >= 24:
        return 12
    if freq in ("W",) and n >= 104:
        return 52
    return 1


def _adf(values: np.ndarray) -> dict[str, float]:
    try:
        from statsmodels.tsa.stattools import adfuller
        result = adfuller(values, autolag="AIC")
        return {
            "statistic": float(result[0]),
            "p_value": float(result[1]),
            "stationary": bool(result[1] < 0.05),
        }
    except Exception as exc:
        logger.warning("ADF failed: %s", exc)
        return {"statistic": 0.0, "p_value": 1.0, "stationary": False}


def _seasonality_strength(values: np.ndarray, period: int) -> dict[str, float]:
    """Hyndman & Athanasopoulos seasonality strength from STL decomposition."""
    try:
        from statsmodels.tsa.seasonal import STL
        if period <= 1 or len(values) < 2 * period:
            return {"seasonal_strength": 0.0, "trend_strength": 0.0}
        r = STL(values, period=period, robust=True).fit()
        resid_var = float(np.var(r.resid))
        seasonal_strength = max(0.0, 1.0 - resid_var / max(float(np.var(r.resid + r.seasonal)), 1e-9))
        trend_strength = max(0.0, 1.0 - resid_var / max(float(np.var(r.resid + r.trend)), 1e-9))
        return {
            "seasonal_strength": round(seasonal_strength, 4),
            "trend_strength": round(trend_strength, 4),
        }
    except Exception as exc:
        logger.warning("seasonality strength failed: %s", exc)
        return {"seasonal_strength": 0.0, "trend_strength": 0.0}


def _outliers_iqr(values: np.ndarray) -> int:
    q1, q3 = np.percentile(values, [25, 75])
    iqr = q3 - q1
    if iqr < 1e-9:
        return 0
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return int(np.sum((values < lo) | (values > hi)))


def _recommend_transforms(
    values: np.ndarray,
    adf_stationary: bool,
    seasonal_strength: float,
    trend_strength: float,
    skewness: float,
) -> list[dict[str, str]]:
    recs: list[dict[str, str]] = []
    if not adf_stationary:
        if trend_strength > 0.3:
            recs.append(
                {"transform": "diff", "reason": "series has a trend — first difference to make stationary"}
            )
        if seasonal_strength > 0.3:
            recs.append(
                {"transform": "seasonal_diff", "reason": "seasonal pattern detected — seasonal difference"}
            )
    if (values > 0).all() and abs(skewness) > 1.0:
        if skewness > 1.0:
            recs.append(
                {"transform": "log", "reason": "right-skewed positive values — log transform compresses tail"}
            )
        if abs(skewness) > 2.0:
            recs.append(
                {"transform": "box_cox", "reason": "strong skew — Box-Cox chooses an optimal power"}
            )
    return recs


async def run_preflight(
    *,
    dataset_id: str,
    mapping: Any,
    datasets_dir: Path,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, mapping)
    if not ids:
        raise ValueError("Dataset has no series.")

    series = values[0]
    series_dates = dates[0]
    n = len(series)

    freq = None
    try:
        freq = pd.infer_freq(series_dates)
    except Exception:
        pass
    period = _detect_period(freq, n)

    # Missing check on source column
    source = pd.to_numeric(df[mapping.value_col], errors="coerce")
    missing_count = int(source.isna().sum())
    missing_rate = float(missing_count) / max(len(source), 1)

    adf_result = _adf(series)
    season = _seasonality_strength(series, period)
    outliers = _outliers_iqr(series)

    from scipy import stats

    skewness = float(stats.skew(series)) if n > 2 else 0.0
    kurt = float(stats.kurtosis(series)) if n > 3 else 0.0

    transforms = _recommend_transforms(
        series, adf_result["stationary"], season["seasonal_strength"], season["trend_strength"], skewness
    )

    # Score
    score = 100
    if missing_rate > 0.05:
        score -= 20
    if n < 50:
        score -= 15
    if n < 24:
        score -= 15
    if outliers / max(n, 1) > 0.05:
        score -= 10
    if not adf_result["stationary"] and season["trend_strength"] < 0.2:
        score -= 5
    if kurt > 5:
        score -= 5
    score = max(0, score)

    warnings_list: list[str] = []
    if missing_rate > 0.05:
        warnings_list.append(f"{missing_rate * 100:.1f}% of rows have missing target values")
    if n < 50:
        warnings_list.append(f"Only {n} observations — forecasts will be low-confidence")
    if outliers > 0.05 * n:
        warnings_list.append(f"{outliers} outliers detected ({outliers * 100 / n:.1f}%) — consider robust methods")

    return {
        "n_points": int(n),
        "freq": freq or "unknown",
        "period": period,
        "first_date": str(series_dates[0].date()) if len(series_dates) else None,
        "last_date": str(series_dates[-1].date()) if len(series_dates) else None,
        "missing_count": missing_count,
        "missing_rate": round(missing_rate, 4),
        "outlier_count": outliers,
        "range": {
            "min": float(np.min(series)),
            "max": float(np.max(series)),
            "mean": float(np.mean(series)),
            "std": float(np.std(series)),
        },
        "skewness": round(skewness, 3),
        "kurtosis": round(kurt, 3),
        "adf": adf_result,
        "seasonality": season,
        "recommended_transforms": transforms,
        "quality_score": score,
        "warnings": warnings_list,
    }
