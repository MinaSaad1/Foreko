"""Ensemble forecasting: inverse-MAPE weighted average of multiple models.

Given walk-forward MAPEs per model, compute weights and combine point forecasts.
"""

from __future__ import annotations

from typing import Any

import numpy as np


def inverse_mape_weights(mapes: dict[str, float], eps: float = 1e-6) -> dict[str, float]:
    """Compute w_i = (1/MAPE_i) / sum(1/MAPE_j), clipped for stability."""
    inv = {m: 1.0 / max(v, eps) for m, v in mapes.items()}
    total = sum(inv.values()) or 1.0
    return {m: round(w / total, 6) for m, w in inv.items()}


def combine_forecasts(
    point_forecasts: dict[str, np.ndarray],
    weights: dict[str, float],
) -> np.ndarray:
    models = list(point_forecasts.keys())
    if not models:
        return np.array([])
    horizon = len(point_forecasts[models[0]])
    combined = np.zeros(horizon, dtype=float)
    total_w = 0.0
    for m, w in weights.items():
        if m not in point_forecasts:
            continue
        combined += w * np.asarray(point_forecasts[m], dtype=float)
        total_w += w
    if total_w > 0:
        combined /= total_w
    return combined


def summarize_ensemble(
    point_forecasts: dict[str, np.ndarray],
    mapes: dict[str, float],
) -> dict[str, Any]:
    weights = inverse_mape_weights(mapes)
    combined = combine_forecasts(point_forecasts, weights)
    expected_mape = sum(w * mapes.get(m, 0.0) for m, w in weights.items())
    return {
        "weights": weights,
        "combined": combined.tolist(),
        "expected_mape": expected_mape,
    }
