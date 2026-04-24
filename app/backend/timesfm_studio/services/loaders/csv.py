"""CSV loader.

Behavior preserved verbatim from the pre-refactor services.csv_loader:
- Writes {datasets_dir}/{id}/raw.csv with the original upload bytes.
- utf-8-sig first, latin-1 fallback on decode errors.
- Rejects fewer than 2 columns, fewer than 10 rows, or no numeric column.
- Writes {datasets_dir}/{id}/meta.json with schema_version=2 and kind="csv".
- On any failure, removes the freshly-created dataset directory before raising.

Legacy datasets (meta.json without schema_version / kind) keep working because
services.dataset_store.read_meta treats missing kind as "csv".
"""

from __future__ import annotations

import csv as _stdlib_csv
import datetime
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any, ClassVar

import pandas as pd

from ...schemas.dataset import ColumnInfo, DatasetPreview
from ..series import _infer_column_dtype
from . import register

logger = logging.getLogger(__name__)


_SCHEMA_VERSION = 2

# Delimiters the sniffer is allowed to pick from. Tab and pipe are rare but
# show up in exports from data-warehouse tools, semicolon is the common
# German / French default.
_SNIFF_DELIMITERS = ",;\t|"


def _decode_sample(content: bytes, sample_bytes: int = 4096) -> str:
    """Decode the first few KB of upload bytes for dialect sniffing."""

    head = content[:sample_bytes]
    try:
        return head.decode("utf-8-sig")
    except UnicodeDecodeError:
        return head.decode("latin-1", errors="replace")


def _sniff_delimiter(content: bytes) -> str:
    """Best-effort delimiter detection. Returns ',' on any failure."""

    sample = _decode_sample(content)
    try:
        dialect = _stdlib_csv.Sniffer().sniff(sample, delimiters=_SNIFF_DELIMITERS)
        return dialect.delimiter
    except _stdlib_csv.Error:
        return ","


def _read_with_fallback(
    raw_path: Path, *, sep: str, decimal: str
) -> pd.DataFrame:
    """Read a CSV trying utf-8-sig then latin-1."""

    try:
        return pd.read_csv(raw_path, encoding="utf-8-sig", sep=sep, decimal=decimal)
    except UnicodeDecodeError:
        return pd.read_csv(raw_path, encoding="latin-1", sep=sep, decimal=decimal)


def _has_numeric_column(df: pd.DataFrame) -> bool:
    """True if at least one column is classified numeric by our dtype inference."""

    for name in df.columns:
        if _infer_column_dtype(df[name]) == "numeric":
            return True
    return False


class CSVLoader:
    """Upload + load for .csv files."""

    kind: ClassVar[str] = "csv"
    extensions: ClassVar[tuple[str, ...]] = (".csv",)

    def ingest(
        self,
        *,
        filename: str,
        raw_bytes: bytes | None,
        source_spec: dict[str, Any],
        datasets_dir: Path,
    ) -> DatasetPreview:
        if raw_bytes is None:
            raise ValueError("CSV ingest requires upload bytes.")
        return ingest_upload(
            filename=filename,
            content=raw_bytes,
            datasets_dir=datasets_dir,
        )

    def load(self, dataset_dir: Path) -> pd.DataFrame:
        path = dataset_dir / "raw.csv"
        if not path.exists():
            raise FileNotFoundError(
                f"CSV file missing for dataset at {dataset_dir} (expected {path})"
            )
        meta_path = dataset_dir / "meta.json"
        sep = ","
        decimal = "."
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                sep = meta.get("csv_sep") or ","
                decimal = meta.get("csv_decimal") or "."
            except (OSError, json.JSONDecodeError):
                pass
        return _read_with_fallback(path, sep=sep, decimal=decimal)


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
        sep = _sniff_delimiter(content)
        decimal = "."
        df = _read_with_fallback(raw_path, sep=sep, decimal=decimal)

        # European CSVs use ',' as decimal separator. If the first pass found
        # no numeric columns but the file has multiple columns, retry with
        # decimal=','. Only safe when the delimiter isn't ',' itself.
        if (
            len(df.columns) >= 2
            and sep != ","
            and not _has_numeric_column(df)
        ):
            retry = _read_with_fallback(raw_path, sep=sep, decimal=",")
            if _has_numeric_column(retry):
                df = retry
                decimal = ","

        if len(df.columns) < 2:
            raise ValueError(
                "CSV needs at least two columns: a date column and a value column."
            )
        if len(df) < 10:
            raise ValueError(
                "Too few rows. Foresee needs at least 10 rows to forecast."
            )

        columns: list[ColumnInfo] = []
        for name in df.columns:
            col = df[name]
            dtype = _infer_column_dtype(col)
            examples = [str(v) for v in col.dropna().head(5).tolist()]
            null_fraction = float(col.isna().mean()) if len(col) else 0.0
            columns.append(
                ColumnInfo(
                    name=str(name),
                    dtype=dtype,
                    example_values=examples,
                    null_fraction=round(null_fraction, 4),
                )
            )

        if not any(col.dtype == "numeric" for col in columns):
            raise ValueError(
                "Couldn't find a numeric column in the CSV. Foresee forecasts numeric values."
            )

        first_rows = df.head(preview_rows).where(df.notna(), None).to_dict(orient="records")

        meta = {
            "id": dataset_id,
            "kind": "csv",
            "filename": filename,
            "row_count": int(len(df)),
            "uploaded_at": datetime.datetime.utcnow().isoformat() + "Z",
            "schema_version": _SCHEMA_VERSION,
            "csv_sep": sep,
            "csv_decimal": decimal,
        }
        (dataset_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

        logger.info(
            "Ingested dataset %s: %s rows, %s columns",
            dataset_id, len(df), len(df.columns),
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


register(CSVLoader())


__all__ = ["CSVLoader", "ingest_upload"]
