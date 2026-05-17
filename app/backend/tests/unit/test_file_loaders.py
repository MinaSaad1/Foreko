"""Tests for the Excel, Parquet, and JSON dataset loaders.

Each loader round-trips through ingest() + load(), so this also validates that
the dataset_store dispatcher routes to the right loader by meta["kind"].
"""

from __future__ import annotations

import io
import json as stdlib_json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from foreko.services import dataset_store
from foreko.services.loaders import LOADERS, loader_for_extension
from foreko.services.loaders.excel import ExcelLoader, list_sheets
from foreko.services.loaders.json import JSONLoader
from foreko.services.loaders.parquet import ParquetLoader


def _good_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": pd.date_range("2021-01-01", periods=12, freq="MS"),
            "qty": list(range(10, 22)),
        }
    )


# ------------------------------------------------------------------ Excel --


@pytest.mark.unit
def test_excel_roundtrip(tmp_path: Path) -> None:
    df = _good_df()
    buf = io.BytesIO()
    df.to_excel(buf, sheet_name="Sheet1", index=False)
    raw = buf.getvalue()

    loader = ExcelLoader()
    preview = loader.ingest(
        filename="sales.xlsx",
        raw_bytes=raw,
        source_spec={},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12
    assert {c.name for c in preview.columns} == {"date", "qty"}

    reloaded = dataset_store.load_dataset(preview.id, tmp_path)
    assert list(reloaded.columns) == ["date", "qty"]
    assert reloaded["qty"].iloc[0] == 10

    # Meta captures the sheet used and the loader kind.
    meta = dataset_store.read_meta(tmp_path / preview.id)
    assert meta["kind"] == "excel"
    assert meta.get("source", {}).get("sheet") == "Sheet1"


@pytest.mark.unit
def test_excel_sheet_selection(tmp_path: Path) -> None:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as writer:
        pd.DataFrame({"a": [1, 2]}).to_excel(writer, sheet_name="ignore", index=False)
        _good_df().to_excel(writer, sheet_name="real_data", index=False)
    raw = buf.getvalue()

    assert list_sheets(raw, "multi.xlsx") == ["ignore", "real_data"]

    preview = ExcelLoader().ingest(
        filename="multi.xlsx",
        raw_bytes=raw,
        source_spec={"sheet": "real_data"},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12
    meta = dataset_store.read_meta(tmp_path / preview.id)
    assert meta["source"]["sheet"] == "real_data"


@pytest.mark.unit
def test_excel_rejects_too_few_rows(tmp_path: Path) -> None:
    df = pd.DataFrame({"date": ["2021-01-01", "2021-02-01"], "qty": [1, 2]})
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    with pytest.raises(ValueError, match="at least 10 rows"):
        ExcelLoader().ingest(
            filename="tiny.xlsx",
            raw_bytes=buf.getvalue(),
            source_spec={},
            datasets_dir=tmp_path,
        )
    # Dataset directory was cleaned up on failure.
    assert list(tmp_path.iterdir()) == []


# ---------------------------------------------------------------- Parquet --


@pytest.mark.unit
def test_parquet_roundtrip(tmp_path: Path) -> None:
    df = _good_df()
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    raw = buf.getvalue()

    preview = ParquetLoader().ingest(
        filename="sales.parquet",
        raw_bytes=raw,
        source_spec={},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12
    reloaded = dataset_store.load_dataset(preview.id, tmp_path)
    assert np.allclose(reloaded["qty"], df["qty"])
    # Parquet keeps raw.parquet (no separate data.parquet needed).
    assert (tmp_path / preview.id / "raw.parquet").exists()
    assert not (tmp_path / preview.id / "data.parquet").exists()
    meta = dataset_store.read_meta(tmp_path / preview.id)
    assert meta["kind"] == "parquet"


@pytest.mark.unit
def test_parquet_rejects_corrupt_bytes(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Could not read Parquet"):
        ParquetLoader().ingest(
            filename="broken.parquet",
            raw_bytes=b"this is not parquet",
            source_spec={},
            datasets_dir=tmp_path,
        )
    assert list(tmp_path.iterdir()) == []


# ------------------------------------------------------------------- JSON --


@pytest.mark.unit
def test_json_array_roundtrip(tmp_path: Path) -> None:
    records = [
        {"date": f"2021-{m:02d}-01", "qty": m * 10} for m in range(1, 13)
    ]
    raw = stdlib_json.dumps(records).encode("utf-8")

    preview = JSONLoader().ingest(
        filename="sales.json",
        raw_bytes=raw,
        source_spec={},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12
    reloaded = dataset_store.load_dataset(preview.id, tmp_path)
    assert list(reloaded.columns) == ["date", "qty"]


@pytest.mark.unit
def test_jsonl_roundtrip(tmp_path: Path) -> None:
    lines = [
        stdlib_json.dumps({"date": f"2021-{m:02d}-01", "qty": m})
        for m in range(1, 13)
    ]
    raw = ("\n".join(lines)).encode("utf-8")

    preview = JSONLoader().ingest(
        filename="sales.jsonl",
        raw_bytes=raw,
        source_spec={},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12
    meta = dataset_store.read_meta(tmp_path / preview.id)
    assert meta["source"]["lines"] is True


@pytest.mark.unit
def test_json_nested_with_path(tmp_path: Path) -> None:
    records = [{"date": f"2021-{m:02d}-01", "qty": m} for m in range(1, 13)]
    doc = {"meta": {"version": 1}, "data": {"items": records}}
    raw = stdlib_json.dumps(doc).encode("utf-8")

    preview = JSONLoader().ingest(
        filename="nested.json",
        raw_bytes=raw,
        source_spec={"json_path": "data.items"},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12


@pytest.mark.unit
def test_json_dollar_prefixed_path_accepted(tmp_path: Path) -> None:
    records = [{"date": f"2021-{m:02d}-01", "qty": m} for m in range(1, 13)]
    raw = stdlib_json.dumps({"records": records}).encode("utf-8")

    preview = JSONLoader().ingest(
        filename="nested.json",
        raw_bytes=raw,
        source_spec={"json_path": "$.records"},
        datasets_dir=tmp_path,
    )
    assert preview.row_count == 12


@pytest.mark.unit
def test_json_bad_path_raises(tmp_path: Path) -> None:
    records = [{"date": f"2021-{m:02d}-01", "qty": m} for m in range(1, 13)]
    raw = stdlib_json.dumps({"data": records}).encode("utf-8")
    with pytest.raises(ValueError, match="json_path"):
        JSONLoader().ingest(
            filename="x.json",
            raw_bytes=raw,
            source_spec={"json_path": "nowhere.here"},
            datasets_dir=tmp_path,
        )


@pytest.mark.unit
def test_json_non_record_array_rejected(tmp_path: Path) -> None:
    raw = stdlib_json.dumps([1, 2, 3, 4]).encode("utf-8")
    with pytest.raises(ValueError, match="records must be objects"):
        JSONLoader().ingest(
            filename="flat.json",
            raw_bytes=raw,
            source_spec={},
            datasets_dir=tmp_path,
        )


# ------------------------------------------------------ extension mapping --


@pytest.mark.unit
def test_registry_exposes_all_kinds() -> None:
    assert {"csv", "excel", "parquet", "json"} <= set(LOADERS)


@pytest.mark.unit
@pytest.mark.parametrize(
    "ext,expected_kind",
    [
        (".csv", "csv"),
        (".xlsx", "excel"),
        (".xls", "excel"),
        (".parquet", "parquet"),
        (".json", "json"),
        (".jsonl", "json"),
        (".ndjson", "json"),
    ],
)
def test_loader_for_extension(ext: str, expected_kind: str) -> None:
    loader = loader_for_extension(ext)
    assert loader is not None
    assert loader.kind == expected_kind


@pytest.mark.unit
def test_loader_for_unknown_extension_returns_none() -> None:
    assert loader_for_extension(".exe") is None
