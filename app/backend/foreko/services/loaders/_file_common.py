"""Shared helpers for file-based dataset loaders.

Excel / Parquet / JSON all apply the same forecastability checks that CSV
applied pre-refactor: at least 2 columns, at least 10 rows, at least one
numeric column. They also build the same ColumnInfo list for the preview.
Keeping these here means the checks stay consistent as we add formats.
"""

from __future__ import annotations

import datetime
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from ...schemas.dataset import ColumnInfo, DatasetPreview
from ..series import _infer_column_dtype

logger = logging.getLogger(__name__)

_SCHEMA_VERSION = 2
_PREVIEW_ROWS = 50
_MIN_ROWS = 10
_MIN_COLS = 2


def validate_forecastable(df: pd.DataFrame) -> None:
    """Apply the same minimum-viable-forecast checks CSV has always applied.

    Raises ValueError with user-friendly wording on any failure.
    """

    if len(df.columns) < _MIN_COLS:
        raise ValueError(
            "File needs at least two columns: a date column and a value column."
        )
    if len(df) < _MIN_ROWS:
        raise ValueError(
            f"Too few rows. Foreko needs at least {_MIN_ROWS} rows to forecast."
        )
    has_numeric = any(
        pd.api.types.is_numeric_dtype(df[c])
        or _infer_column_dtype(df[c]) == "numeric"
        for c in df.columns
    )
    if not has_numeric:
        raise ValueError(
            "Couldn't find a numeric column in the file. Foreko forecasts numeric values."
        )


def build_column_infos(df: pd.DataFrame) -> list[ColumnInfo]:
    """Produce the ColumnInfo list the frontend renders in the preview."""

    out: list[ColumnInfo] = []
    for name in df.columns:
        col = df[name]
        out.append(
            ColumnInfo(
                name=str(name),
                dtype=_infer_column_dtype(col),
                example_values=[str(v) for v in col.dropna().head(5).tolist()],
                null_fraction=round(float(col.isna().mean()) if len(col) else 0.0, 4),
            )
        )
    return out


def build_first_rows(df: pd.DataFrame, n: int = _PREVIEW_ROWS) -> list[dict[str, Any]]:
    """Preview payload: first N rows with NaN -> None for JSON safety."""

    return df.head(n).where(df.notna(), None).to_dict(orient="records")


def finalize_ingest(
    *,
    df: pd.DataFrame,
    raw_bytes: bytes,
    raw_filename: str,
    filename: str,
    kind: str,
    source: dict[str, Any] | None,
    datasets_dir: Path,
    write_parquet: bool,
    build_raw: Callable[[Path, bytes], None] | None = None,
) -> DatasetPreview:
    """Shared ingest tail: create the dataset directory, validate, write raw
    file + optional parquet snapshot + meta.json, build the preview.

    On any failure the dataset directory is removed so half-written data does
    not linger.

    Args:
        df: the parsed DataFrame (used for validation + parquet materialization).
        raw_bytes: original upload bytes to persist under the raw filename.
        raw_filename: basename used inside the dataset dir (e.g. ``raw.xlsx``).
        filename: user-facing filename to store in meta.json.
        kind: loader kind stored in meta.json (``"excel"``, ``"parquet"``, ``"json"``).
        source: optional kind-specific source spec persisted into meta[source].
        datasets_dir: directory under which the new {dataset_id}/ is created.
        write_parquet: if True, materialize ``df`` to ``data.parquet`` for fast reloads.
        build_raw: optional callable writing the raw artifact; defaults to
            writing ``raw_bytes`` to ``dataset_dir / raw_filename``.
    """

    dataset_id = uuid.uuid4().hex
    dataset_dir = datasets_dir / dataset_id
    dataset_dir.mkdir(parents=True, exist_ok=True)
    try:
        if build_raw is None:
            (dataset_dir / raw_filename).write_bytes(raw_bytes)
        else:
            build_raw(dataset_dir / raw_filename, raw_bytes)

        validate_forecastable(df)

        if write_parquet:
            import pyarrow as pa
            import pyarrow.parquet as pq

            table = pa.Table.from_pandas(df, preserve_index=False)
            pq.write_table(table, dataset_dir / "data.parquet")

        columns = build_column_infos(df)
        first_rows = build_first_rows(df)

        meta: dict[str, Any] = {
            "id": dataset_id,
            "kind": kind,
            "filename": filename,
            "row_count": int(len(df)),
            "uploaded_at": datetime.datetime.utcnow().isoformat() + "Z",
            "schema_version": _SCHEMA_VERSION,
        }
        if source:
            meta["source"] = source
        (dataset_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

        logger.info(
            "Ingested %s dataset %s: %s rows, %s columns",
            kind, dataset_id, len(df), len(df.columns),
        )

        return DatasetPreview(
            id=dataset_id,
            filename=filename,
            columns=columns,
            row_count=int(len(df)),
            first_rows=first_rows,
        )
    except Exception:
        shutil.rmtree(dataset_dir, ignore_errors=True)
        raise


__all__ = [
    "validate_forecastable",
    "build_column_infos",
    "build_first_rows",
    "finalize_ingest",
]
