"""Anomaly root-cause hints from factor co-occurrence.

Given a list of anomaly dates and a set of candidate factor columns, compute
how often each factor takes an unusual value on anomaly dates vs baseline.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader


async def explain_anomalies(
    *,
    dataset_id: str,
    mapping: Any,
    anomaly_dates: list[str],
    numeric_factors: list[str],
    categorical_factors: list[str],
    datasets_dir: Path,
) -> dict[str, Any]:
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    # Resolve the date column
    date_col = mapping.date_col or "__date__"
    if date_col not in df.columns and mapping.date_col:
        date_col = mapping.date_col
    if date_col not in df.columns:
        raise ValueError("date column not found in dataset for root-cause analysis")

    work = df.copy()
    work["_d"] = pd.to_datetime(work[date_col], errors="coerce").dt.strftime("%Y-%m-%d")
    anomaly_mask = work["_d"].isin(anomaly_dates)

    explanations: list[dict[str, Any]] = []

    # Numeric factors: compare mean on anomaly days vs others
    for col in numeric_factors:
        if col not in work.columns:
            continue
        vals = pd.to_numeric(work[col], errors="coerce")
        anomaly_mean = float(vals[anomaly_mask].mean()) if anomaly_mask.any() else 0.0
        baseline_mean = float(vals[~anomaly_mask].mean()) if (~anomaly_mask).any() else 0.0
        baseline_std = float(vals[~anomaly_mask].std()) if (~anomaly_mask).any() else 1.0
        z = (anomaly_mean - baseline_mean) / max(baseline_std, 1e-9)
        explanations.append({
            "factor": col,
            "kind": "numeric",
            "anomaly_mean": round(anomaly_mean, 3),
            "baseline_mean": round(baseline_mean, 3),
            "z_score": round(z, 3),
            "direction": "up" if z > 0 else "down",
            "strength": "strong" if abs(z) > 1.5 else ("mild" if abs(z) > 0.7 else "weak"),
        })

    # Categorical factors: compute share of each level during anomalies vs baseline
    for col in categorical_factors:
        if col not in work.columns:
            continue
        anomaly_vals = work.loc[anomaly_mask, col].astype(str)
        baseline_vals = work.loc[~anomaly_mask, col].astype(str)
        if len(anomaly_vals) == 0 or len(baseline_vals) == 0:
            continue
        anomaly_dist = anomaly_vals.value_counts(normalize=True).to_dict()
        baseline_dist = baseline_vals.value_counts(normalize=True).to_dict()
        # Top divergent category
        best_cat = None
        best_lift = 0.0
        for cat, a_share in anomaly_dist.items():
            b_share = baseline_dist.get(cat, 0.0)
            lift = a_share - b_share
            if abs(lift) > abs(best_lift):
                best_lift = lift
                best_cat = cat
        explanations.append({
            "factor": col,
            "kind": "categorical",
            "top_category": best_cat,
            "anomaly_share": round(float(anomaly_dist.get(best_cat, 0.0)), 3) if best_cat else 0.0,
            "baseline_share": round(float(baseline_dist.get(best_cat, 0.0)), 3) if best_cat else 0.0,
            "lift": round(float(best_lift), 3),
            "direction": "overrepresented" if best_lift > 0 else "underrepresented",
            "strength": "strong" if abs(best_lift) > 0.25 else ("mild" if abs(best_lift) > 0.1 else "weak"),
        })

    # Rank by |strength| so the UI can surface top hints first
    explanations.sort(key=lambda e: abs(e.get("z_score", 0.0)) + abs(e.get("lift", 0.0)), reverse=True)

    return {
        "n_anomalies": int(anomaly_mask.sum()),
        "explanations": explanations,
    }
