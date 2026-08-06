"""JSON and JSONL loader.

Two file shapes are supported:

1. **JSON Lines** (``.jsonl``, ``.ndjson``): one JSON object per line. Parsed
    via ``pd.read_json(..., lines=True)``.
2. **JSON** (``.json``): either a top-level array of records, or a nested
    structure when ``source_spec["json_path"]`` points to the records array.

``source_spec`` supports:
    json_path: str | None -- dotted path into the JSON doc that resolves to
        the records array (e.g. ``"data.records"`` or ``"$.items"``). Leading
        ``$.`` is ignored for convenience. Omit for top-level arrays.

Parsed DataFrames are materialized to ``data.parquet`` so load() is fast.
Raw bytes are preserved at the original extension (``raw.json`` / ``raw.jsonl``)
for refresh or re-parse.
"""

from __future__ import annotations

import io
import json as _json
import logging
from pathlib import Path
from typing import Any, ClassVar

import pandas as pd

from ...schemas.dataset import DatasetPreview
from . import register
from ._file_common import finalize_ingest

logger = logging.getLogger(__name__)


class JSONLoader:
    kind: ClassVar[str] = "json"
    extensions: ClassVar[tuple[str, ...]] = (".json", ".jsonl", ".ndjson")

    def ingest(
        self,
        *,
        filename: str,
        raw_bytes: bytes | None,
        source_spec: dict[str, Any],
        datasets_dir: Path,
    ) -> DatasetPreview:
        if raw_bytes is None:
            raise ValueError("JSON ingest requires upload bytes.")

        ext = _choose_extension(filename)
        is_lines = ext in (".jsonl", ".ndjson")
        json_path = (source_spec or {}).get("json_path")

        df = _parse_json(raw_bytes, is_lines=is_lines, json_path=json_path)

        source: dict[str, Any] | None = None
        if is_lines or json_path:
            source = {"lines": is_lines}
            if json_path:
                source["json_path"] = json_path

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
                f"Materialized parquet missing for JSON dataset at {dataset_dir}"
            )
        return pd.read_parquet(parquet_path)


def _choose_extension(filename: str) -> str:
    lower = filename.lower()
    for ext in (".jsonl", ".ndjson", ".json"):
        if lower.endswith(ext):
            return ext
    return ".json"


def _parse_json(
    raw_bytes: bytes,
    *,
    is_lines: bool,
    json_path: str | None,
) -> pd.DataFrame:
    """Turn upload bytes into a DataFrame, honoring the json_path if present."""

    if is_lines:
        try:
            return pd.read_json(io.BytesIO(raw_bytes), lines=True)
        except Exception as exc:
            raise ValueError(f"Could not read JSON Lines file: {exc}") from exc

    try:
        doc = _json.loads(raw_bytes.decode("utf-8-sig"))
    except UnicodeDecodeError:
        doc = _json.loads(raw_bytes.decode("latin-1"))
    except _json.JSONDecodeError as exc:
        raise ValueError(f"Could not parse JSON: {exc}") from exc

    records = _resolve_json_path(doc, json_path) if json_path else doc

    if not isinstance(records, list):
        raise ValueError(
            "JSON must be an array of records. If your records are nested, "
            "pass a json_path like 'data.items'."
        )
    if not records:
        raise ValueError("JSON contains no records.")
    if not all(isinstance(r, dict) for r in records):
        raise ValueError("JSON records must be objects (key/value pairs).")

    return pd.DataFrame.from_records(records)


def _resolve_json_path(doc: Any, path: str) -> Any:
    """Resolve a simple dotted path. Accepts a leading ``$.`` for convenience."""

    cleaned = path.strip()
    if cleaned.startswith("$."):
        cleaned = cleaned[2:]
    elif cleaned.startswith("$"):
        cleaned = cleaned[1:]

    cursor: Any = doc
    for part in filter(None, cleaned.split(".")):
        if isinstance(cursor, dict) and part in cursor:
            cursor = cursor[part]
        else:
            raise ValueError(
                f"json_path '{path}' not found in document (stuck at '{part}')."
            )
    return cursor


register(JSONLoader())


__all__ = ["JSONLoader"]
