"""Excel loader (.xlsx via openpyxl, legacy .xls via xlrd).

On ingest we persist the original upload bytes at ``raw.xlsx`` (or ``raw.xls``)
and materialize the chosen sheet to ``data.parquet`` so load() is a single
fast read regardless of sheet size. Refresh re-reads the original if we ever
need it.

``source_spec`` supports:
    sheet: str | int | None -- sheet name or 0-based index, defaults to the
        first sheet.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any, ClassVar

import pandas as pd

from ...schemas.dataset import DatasetPreview
from . import register
from ._file_common import finalize_ingest

logger = logging.getLogger(__name__)


class ExcelLoader:
    kind: ClassVar[str] = "excel"
    extensions: ClassVar[tuple[str, ...]] = (".xlsx", ".xls")

    def ingest(
        self,
        *,
        filename: str,
        raw_bytes: bytes | None,
        source_spec: dict[str, Any],
        datasets_dir: Path,
    ) -> DatasetPreview:
        if raw_bytes is None:
            raise ValueError("Excel ingest requires upload bytes.")

        ext = _choose_extension(filename)
        engine = "openpyxl" if ext == ".xlsx" else "xlrd"
        sheet = source_spec.get("sheet") if source_spec else None

        try:
            df = pd.read_excel(
                io.BytesIO(raw_bytes),
                sheet_name=sheet if sheet is not None else 0,
                engine=engine,
            )
        except Exception as exc:
            raise ValueError(f"Could not read Excel file: {exc}") from exc

        # pandas returns a dict when sheet_name is None; we always pass a single
        # sheet spec above, so df is always a DataFrame. Keep this guard as a
        # safety net in case a future change passes sheet_name=None.
        if isinstance(df, dict):
            raise ValueError(
                "Multi-sheet ingestion is not supported. Pick a single sheet."
            )

        resolved_sheet = sheet if sheet is not None else _first_sheet_name(
            raw_bytes, engine
        )
        source = {"sheet": resolved_sheet} if resolved_sheet is not None else None

        return finalize_ingest(
            df=df,
            raw_bytes=raw_bytes,
            raw_filename=f"raw{ext}",
            filename=filename,
            kind=self.kind,
            source=source,
            datasets_dir=datasets_dir,
            write_parquet=True,
        )

    def load(self, dataset_dir: Path) -> pd.DataFrame:
        parquet_path = dataset_dir / "data.parquet"
        if not parquet_path.exists():
            raise FileNotFoundError(
                f"Materialized parquet missing for Excel dataset at {dataset_dir}"
            )
        return pd.read_parquet(parquet_path)


def list_sheets(raw_bytes: bytes, filename: str) -> list[str]:
    """Return sheet names so the frontend can render a picker before ingest."""

    ext = _choose_extension(filename)
    engine = "openpyxl" if ext == ".xlsx" else "xlrd"
    xls = pd.ExcelFile(io.BytesIO(raw_bytes), engine=engine)
    return list(xls.sheet_names)


def _choose_extension(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        return ".xlsx"
    if lower.endswith(".xls"):
        return ".xls"
    # Default to .xlsx for ambiguous filenames; openpyxl will fail loudly if
    # the bytes are not a valid xlsx file, which is the behaviour we want.
    return ".xlsx"


def _first_sheet_name(raw_bytes: bytes, engine: str) -> str | None:
    try:
        xls = pd.ExcelFile(io.BytesIO(raw_bytes), engine=engine)
        names = list(xls.sheet_names)
        return names[0] if names else None
    except Exception:
        return None


register(ExcelLoader())


__all__ = ["ExcelLoader", "list_sheets"]
