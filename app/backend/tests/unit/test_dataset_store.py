"""Tests for services.dataset_store dispatcher + meta shim.

These tests lock down the contract that keeps main shippable while we add more
loaders: legacy meta.json (no kind/schema_version) still loads as CSV, and the
dispatcher routes to the right loader based on meta["kind"].
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from foreko.services import dataset_store
from foreko.services.loaders import LOADERS, register


@pytest.mark.unit
def test_read_meta_fills_legacy_defaults(tmp_path: Path) -> None:
    dataset_dir = tmp_path / "abc"
    dataset_dir.mkdir()
    (dataset_dir / "meta.json").write_text(
        json.dumps({"id": "abc", "filename": "old.csv", "row_count": 10, "uploaded_at": "2024-01-01T00:00:00Z"}),
        encoding="utf-8",
    )
    meta = dataset_store.read_meta(dataset_dir)
    assert meta["kind"] == "csv"
    assert meta["schema_version"] == 1


@pytest.mark.unit
def test_read_meta_missing_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        dataset_store.read_meta(tmp_path / "nothing")


@pytest.mark.unit
def test_write_meta_atomic_roundtrip(tmp_path: Path) -> None:
    meta = {"id": "xyz", "kind": "csv", "schema_version": 2}
    dataset_store.write_meta(tmp_path, meta)
    assert (tmp_path / "meta.json").exists()
    # The .tmp file must not be left behind.
    assert not (tmp_path / "meta.json.tmp").exists()
    loaded = dataset_store.read_meta(tmp_path)
    assert loaded == meta


@pytest.mark.unit
def test_load_dataset_routes_legacy_csv(tmp_path: Path) -> None:
    """A pre-refactor dataset directory (raw.csv + legacy meta.json without
    ``kind``) must still load through the dispatcher."""

    dataset_dir = tmp_path / "legacy_id"
    dataset_dir.mkdir()
    (dataset_dir / "raw.csv").write_text(
        "date,value\n2021-01-01,1\n2021-01-02,2\n", encoding="utf-8"
    )
    (dataset_dir / "meta.json").write_text(
        json.dumps({"id": "legacy_id", "filename": "x.csv", "row_count": 2, "uploaded_at": "2024"}),
        encoding="utf-8",
    )
    df = dataset_store.load_dataset("legacy_id", tmp_path)
    assert list(df.columns) == ["date", "value"]
    assert len(df) == 2


@pytest.mark.unit
def test_load_dataset_unknown_dataset_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        dataset_store.load_dataset("does_not_exist", tmp_path)


@pytest.mark.unit
def test_dispatcher_delegates_by_kind(tmp_path: Path) -> None:
    """Register a fake loader, write its meta, and verify load_dataset routes
    to it based on meta["kind"]."""

    class FakeLoader:
        kind = "fake_test_kind"
        extensions: tuple[str, ...] = ()

        def ingest(self, *, filename, raw_bytes, source_spec, datasets_dir):  # pragma: no cover - not exercised here
            raise NotImplementedError

        def load(self, dataset_dir: Path) -> pd.DataFrame:
            return pd.DataFrame({"hello": [1, 2, 3]})

    register(FakeLoader())  # type: ignore[arg-type]
    try:
        dataset_dir = tmp_path / "fake_id"
        dataset_dir.mkdir()
        dataset_store.write_meta(
            dataset_dir,
            {"id": "fake_id", "kind": "fake_test_kind", "schema_version": 2},
        )
        df = dataset_store.load_dataset("fake_id", tmp_path)
        assert list(df.columns) == ["hello"]
        assert df["hello"].tolist() == [1, 2, 3]
    finally:
        LOADERS.pop("fake_test_kind", None)


@pytest.mark.unit
def test_list_known_kinds_includes_csv() -> None:
    assert "csv" in dataset_store.list_known_kinds()


@pytest.mark.unit
def test_csv_ingest_writes_new_meta_fields(tmp_path: Path) -> None:
    """New uploads must write schema_version=2 and kind=csv."""

    rows = "\n".join(f"2021-{m:02d}-01,{m}" for m in range(1, 13))
    content = f"Date,QTY\n{rows}\n".encode()
    from foreko.services.loaders.csv import ingest_upload

    preview = ingest_upload(filename="new.csv", content=content, datasets_dir=tmp_path)
    meta = dataset_store.read_meta(tmp_path / preview.id)
    assert meta["kind"] == "csv"
    assert meta["schema_version"] == 2
    assert meta["filename"] == "new.csv"
