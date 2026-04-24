"""Multiple anomaly detection methods with cross-agreement scoring.

Provides 5 methods: Z-score, IQR, STL residual, IsolationForest, quantile-PI.
The PI method reuses the TimesFM forecast from existing anomaly.py flow; the
others are pure-stats on the historical series. Returns per-date decisions
plus an agreement matrix showing overlap between methods.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader

logger = logging.getLogger(__name__)

METHOD_IDS = ["z_score", "iqr", "stl_residual", "isolation_forest", "quantile_pi"]


@dataclass
class MethodResult:
    name: str
    flags: np.ndarray  # bool array over the series length


def _z_score(values: np.ndarray, threshold: float = 3.0) -> np.ndarray:
    # Detrend with rolling median for robustness
    series = pd.Series(values)
    rolling = series.rolling(window=max(7, len(values) // 20), min_periods=1, center=True).median()
    resid = (series - rolling).to_numpy()
    std = np.std(resid)
    if std < 1e-9:
        return np.zeros(len(values), dtype=bool)
    z = np.abs(resid) / std
    return z > threshold


def _iqr(values: np.ndarray, factor: float = 3.0) -> np.ndarray:
    q1, q3 = np.percentile(values, [25, 75])
    iqr = q3 - q1
    if iqr < 1e-9:
        return np.zeros(len(values), dtype=bool)
    lo, hi = q1 - factor * iqr, q3 + factor * iqr
    return (values < lo) | (values > hi)


def _stl_residual(values: np.ndarray, period: int, threshold: float = 3.0) -> np.ndarray:
    try:
        from statsmodels.tsa.seasonal import STL
        if period <= 1 or len(values) < 2 * period:
            return _z_score(values, threshold)
        result = STL(values, period=period, robust=True).fit()
        resid = np.asarray(result.resid)
        std = np.std(resid)
        if std < 1e-9:
            return np.zeros(len(values), dtype=bool)
        return np.abs(resid) / std > threshold
    except Exception:
        return _z_score(values, threshold)


def _isolation_forest(values: np.ndarray, contamination: float = 0.01) -> np.ndarray:
    try:
        from sklearn.ensemble import IsolationForest
        X = values.reshape(-1, 1)
        model = IsolationForest(contamination=contamination, random_state=42)
        pred = model.fit_predict(X)
        return pred == -1
    except Exception as exc:
        logger.warning("IsolationForest failed: %s", exc)
        return np.zeros(len(values), dtype=bool)


async def detect_all_methods(
    *,
    dataset_id: str,
    mapping: Any,
    critical_z: float,
    warning_z: float,
    datasets_dir: Path,
    existing_pi_flags: np.ndarray | None = None,
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
    from .preflight import _detect_period
    period = _detect_period(freq, n)

    z = _z_score(series, threshold=critical_z)
    iqr = _iqr(series, factor=3.0)
    stl = _stl_residual(series, period, threshold=critical_z)
    iso = _isolation_forest(series)
    pi = existing_pi_flags if existing_pi_flags is not None else np.zeros(n, dtype=bool)

    flags = {
        "z_score": z,
        "iqr": iqr,
        "stl_residual": stl,
        "isolation_forest": iso,
        "quantile_pi": pi,
    }

    # Agreement matrix: Jaccard-like overlap for each pair
    matrix: dict[str, dict[str, float]] = {}
    for m1 in METHOD_IDS:
        matrix[m1] = {}
        for m2 in METHOD_IDS:
            a = flags[m1]
            b = flags[m2]
            union = int(np.sum(a | b))
            if union == 0:
                matrix[m1][m2] = 1.0 if m1 == m2 else 0.0
                continue
            matrix[m1][m2] = float(np.sum(a & b) / union)

    # Per-index agreement count
    votes = np.sum(np.stack([flags[m] for m in METHOD_IDS]), axis=0)

    # Build per-record result
    records = []
    for i in range(n):
        n_votes = int(votes[i])
        if n_votes == 0:
            continue
        methods_detected = [m for m in METHOD_IDS if flags[m][i]]
        severity = "CRITICAL" if n_votes >= 3 else ("WARNING" if n_votes >= 2 else "MILD")
        reason_parts = []
        if "z_score" in methods_detected:
            reason_parts.append(f"{critical_z:g}σ outlier")
        if "iqr" in methods_detected:
            reason_parts.append("outside IQR fences")
        if "stl_residual" in methods_detected:
            reason_parts.append("unusual after removing trend+seasonality")
        if "isolation_forest" in methods_detected:
            reason_parts.append("flagged by isolation forest")
        if "quantile_pi" in methods_detected:
            reason_parts.append("outside forecast prediction interval")

        records.append({
            "index": i,
            "date": str(series_dates[i].date()),
            "value": float(series[i]),
            "votes": n_votes,
            "methods_detected": methods_detected,
            "severity": severity,
            "reason": "; ".join(reason_parts),
        })

    # Counts per method
    method_counts = {m: int(np.sum(flags[m])) for m in METHOD_IDS}

    return {
        "series_length": n,
        "methods": METHOD_IDS,
        "agreement_matrix": matrix,
        "method_counts": method_counts,
        "records": records,
        "dates": [str(d.date()) for d in series_dates],
        "values": [float(v) for v in series],
    }
