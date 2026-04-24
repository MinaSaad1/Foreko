"""Tests for services.csv_loader."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from timesfm_studio.schemas.dataset import ColumnMapping, DateParts
from timesfm_studio.services import csv_loader


@pytest.mark.unit
def test_ingest_upload_creates_preview(tmp_path: Path) -> None:
    content = b"Date,QTY\n2021-01-01,10\n2021-02-01,20\n"
    preview = csv_loader.ingest_upload(
        filename="sample.csv", content=content, datasets_dir=tmp_path
    )
    assert preview.row_count == 2
    assert {c.name for c in preview.columns} == {"Date", "QTY"}
    qty_col = next(c for c in preview.columns if c.name == "QTY")
    assert qty_col.dtype == "numeric"
    date_col = next(c for c in preview.columns if c.name == "Date")
    assert date_col.dtype == "datetime"


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
