"""Prediction interval calibration.

Compares nominal coverage (e.g. 80% PI) to empirical coverage (fraction of
actuals that fell inside the band during a walk-forward). Outputs a
reliability diagram: x=nominal, y=empirical.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader
from .forecaster import _infer_future_dates
from .model_registry import ModelRegistry
from ..schemas.forecast import ForecastConfigIn


_NOMINAL_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


async def run_calibration(
    *,
    dataset_id: str,
    mapping: Any,
    horizon: int,
    folds: int,
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
    min_train = max(horizon * 2, 24)
    if n < min_train + horizon * folds:
        folds = max(1, (n - min_train) // horizon)
    if folds < 1:
        raise ValueError("Not enough data for calibration.")

    step = (n - min_train - horizon) // max(folds - 1, 1) if folds > 1 else 0

    # Accumulate actuals + all 10 quantile columns across folds
    all_actuals: list[float] = []
    all_quantiles: list[np.ndarray] = []

    for k in range(folds):
        train_end = min_train + k * step
        test_end = train_end + horizon
        if test_end > n:
            break
        train = series[:train_end].astype(float)
        actuals = series[train_end:test_end].astype(float)

        _, q_all, _ = await registry.forecast(
            config=ForecastConfigIn(),
            horizon=horizon,
            inputs=[train.copy()],
        )
        q = np.asarray(q_all[0], dtype=float)
        for h in range(len(actuals)):
            all_actuals.append(float(actuals[h]))
            all_quantiles.append(q[h])

    actuals_arr = np.array(all_actuals)
    q_arr = np.array(all_quantiles)  # shape (m, 10) = [mean, p10..p90]

    # Empirical coverage at each symmetric PI
    # PI level p → use quantile p*100 and (1-p)*100 (but we only have p10..p90 at 10% steps)
    reliability: list[dict[str, float]] = []
    level_to_idx = {
        0.1: (1, 9),
        0.2: (2, 8),
        0.4: (3, 7),
        0.6: (4, 6),
        0.8: (1, 9),  # 80% PI = [p10, p90]
    }
    # Build a simpler map: symmetric PI level `alpha` uses (p_{(1-alpha)/2 * 100}, p_{(1+alpha)/2 * 100})
    # Quantile columns: [mean, p10, p20, p30, p40, p50, p60, p70, p80, p90]
    # Indexes 1..9 map to 10..90.
    for nominal in [0.2, 0.4, 0.6, 0.8]:
        lo_pct = (1 - nominal) / 2 * 100  # e.g. 0.8 → 10
        hi_pct = (1 + nominal) / 2 * 100  # 90
        lo_idx = int(round(lo_pct / 10))
        hi_idx = int(round(hi_pct / 10))
        if lo_idx < 1 or hi_idx > 9:
            continue
        lo = q_arr[:, lo_idx]
        hi = q_arr[:, hi_idx]
        inside = np.mean((actuals_arr >= lo) & (actuals_arr <= hi))
        reliability.append(
            {
                "nominal": float(nominal),
                "empirical": float(inside),
                "lo_quantile": float(lo_pct / 100),
                "hi_quantile": float(hi_pct / 100),
            }
        )

    return {
        "reliability": reliability,
        "n_observations": int(len(actuals_arr)),
        "folds": folds,
        "horizon": horizon,
    }
