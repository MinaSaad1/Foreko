"""Tests for services.csv_loader."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from foreko.schemas.dataset import ColumnMapping, DateParts
from foreko.services import csv_loader


@pytest.mark.unit
def test_ingest_upload_creates_preview(tmp_path: Path) -> None:
    rows = "\n".join(
        f"2021-{m:02d}-01,{10 * m}" for m in range(1, 13)
    )
    content = f"Date,QTY\n{rows}\n".encode()
    preview = csv_loader.ingest_upload(
        filename="sample.csv", content=content, datasets_dir=tmp_path
    )
    assert preview.row_count == 12
    assert {c.name for c in preview.columns} == {"Date", "QTY"}
    qty_col = next(c for c in preview.columns if c.name == "QTY")
    assert qty_col.dtype == "numeric"
    date_col = next(c for c in preview.columns if c.name == "Date")
    assert date_col.dtype == "datetime"


@pytest.mark.unit
def test_ingest_upload_sniffs_semicolon_delimiter(tmp_path: Path) -> None:
    rows = "\n".join(f"2021-{m:02d}-01;{10 * m}" for m in range(1, 13))
    content = f"Date;QTY\n{rows}\n".encode()
    preview = csv_loader.ingest_upload(
        filename="euro.csv", content=content, datasets_dir=tmp_path
    )
    assert preview.row_count == 12
    assert {c.name for c in preview.columns} == {"Date", "QTY"}
    # Meta should persist the detected dialect for the load() path.
    meta_path = tmp_path / preview.id / "meta.json"
    import json as _json
    meta = _json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["csv_sep"] == ";"
    assert meta["csv_decimal"] == "."


@pytest.mark.unit
def test_ingest_upload_handles_european_decimal_comma(tmp_path: Path) -> None:
    rows = "\n".join(f"2021-{m:02d}-01;{m},{m*5:02d}" for m in range(1, 13))
    content = f"Date;Temp\n{rows}\n".encode()
    preview = csv_loader.ingest_upload(
        filename="euro-decimal.csv", content=content, datasets_dir=tmp_path
    )
    assert preview.row_count == 12
    temp_col = next(c for c in preview.columns if c.name == "Temp")
    assert temp_col.dtype == "numeric"
    import json as _json
    meta = _json.loads((tmp_path / preview.id / "meta.json").read_text(encoding="utf-8"))
    assert meta["csv_sep"] == ";"
    assert meta["csv_decimal"] == ","


@pytest.mark.unit
def test_ingest_upload_rejects_too_few_rows(tmp_path: Path) -> None:
    content = b"Date,QTY\n2021-01-01,10\n2021-02-01,20\n"
    with pytest.raises(ValueError, match="at least 10 rows"):
        csv_loader.ingest_upload(
            filename="tiny.csv", content=content, datasets_dir=tmp_path
        )


@pytest.mark.unit
def test_ingest_upload_rejects_single_column(tmp_path: Path) -> None:
    rows = "\n".join(str(i) for i in range(12))
    content = f"only_date\n{rows}\n".encode()
    with pytest.raises(ValueError, match="at least two columns"):
        csv_loader.ingest_upload(
            filename="one-col.csv", content=content, datasets_dir=tmp_path
        )


@pytest.mark.unit
def test_ingest_upload_rejects_non_numeric(tmp_path: Path) -> None:
    rows = "\n".join(
        f"2021-{m:02d}-01,label_{m},tag" for m in range(1, 13)
    )
    content = f"Date,Label,Tag\n{rows}\n".encode()
    with pytest.raises(ValueError, match="numeric column"):
        csv_loader.ingest_upload(
            filename="labels-only.csv", content=content, datasets_dir=tmp_path
        )


@pytest.mark.unit
def test_extract_series_rejects_constant() -> None:
    df = pd.DataFrame(
        {
            "Date": pd.date_range("2021-01-01", periods=12, freq="MS"),
            "QTY": [5.0] * 12,
        }
    )
    mapping = ColumnMapping(value_col="QTY", date_col="Date")
    with pytest.raises(ValueError, match="constant"):
        csv_loader.extract_series(df, mapping)


@pytest.mark.unit
def test_extract_series_auto_aggregates_duplicate_timestamps_when_no_series_col() -> None:
    # When the user leaves series_id_col=None but the CSV actually contains
    # multiple series stacked under one value column, extract_series now sums
    # the duplicates per date instead of failing. This keeps the series
    # column genuinely optional.
    df = pd.DataFrame(
        {
            "Date": ["2021-01-01"] * 2 + [f"2021-{m:02d}-01" for m in range(2, 12)],
            "QTY": list(range(12)),
        }
    )
    mapping = ColumnMapping(value_col="QTY", date_col="Date")
    ids, values, dates = csv_loader.extract_series(df, mapping)
    assert ids == ["series"]
    # Jan sums 0+1=1, Feb..Dec pass through as-is
    assert values[0][0] == 1.0
    assert len(values[0]) == 11
    # Still rejects duplicates when user explicitly picked a series_id_col
    # but that column contains the same id with colliding dates.
    dup_df = pd.DataFrame(
        {
            "Date": ["2021-01-01", "2021-01-01"],
            "QTY": [1.0, 2.0],
            "sid": ["A", "A"],
        }
    )
    with pytest.raises(ValueError, match="duplicate timestamps"):
        csv_loader.extract_series(
            dup_df, ColumnMapping(value_col="QTY", date_col="Date", series_id_col="sid")
        )


@pytest.mark.unit
def test_extract_series_with_year_month_composition(tmp_path: Path) -> None:
    df = pd.DataFrame(
        {
            "Year": [2021, 2021, 2022, 2022],
            "Month": ["Jan", "Feb", "Jan", "Feb"],
            "QTY": [10, 20, 30, 40],
        }
    )
    mapping = ColumnMapping(
        value_col="QTY",
        date_parts=DateParts(year_col="Year", month_col="Month"),
    )
    ids, values, dates = csv_loader.extract_series(df, mapping)
    assert ids == ["series"]
    assert np.allclose(values[0], [10.0, 20.0, 30.0, 40.0])
    assert str(dates[0][0].date()) == "2021-01-01"
    assert str(dates[0][-1].date()) == "2022-02-01"


@pytest.mark.unit
def test_extract_series_multi_series(tmp_path: Path) -> None:
    df = pd.DataFrame(
        {
            "Date": pd.date_range("2021-01-01", periods=4, freq="MS"),
            "store": ["A", "A", "B", "B"],
            "QTY": [1, 2, 3, 4],
        }
    )
    mapping = ColumnMapping(value_col="QTY", date_col="Date", series_id_col="store")
    ids, values, _ = csv_loader.extract_series(df, mapping)
    assert ids == ["A", "B"]
    assert np.allclose(values[0], [1, 2])
    assert np.allclose(values[1], [3, 4])


@pytest.mark.unit
def test_extract_series_rejects_bad_dates() -> None:
    df = pd.DataFrame({"Date": ["nope", "2021-01-01"], "QTY": [1, 2]})
    mapping = ColumnMapping(value_col="QTY", date_col="Date")
    with pytest.raises(ValueError, match="unparseable"):
        csv_loader.extract_series(df, mapping)


@pytest.mark.unit
def test_column_mapping_requires_date_source() -> None:
    with pytest.raises(ValueError):
        ColumnMapping(value_col="QTY")
    with pytest.raises(ValueError):
        ColumnMapping(
            value_col="QTY",
            date_col="Date",
            date_parts=DateParts(year_col="Year", month_col="Month"),
        )


@pytest.mark.unit
def test_month_normalization() -> None:
    assert csv_loader._normalize_month("Jan") == 1
    assert csv_loader._normalize_month("December") == 12
    assert csv_loader._normalize_month("03") == 3
    assert csv_loader._normalize_month(7) == 7
    assert csv_loader._normalize_month("not-a-month") is None
