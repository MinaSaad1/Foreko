"""Two-phase anomaly detection service.

Phase 1: linear detrend + Z-score on the context series.
Phase 2: TimesFM quantile PI bands on the forecast horizon.

Key difference from the v1.0 example (detect_anomalies.py):
TimesFM 2.5 returns quantiles as shape (horizon, 10), not (10, horizon).
So access is quant_fc[:, IDX] not quant_fc[IDX].
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from ..schemas.anomaly import (
    AnomalyRequest,
    AnomalyResponse,
    AnomalySummary,
    ContextAnomalyRecord,
    ForecastAnomalyRecord,
    SeriesAnomalyResult,
)
from . import csv_loader
from .model_registry import ModelRegistry
from .forecaster import _infer_future_dates

logger = logging.getLogger(__name__)

# Quantile column indices in the v2.5 output layout (horizon, 10):
# [mean, p10, p20, p30, p40, p50, p60, p70, p80, p90]
IDX_Q10, IDX_Q20, IDX_Q80, IDX_Q90 = 1, 2, 8, 9


def _detect_context_anomalies(
    values: np.ndarray,
    dates: pd.DatetimeIndex,
    critical_z: float,
    warning_z: float,
) -> tuple[list[ContextAnomalyRecord], np.ndarray, np.ndarray, float]:
    """Phase 1: linear detrend + Z-score for the context window."""

    n = len(values)
    idx = np.arange(n, dtype=float)
    coeffs = np.polyfit(idx, values, 1)
    trend = np.polyval(coeffs, idx)
    residuals = values - trend
    res_std = float(residuals.std())

    records: list[ContextAnomalyRecord] = []
    for i, (d, v, r) in enumerate(zip(dates, values, residuals)):
        z = r / res_std if res_std > 0 else 0.0
        if abs(z) >= critical_z:
            sev = "CRITICAL"
        elif abs(z) >= warning_z:
            sev = "WARNING"
        else:
            sev = "NORMAL"
        records.append(
            ContextAnomalyRecord(
                date=str(d)[:10],
                value=round(float(v), 4),
                trend=round(float(trend[i]), 4),
                residual=round(float(r), 4),
                z_score=round(float(z), 3),
                severity=sev,
            )
        )
    return records, trend, residuals, res_std


def _detect_forecast_anomalies(
    point: np.ndarray,
    quant_fc: np.ndarray,
    future_dates: pd.DatetimeIndex,
) -> list[ForecastAnomalyRecord]:
    """Phase 2: check forecast point against quantile PI bands.

    ``quant_fc`` shape: (horizon, 10) as returned by TimesFM 2.5.
    """

    q10 = quant_fc[:, IDX_Q10]
    q20 = quant_fc[:, IDX_Q20]
    q80 = quant_fc[:, IDX_Q80]
    q90 = quant_fc[:, IDX_Q90]

    records: list[ForecastAnomalyRecord] = []
    for i, (d, pt) in enumerate(zip(future_dates, point)):
        outside_90 = pt < q10[i] or pt > q90[i]
        outside_80 = pt < q20[i] or pt > q80[i]
        if outside_90:
            sev = "CRITICAL"
        elif outside_80:
            sev = "WARNING"
        else:
            sev = "NORMAL"
        records.append(
            ForecastAnomalyRecord(
                date=str(d)[:10],
                forecast=round(float(pt), 4),
                q10=round(float(q10[i]), 4),
                q20=round(float(q20[i]), 4),
                q80=round(float(q80[i]), 4),
                q90=round(float(q90[i]), 4),
                severity=sev,
            )
        )
    return records


def _make_summary(records: list) -> AnomalySummary:
    counts: dict[str, int] = {"CRITICAL": 0, "WARNING": 0, "NORMAL": 0}
    for r in records:
        counts[r.severity] += 1
    return AnomalySummary(
        total=len(records),
        critical=counts["CRITICAL"],
        warning=counts["WARNING"],
        normal=counts["NORMAL"],
    )


async def detect_anomalies(
    *,
    df: pd.DataFrame,
    request: AnomalyRequest,
    registry: ModelRegistry,
) -> AnomalyResponse:
    """End-to-end two-phase anomaly detection for all series in a dataset."""

    ids, values, dates = csv_loader.extract_series(df, request.mapping)

    point_all, quant_all, _ = await registry.forecast(
        config=request.forecast_config,
        horizon=request.horizon,
        inputs=[v.copy() for v in values],
    )

    results: list[SeriesAnomalyResult] = []
    for i, sid in enumerate(ids):
        ctx_records, _, _, res_std = _detect_context_anomalies(
            values[i], dates[i], request.critical_z, request.warning_z,
        )
        future_dates = _infer_future_dates(dates[i], request.horizon)
        fc_records = _detect_forecast_anomalies(
            np.asarray(point_all[i]),
            np.asarray(quant_all[i]),
            future_dates,
        )
        results.append(
            SeriesAnomalyResult(
                series_id=sid,
                res_std=round(res_std, 5),
                context_summary=_make_summary(ctx_records),
                forecast_summary=_make_summary(fc_records),
                context_records=ctx_records,
                forecast_records=fc_records,
            )
        )

    return AnomalyResponse(results=results)
