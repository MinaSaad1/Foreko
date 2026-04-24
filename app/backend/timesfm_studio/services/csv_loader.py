"""CSV ingestion: parse upload, preview, and extract TimesFM-ready series."""

from __future__ import annotations

import datetime
import json
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from ..schemas.dataset import (
    ColumnDType,
    ColumnInfo,
    ColumnMapping,
    DatasetPreview,
    SeriesExtraction,
    SeriesSummary,
)

logger = logging.getLogger(__name__)

_MONTH_NAME_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4,
    "june": 6, "july": 7, "august": 8, "september": 9,
    "october": 10, "november": 11, "december": 12,
}


@dataclass(frozen=True)
class IngestedDataset:
    """Lightweight handle to a stored CSV."""

    id: str
    filename: str
    path: Path


def _infer_column_dtype(series: pd.Series) -> ColumnDType:
    """Classify a pandas Series into one of our friendly dtype buckets."""

    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    # Try to coerce to datetime without raising.
    try:
        coerced = pd.to_datetime(series, errors="coerce", format="mixed")
        # Consider it a date column only if a decent majority parsed.
        if coerced.notna().mean() >= 0.9:
            return "datetime"
    except Exception:
        pass
    nunique = series.nunique(dropna=True)
    if nunique > 0 and nunique <= max(20, len(series) // 10):
        return "categorical"
    return "string"


def ingest_upload(
    *,
    filename: str,
    content: bytes,
    datasets_dir: Path,
    preview_rows: int = 50,
) -> DatasetPreview:
    """Persist an uploaded CSV to disk and return a preview."""

    dataset_id = uuid.uuid4().hex
    dataset_dir = datasets_dir / dataset_id
    dataset_dir.mkdir(parents=True, exist_ok=True)
    raw_path = dataset_dir / "raw.csv"
    raw_path.write_bytes(content)

    try:
        df = pd.read_csv(raw_path, encoding="utf-8-sig")
    except UnicodeDecodeError:
        df = pd.read_csv(raw_path, encoding="latin-1")

    columns: list[ColumnInfo] = []
    for name in df.columns:
        col = df[name]
        dtype = _infer_column_dtype(col)
        examples = [
            str(v) for v in col.dropna().head(5).tolist()
        ]
        null_fraction = float(col.isna().mean()) if len(col) else 0.0
        columns.append(
            ColumnInfo(
                name=str(name),
                dtype=dtype,
                example_values=examples,
                null_fraction=round(null_fraction, 4),
            )
        )

    first_rows = df.head(preview_rows).where(df.notna(), None).to_dict(orient="records")

    meta = {
        "id": dataset_id,
        "filename": filename,
        "row_count": int(len(df)),
        "uploaded_at": datetime.datetime.utcnow().isoformat() + "Z",
    }
    (dataset_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    logger.info(
        "Ingested dataset %s: %s rows, %s columns", dataset_id, len(df), len(df.columns)
    )

    return DatasetPreview(
        id=dataset_id,
        filename=filename,
        columns=columns,
        row_count=int(len(df)),
        first_rows=first_rows,
    )


def load_dataset(dataset_id: str, datasets_dir: Path) -> pd.DataFrame:
    """Load a stored dataset. Raises :class:`FileNotFoundError` if missing."""

    path = datasets_dir / dataset_id / "raw.csv"
    if not path.exists():
        raise FileNotFoundError(f"Dataset {dataset_id} not found at {path}")
    try:
        return pd.read_csv(path, encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="latin-1")


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

    if mapping.series_id_col is None:
        sub = work.sort_values("__date__").reset_index(drop=True)
        return (
            ["series"],
            [sub["__value__"].to_numpy(dtype=float)],
            [pd.DatetimeIndex(sub["__date__"])],
        )

    ids: list[str] = []
    values: list[np.ndarray] = []
    dates: list[pd.DatetimeIndex] = []
    for sid, group in work.groupby(mapping.series_id_col, sort=True):
        group = group.sort_values("__date__").reset_index(drop=True)
        ids.append(str(sid))
        values.append(group["__value__"].to_numpy(dtype=float))
        dates.append(pd.DatetimeIndex(group["__date__"]))
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
