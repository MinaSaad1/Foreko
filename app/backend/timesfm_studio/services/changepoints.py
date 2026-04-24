"""Changepoint detection via ruptures (PELT with RBF cost)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader

logger = logging.getLogger(__name__)


async def detect_changepoints(
    *,
    dataset_id: str,
    mapping: Any,
    penalty: float,
    datasets_dir: Path,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, mapping)
    if not ids:
        raise ValueError("Dataset has no series.")

    series = values[0]
    series_dates = dates[0]

    try:
        import ruptures as rpt
        algo = rpt.Pelt(model="rbf").fit(series.reshape(-1, 1))
        breakpoints = algo.predict(pen=penalty)
        # ruptures returns breakpoints as "end of segment" indices; drop the terminator
        cp_indices = [bp for bp in breakpoints[:-1] if 0 < bp < len(series)]
    except ImportError:
        logger.warning("ruptures not installed; skipping")
        cp_indices = []
    except Exception as exc:
        logger.warning("changepoint detection failed: %s", exc)
        cp_indices = []

    cps = []
    for idx in cp_indices:
        left = series[max(0, idx - 10):idx]
        right = series[idx:min(len(series), idx + 10)]
        if len(left) == 0 or len(right) == 0:
            continue
        left_mean = float(np.mean(left))
        right_mean = float(np.mean(right))
        shift_pct = (right_mean - left_mean) / abs(left_mean) if abs(left_mean) > 1e-9 else 0.0
        cps.append({
            "index": int(idx),
            "date": str(series_dates[idx].date()),
            "left_mean": left_mean,
            "right_mean": right_mean,
            "shift_absolute": right_mean - left_mean,
            "shift_percent": round(shift_pct, 4),
            "direction": "up" if right_mean > left_mean else "down",
        })

    return {
        "changepoints": cps,
        "dates": [str(d.date()) for d in series_dates],
        "values": [float(v) for v in series],
    }
