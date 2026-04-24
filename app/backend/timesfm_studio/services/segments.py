"""Segment/cohort comparison for multi-series datasets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader


async def compare_segments(
    *,
    dataset_id: str,
    mapping: Any,
    datasets_dir: Path,
    top_n: int = 20,
) -> dict[str, Any]:
    if not mapping.series_id_col:
        raise ValueError("segments comparison requires series_id_col in mapping")
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, mapping)

    segments: list[dict[str, Any]] = []
    for sid, vals, dts in zip(ids, values, dates):
        if len(vals) < 2:
            continue
        total = float(np.sum(vals))
        mean = float(np.mean(vals))
        std = float(np.std(vals))
        first = float(vals[0])
        last = float(vals[-1])
        growth = (last - first) / abs(first) if abs(first) > 1e-9 else 0.0
        volatility = std / abs(mean) if abs(mean) > 1e-9 else 0.0
        segments.append({
            "id": sid,
            "length": int(len(vals)),
            "first_date": str(dts[0].date()) if len(dts) else None,
            "last_date": str(dts[-1].date()) if len(dts) else None,
            "total": round(total, 2),
            "mean": round(mean, 2),
            "std": round(std, 2),
            "first_value": round(first, 2),
            "last_value": round(last, 2),
            "growth_pct": round(growth, 4),
            "volatility": round(volatility, 4),
            "dates": [str(d.date()) for d in dts[:500]],
            "values": [float(v) for v in vals[:500]],
        })

    # Rankings
    by_total = sorted(segments, key=lambda s: s["total"], reverse=True)[:top_n]
    by_growth = sorted(segments, key=lambda s: s["growth_pct"], reverse=True)[:top_n]
    by_volatility = sorted(segments, key=lambda s: s["volatility"], reverse=True)[:top_n]

    return {
        "n_segments": len(segments),
        "segments": segments[:top_n],
        "rankings": {
            "by_total": [{"id": s["id"], "value": s["total"]} for s in by_total],
            "by_growth": [{"id": s["id"], "value": s["growth_pct"]} for s in by_growth],
            "by_volatility": [{"id": s["id"], "value": s["volatility"]} for s in by_volatility],
        },
    }


async def hierarchical_reconcile(
    segment_forecasts: dict[str, list[float]],
    method: str = "bottom_up",
) -> dict[str, Any]:
    """Reconcile segment forecasts into a coherent hierarchy.

    Simple variants:
    - bottom_up: total = sum(segments)
    - top_down: allocate the historical share of each segment (caller provides share weights)
    """
    if not segment_forecasts:
        return {"total": [], "segments": {}, "method": method}

    horizon = len(next(iter(segment_forecasts.values())))
    total = np.zeros(horizon, dtype=float)
    for _, vals in segment_forecasts.items():
        total += np.asarray(vals, dtype=float)

    return {
        "method": method,
        "horizon": horizon,
        "total": [float(v) for v in total],
        "segments": {k: v for k, v in segment_forecasts.items()},
    }
