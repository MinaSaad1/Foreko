"""Actual import and post-issue accuracy.

Post-issue accuracy answers a different question from backtesting. A backtest
asks "how would this model have done on history it never saw". This asks "how
did the forecast you actually issued turn out". Design 14 requires the two to be
impossible to confuse, in labels and in API fields, so nothing here is named
like a backtest metric.

The rule that makes the number mean anything: actuals are matched against the
values that were issued, never against a later rerun. Importing actuals mutates
no run and no issued forecast.
"""

from __future__ import annotations

import io
from collections.abc import Sequence

import numpy as np
import pandas as pd

from ..schemas.project import (
    AccuracyMetrics,
    AccuracyResult,
    ActualRow,
    IssuedForecast,
    SeriesAccuracy,
)
from .validation_policy import (
    interval_coverage,
    rmse,
    signed_bias_pct,
    smape,
    wape,
)


class ActualsImportError(ValueError):
    """The uploaded actuals cannot be read as (series, date, value) rows."""


def parse_actuals(
    content: bytes,
    *,
    date_col: str,
    value_col: str,
    series_id_col: str | None = None,
    default_series_id: str = "series",
) -> list[ActualRow]:
    """Read actuals from an uploaded CSV.

    Every column is named explicitly rather than guessed, because silently
    picking the wrong column would score a forecast against the wrong numbers.
    """
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise ActualsImportError(f"The file could not be read as CSV: {exc}") from exc

    missing = [c for c in (date_col, value_col) if c not in df.columns]
    if series_id_col and series_id_col not in df.columns:
        missing.append(series_id_col)
    if missing:
        raise ActualsImportError(
            f"The file is missing {', '.join(missing)}. It has: "
            f"{', '.join(map(str, df.columns))}."
        )

    dates = pd.to_datetime(df[date_col], errors="coerce")
    if dates.isna().any():
        raise ActualsImportError(
            f"{int(dates.isna().sum())} rows have an unreadable {date_col}."
        )
    values = pd.to_numeric(df[value_col], errors="coerce")
    if values.isna().any():
        raise ActualsImportError(
            f"{int(values.isna().sum())} rows have a non-numeric {value_col}."
        )

    series = (
        df[series_id_col].astype(str)
        if series_id_col
        else pd.Series([default_series_id] * len(df))
    )
    return [
        ActualRow(series_id=s, date=str(d.date()), value=float(v))
        for s, d, v in zip(series, dates, values)
    ]


def _pinball(actual: np.ndarray, quantile: np.ndarray, q: float) -> float | None:
    if not len(actual):
        return None
    diff = actual - quantile
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def _mase_against_issued(
    actual: np.ndarray, predicted: np.ndarray
) -> tuple[float | None, str | None]:
    """MASE scaled by the naive change in the matched actuals.

    Post-issue there is no training history to scale by, so the scale is the
    mean absolute period-over-period change in what actually happened. That is a
    different denominator from the backtest's in-sample seasonal naive, which is
    exactly why this is not reported under the same name.
    """
    if len(actual) < 2:
        return None, (
            "MASE needs at least two matched periods to scale against; "
            f"{len(actual)} matched."
        )
    scale = float(np.mean(np.abs(np.diff(actual))))
    if scale < 1e-9:
        return None, "MASE is undefined: the actuals do not change over time."
    return float(np.mean(np.abs(actual - predicted)) / scale), None


def _metrics_for(
    actual: np.ndarray,
    point: np.ndarray,
    p10: np.ndarray,
    p90: np.ndarray,
) -> tuple[AccuracyMetrics, list[str]]:
    warnings: list[str] = []

    mase_value, mase_warning = _mase_against_issued(actual, point)
    if mase_warning:
        warnings.append(mase_warning)

    wape_value = wape(actual, point)
    if wape_value is None:
        warnings.append("WAPE is undefined: the matched actuals sum to zero.")

    coverage = interval_coverage(actual, p10, p90)
    if coverage is None and len(actual):
        warnings.append(
            "Coverage is undefined: the issued forecast carried no interval."
        )

    return (
        AccuracyMetrics(
            mase=mase_value,
            wape=wape_value,
            smape=smape(actual, point),
            rmse=rmse(actual, point),
            bias_pct=signed_bias_pct(actual, point),
            pinball_loss=_pinball(actual, point, 0.5),
            coverage_p10_p90=coverage,
        ),
        warnings,
    )


def score_issued_forecast(
    issued: IssuedForecast, actuals: Sequence[ActualRow]
) -> AccuracyResult:
    """Score what was issued against what happened.

    Matching is by series and period only. An actual with no issued period, or
    an issued period with no actual, is simply not matched: inventing a pairing
    would score the forecast against something it never claimed.
    """
    by_key: dict[tuple[str, str], float] = {
        (row.series_id, row.date): row.value for row in actuals
    }

    series_results: list[SeriesAccuracy] = []
    all_actual: list[float] = []
    all_point: list[float] = []
    all_p10: list[float] = []
    all_p90: list[float] = []
    unmatched = 0

    for series in issued.forecast.get("series", []):
        series_id = series["series_id"]
        matched_actual: list[float] = []
        matched_point: list[float] = []
        matched_p10: list[float] = []
        matched_p90: list[float] = []

        for index, date in enumerate(series.get("dates", [])):
            key = (series_id, str(date))
            if key not in by_key:
                unmatched += 1
                continue
            matched_actual.append(by_key[key])
            matched_point.append(float(series["point"][index]))
            matched_p10.append(float(series["p10"][index]))
            matched_p90.append(float(series["p90"][index]))

        if not matched_actual:
            series_results.append(
                SeriesAccuracy(
                    series_id=series_id,
                    matched_points=0,
                    metrics=AccuracyMetrics(),
                    metric_warnings=[
                        "No actuals matched the periods this forecast covered."
                    ],
                )
            )
            continue

        metrics, warnings = _metrics_for(
            np.asarray(matched_actual, dtype=float),
            np.asarray(matched_point, dtype=float),
            np.asarray(matched_p10, dtype=float),
            np.asarray(matched_p90, dtype=float),
        )
        series_results.append(
            SeriesAccuracy(
                series_id=series_id,
                matched_points=len(matched_actual),
                metrics=metrics,
                metric_warnings=warnings,
            )
        )
        all_actual.extend(matched_actual)
        all_point.extend(matched_point)
        all_p10.extend(matched_p10)
        all_p90.extend(matched_p90)

    if not all_actual:
        return AccuracyResult(
            issued_id=issued.id,
            issued_at=issued.issued_at,
            matched_points=0,
            unmatched_periods=unmatched,
            series=series_results,
            metrics=AccuracyMetrics(),
            metric_warnings=[
                "No actuals matched the issued forecast. Check the series names "
                "and dates in the file you imported."
            ],
        )

    portfolio, warnings = _metrics_for(
        np.asarray(all_actual, dtype=float),
        np.asarray(all_point, dtype=float),
        np.asarray(all_p10, dtype=float),
        np.asarray(all_p90, dtype=float),
    )

    return AccuracyResult(
        issued_id=issued.id,
        issued_at=issued.issued_at,
        matched_points=len(all_actual),
        unmatched_periods=unmatched,
        series=series_results,
        metrics=portfolio,
        metric_warnings=warnings,
    )


__all__ = [
    "ActualsImportError",
    "parse_actuals",
    "score_issued_forecast",
]
