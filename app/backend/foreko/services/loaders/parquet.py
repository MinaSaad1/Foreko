"""Parquet loader.

Uploaded file IS already the canonical format, so we skip the "materialize to
parquet" step that Excel/JSON go through. The raw bytes are stored at
``raw.parquet`` and load() reads it directly.
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


class ParquetLoader:
    kind: ClassVar[str] = "parquet"
    extensions: ClassVar[tuple[str, ...]] = (".parquet",)

    def ingest(
        self,
        *,
        filename: str,
        raw_bytes: bytes | None,
        source_spec: dict[str, Any],
        datasets_dir: Path,
    ) -> DatasetPreview:
        if raw_bytes is None:
            raise ValueError("Parquet ingest requires upload bytes.")

        try:
            df = pd.read_parquet(io.BytesIO(raw_bytes))
        except Exception as exc:
            raise ValueError(f"Could not read Parquet file: {exc}") from exc

        return finalize_ingest(
            df=df,
            raw_bytes=raw_bytes,
            raw_filename="raw.parquet",
            filename=filename,
            kind=self.kind,
            source=None,
            datasets_dir=datasets_dir,
            write_parquet=False,  # raw.parquet is already canonical
        )

    def load(self, dataset_dir: Path) -> pd.DataFrame:
        path = dataset_dir / "raw.parquet"
        if not path.exists():
            raise FileNotFoundError(
                f"Parquet file missing for dataset at {dataset_dir}"
            )
        return pd.read_parquet(path)


register(ParquetLoader())


__all__ = ["ParquetLoader"]
