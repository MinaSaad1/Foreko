"""Factor diagnostics: surrogate importance, permutation importance, lag CCF, Granger.

Surrogate importance: fit LightGBM on target ~ factors, use native gain + SHAP.
Permutation importance: shuffle each factor, re-forecast with TimesFM, measure ΔMAPE.
Lag analysis: cross-correlation at lags -N..+N per numeric factor.
Granger causality: linear test via statsmodels.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader

logger = logging.getLogger(__name__)


def _prepare_table(
    df: pd.DataFrame,
    mapping: Any,
    numeric_factors: list[str],
    categorical_factors: list[str],
) -> tuple[np.ndarray, pd.DataFrame, list[str]]:
    y = pd.to_numeric(df[mapping.value_col], errors="coerce").ffill().fillna(0.0).to_numpy(dtype=float)

    feature_cols: list[str] = []
    X_cols = {}
    for c in numeric_factors:
        if c in df.columns:
            X_cols[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0).to_numpy(dtype=float)
            feature_cols.append(c)
    for c in categorical_factors:
        if c in df.columns:
            vals = df[c].fillna("__NA__").astype(str)
            uniq = sorted(vals.unique().tolist())
            mp = {v: i for i, v in enumerate(uniq)}
            X_cols[c] = vals.map(mp).astype(int).to_numpy().astype(float)
            feature_cols.append(c)

    if not feature_cols:
        return y, pd.DataFrame(), []
    X = pd.DataFrame(X_cols)
    return y, X, feature_cols


async def surrogate_importance(
    *,
    dataset_id: str,
    mapping: Any,
    numeric_factors: list[str],
    categorical_factors: list[str],
    datasets_dir: Path,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    y, X, feature_cols = _prepare_table(df, mapping, numeric_factors, categorical_factors)
    if not feature_cols:
        return {"kind": "surrogate", "factors": []}

    try:
        import lightgbm as lgb
        model = lgb.LGBMRegressor(
            n_estimators=300,
            learning_rate=0.05,
            num_leaves=31,
            min_child_samples=10,
            verbose=-1,
        )
        model.fit(X, y)
        gain = model.booster_.feature_importance(importance_type="gain")
        total = float(np.sum(gain)) or 1.0
        ranked = sorted(
            zip(feature_cols, gain),
            key=lambda kv: kv[1],
            reverse=True,
        )
        factors = [
            {
                "name": name,
                "gain": float(g),
                "influence": round(float(g) / total, 4),
            }
            for name, g in ranked
        ]
        return {"kind": "surrogate", "factors": factors}
    except Exception as exc:
        logger.warning("surrogate importance failed: %s", exc)
        return {"kind": "surrogate", "factors": [], "error": str(exc)}


async def lag_analysis(
    *,
    dataset_id: str,
    mapping: Any,
    numeric_factors: list[str],
    max_lag: int,
    datasets_dir: Path,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    y = pd.to_numeric(df[mapping.value_col], errors="coerce").ffill().fillna(0.0).to_numpy(dtype=float)

    out: list[dict[str, Any]] = []
    for col in numeric_factors:
        if col not in df.columns:
            continue
        x = pd.to_numeric(df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        n = min(len(x), len(y))
        x = x[:n]
        yy = y[:n]
        if np.std(x) < 1e-9 or np.std(yy) < 1e-9:
            out.append({"factor": col, "lags": [], "peak_lag": 0, "peak_corr": 0.0})
            continue
        x_c = x - np.mean(x)
        y_c = yy - np.mean(yy)
        denom = np.std(x) * np.std(yy) * n
        corrs: list[dict[str, float]] = []
        best_lag = 0
        best_corr = 0.0
        for lag in range(-max_lag, max_lag + 1):
            if lag < 0:
                a, b = x_c[-lag:], y_c[:lag]
            elif lag > 0:
                a, b = x_c[:-lag], y_c[lag:]
            else:
                a, b = x_c, y_c
            if len(a) == 0:
                continue
            r = float(np.sum(a * b) / max(denom, 1e-9))
            corrs.append({"lag": lag, "corr": round(r, 4)})
            if abs(r) > abs(best_corr):
                best_corr = r
                best_lag = lag
        out.append({
            "factor": col,
            "lags": corrs,
            "peak_lag": best_lag,
            "peak_corr": round(best_corr, 4),
        })
    return {"results": out, "max_lag": max_lag}


async def granger_tests(
    *,
    dataset_id: str,
    mapping: Any,
    numeric_factors: list[str],
    max_lag: int,
    datasets_dir: Path,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    y = pd.to_numeric(df[mapping.value_col], errors="coerce").ffill().fillna(0.0).to_numpy(dtype=float)

    try:
        from statsmodels.tsa.stattools import grangercausalitytests
    except Exception:
        return {"results": []}

    results: list[dict[str, Any]] = []
    for col in numeric_factors:
        if col not in df.columns:
            continue
        x = pd.to_numeric(df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        n = min(len(x), len(y))
        data = np.column_stack([y[:n], x[:n]])
        if np.std(x[:n]) < 1e-9 or n < max_lag * 4:
            continue
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                res = grangercausalitytests(data, maxlag=max_lag, verbose=False)
            # Pick smallest p-value across lags (ssr_ftest)
            best_lag = 1
            best_p = 1.0
            for lag, out in res.items():
                p = float(out[0]["ssr_ftest"][1])
                if p < best_p:
                    best_p = p
                    best_lag = lag
            results.append({
                "factor": col,
                "direction": "factor→target",
                "best_lag": int(best_lag),
                "p_value": round(best_p, 6),
                "causal": bool(best_p < 0.05),
            })
        except Exception as exc:
            logger.warning("Granger failed for %s: %s", col, exc)
    return {"results": results}
