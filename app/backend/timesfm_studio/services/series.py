"""Source-agnostic helpers that turn a pandas DataFrame + ColumnMapping into
the (ids, values, dates) tuple the forecaster expects.

These helpers intentionally know nothing about how the DataFrame was produced
(CSV, Excel, Parquet, JSON, SQL) so every loader can feed the same downstream
pipeline. Moved out of services/csv_loader.py as part of the multi-source
ingestion refactor.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

from ..schemas.dataset import (
    ColumnDType,
    ColumnMapping,
    SeriesExtraction,
    SeriesSummary,
)

_MONTH_NAME_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4,
    "june": 6, "july": 7, "august": 8, "september": 9,
    "october": 10, "november": 11, "december": 12,
}


def _infer_column_dtype(series: pd.Series) -> ColumnDType:
    """Classify a pandas Series into one of our friendly dtype buckets."""

    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    try:
        coerced = pd.to_datetime(series, errors="coerce", format="mixed")
        if coerced.notna().mean() >= 0.9:
            return "datetime"
    except Exception:
        pass
    nunique = series.nunique(dropna=True)
    if nunique > 0 and nunique <= max(20, len(series) // 10):
        return "categorical"
    return "string"


def _normalize_month(value: object) -> int | None:
    """Accept month as int, zero-padded string, or month name."""

    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        n = int(value)
        if 1 <= n <= 12:
            return n
    except (TypeError, ValueError):
        pass
    s = str(value).strip().lower()
    if s in _MONTH_NAME_MAP:
        return _MONTH_NAME_MAP[s]
    if s[:3] in _MONTH_NAME_MAP:
        return _MONTH_NAME_MAP[s[:3]]
    return None


def _resolve_date_column(df: pd.DataFrame, mapping: ColumnMapping) -> pd.Series:
    """Return a pandas datetime Series for each row, based on mapping."""

    if mapping.date_col is not None:
        parsed = pd.to_datetime(df[mapping.date_col], errors="coerce", format="mixed")
        return parsed

    parts = mapping.date_parts
    assert parts is not None  # validated by ColumnMapping
    years = df[parts.year_col].astype(int)
    months = df[parts.month_col].map(_normalize_month)
    if months.isna().any():
        bad = df[parts.month_col][months.isna()].head(3).tolist()
        raise ValueError(f"Could not parse month values: {bad}")
    days = (
        df[parts.day_col].astype(int)
        if parts.day_col is not None
        else pd.Series([1] * len(df))
    )
    iso = (
        years.astype(str)
        + "-"
        + months.astype(int).map(lambda m: f"{m:02d}")
        + "-"
        + days.astype(int).map(lambda d: f"{d:02d}")
    )
    return pd.to_datetime(iso, errors="coerce")


def aggregate_duplicates_by_date(
    df: pd.DataFrame,
    mapping: ColumnMapping,
) -> pd.DataFrame:
    """Collapse rows that share a resolved date into one row.

    Used when ``mapping.series_id_col`` is ``None`` but the DataFrame actually
    contains multiple series stacked under a shared value column. Numeric
    columns are summed; non-numeric columns keep their first value. If the
    resolved dates have no duplicates, the original DataFrame is returned
    unchanged.
    """

    parsed = _resolve_date_column(df, mapping)
    if not parsed.duplicated().any():
        return df

    tmp = df.copy()
    tmp["__agg_date__"] = parsed

    agg_spec: dict[str, str] = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            agg_spec[col] = "sum"
        else:
            agg_spec[col] = "first"

    grouped = (
        tmp.groupby("__agg_date__", as_index=False, sort=True)
        .agg(agg_spec)
        .drop(columns=["__agg_date__"])
        .reset_index(drop=True)
    )
    logger.info(
        "Aggregated DataFrame from %d to %d rows by summing duplicate dates.",
        len(df),
        len(grouped),
    )
    return grouped


def extract_series(
    df: pd.DataFrame,
    mapping: ColumnMapping,
) -> tuple[list[str], list[np.ndarray], list[pd.DatetimeIndex]]:
    """Apply a mapping to a DataFrame and return (ids, values, dates) per series.

    All three lists have equal length; index i corresponds to series i.
    """

    if mapping.value_col not in df.columns:
        raise ValueError(f"Value column '{mapping.value_col}' not found in CSV.")

    work = df.copy()
    work["__date__"] = _resolve_date_column(work, mapping)
    if work["__date__"].isna().any():
        n_bad = int(work["__date__"].isna().sum())
        raise ValueError(f"{n_bad} rows have unparseable dates.")
    work["__value__"] = pd.to_numeric(work[mapping.value_col], errors="coerce")
    if work["__value__"].isna().any():
        n_bad = int(work["__value__"].isna().sum())
        raise ValueError(f"{n_bad} rows have non-numeric '{mapping.value_col}'.")

    def _validate_series(label: str, vals: np.ndarray, dts: pd.DatetimeIndex) -> None:
        dupes = dts.duplicated().sum()
        if dupes > 0:
            first_dup = dts[dts.duplicated(keep="first")][0]
            raise ValueError(
                f"{int(dupes)} duplicate timestamps in {label} "
                f"(first repeat at {first_dup.date()}). Aggregate to one row per period before uploading."
            )
        if vals.size and float(np.nanstd(vals)) == 0.0:
            raise ValueError(
                f"The value column in {label} is constant (every row is the same number). "
                "There's nothing to forecast."
            )

    if mapping.series_id_col is None:
        sub = work.sort_values("__date__").reset_index(drop=True)
        # If the CSV contains multiple series stacked in a single value column
        # and the user left the series column as "none", auto-aggregate by
        # summing values on matching dates. This keeps the series column
        # genuinely optional instead of failing the request.
        dup_count = int(sub["__date__"].duplicated().sum())
        if dup_count > 0:
            logger.info(
                "Auto-aggregating %d duplicate timestamps by sum (series column not specified).",
                dup_count,
            )
            sub = (
                sub.groupby("__date__", as_index=False)["__value__"]
                .sum()
                .sort_values("__date__")
                .reset_index(drop=True)
            )
        vals = sub["__value__"].to_numpy(dtype=float)
        dts = pd.DatetimeIndex(sub["__date__"])
        _validate_series("this series", vals, dts)
        return (["series"], [vals], [dts])

    ids: list[str] = []
    values: list[np.ndarray] = []
    dates: list[pd.DatetimeIndex] = []
    for sid, group in work.groupby(mapping.series_id_col, sort=True):
        group = group.sort_values("__date__").reset_index(drop=True)
        vals = group["__value__"].to_numpy(dtype=float)
        dts = pd.DatetimeIndex(group["__date__"])
        _validate_series(f"series '{sid}'", vals, dts)
        ids.append(str(sid))
        values.append(vals)
        dates.append(dts)
    return ids, values, dates


def summarize_series(
    ids: list[str],
    values: list[np.ndarray],
    dates: list[pd.DatetimeIndex],
    *,
    preview_points: int = 10,
) -> list[SeriesSummary]:
    """Compact per-series summary for the frontend preview."""

    out: list[SeriesSummary] = []
    for sid, vals, dts in zip(ids, values, dates, strict=True):
        out.append(
            SeriesSummary(
                id=sid,
                length=int(len(vals)),
                first_date=str(dts[0].date()) if len(dts) else None,
                last_date=str(dts[-1].date()) if len(dts) else None,
                preview=[float(v) for v in vals[:preview_points]],
            )
        )
    return out


def infer_frequency(dates: pd.DatetimeIndex) -> str | None:
    """Best-effort frequency inference for a single series."""

    if len(dates) < 3:
        return None
    try:
        return pd.infer_freq(dates)
    except ValueError:
        return None


def build_extraction(
    dataset_id: str,
    df: pd.DataFrame,
    mapping: ColumnMapping,
) -> SeriesExtraction:
    ids, values, dates = extract_series(df, mapping)
    freq = infer_frequency(dates[0]) if dates else None
    return SeriesExtraction(
        dataset_id=dataset_id,
        inferred_freq=freq,
        series=summarize_series(ids, values, dates),
    )


__all__ = [
    "extract_series",
    "aggregate_duplicates_by_date",
    "build_extraction",
    "summarize_series",
    "infer_frequency",
    "_infer_column_dtype",
    "_resolve_date_column",
    "_normalize_month",
]
