"""HTTP-level tests for POST /api/datasets/upload across file formats."""

from __future__ import annotations

import io
import json as stdlib_json

import pandas as pd
import pytest
from fastapi.testclient import TestClient


def _csv_bytes() -> bytes:
    rows = "\n".join(f"2021-{m:02d}-01,{10 * m}" for m in range(1, 13))
    return f"Date,QTY\n{rows}\n".encode()


def _xlsx_bytes(sheet_name: str = "Sheet1") -> bytes:
    df = pd.DataFrame(
        {
            "date": pd.date_range("2021-01-01", periods=12, freq="MS"),
            "qty": list(range(10, 22)),
        }
    )
    buf = io.BytesIO()
    df.to_excel(buf, sheet_name=sheet_name, index=False)
    return buf.getvalue()


def _parquet_bytes() -> bytes:
    df = pd.DataFrame(
        {
            "date": pd.date_range("2021-01-01", periods=12, freq="MS"),
            "qty": list(range(10, 22)),
        }
    )
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    return buf.getvalue()


def _json_array_bytes() -> bytes:
    records = [{"date": f"2021-{m:02d}-01", "qty": m} for m in range(1, 13)]
    return stdlib_json.dumps(records).encode()


@pytest.mark.unit
def test_upload_csv(client: TestClient) -> None:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.csv", _csv_bytes(), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["row_count"] == 12


@pytest.mark.unit
def test_upload_xlsx(client: TestClient) -> None:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.xlsx", _xlsx_bytes(), "application/vnd.ms-excel")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["row_count"] == 12


@pytest.mark.unit
def test_upload_parquet(client: TestClient) -> None:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.parquet", _parquet_bytes(), "application/octet-stream")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["row_count"] == 12


@pytest.mark.unit
def test_upload_json(client: TestClient) -> None:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.json", _json_array_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["row_count"] == 12


@pytest.mark.unit
def test_upload_json_with_nested_path(client: TestClient) -> None:
    records = [{"date": f"2021-{m:02d}-01", "qty": m} for m in range(1, 13)]
    raw = stdlib_json.dumps({"data": {"items": records}}).encode()
    resp = client.post(
        "/api/datasets/upload?json_path=data.items",
        files={"file": ("nested.json", raw, "application/json")},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.unit
def test_upload_xlsx_with_sheet_param(client: TestClient) -> None:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf) as writer:
        pd.DataFrame({"a": [1, 2]}).to_excel(writer, sheet_name="skip", index=False)
        pd.DataFrame(
            {
                "date": pd.date_range("2021-01-01", periods=12, freq="MS"),
                "qty": list(range(10, 22)),
            }
        ).to_excel(writer, sheet_name="target", index=False)
    resp = client.post(
        "/api/datasets/upload?sheet=target",
        files={"file": ("multi.xlsx", buf.getvalue(), "application/vnd.ms-excel")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["row_count"] == 12


@pytest.mark.unit
def test_upload_unsupported_extension(client: TestClient) -> None:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("sales.exe", b"definitely not a dataset", "application/octet-stream")},
    )
    assert resp.status_code == 415


@pytest.mark.unit
def test_upload_empty_file(client: TestClient) -> None:
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert resp.status_code == 400


@pytest.mark.unit
def test_upload_then_list_and_preview(client: TestClient) -> None:
    """End-to-end: upload a parquet, list finds it, preview reloads it."""

    up = client.post(
        "/api/datasets/upload",
        files={"file": ("s.parquet", _parquet_bytes(), "application/octet-stream")},
    )
    assert up.status_code == 200, up.text
    dataset_id = up.json()["id"]

    lst = client.get("/api/datasets")
    assert lst.status_code == 200
    assert any(d["id"] == dataset_id for d in lst.json())

    prev = client.get(f"/api/datasets/{dataset_id}/preview")
    assert prev.status_code == 200, prev.text
    assert prev.json()["row_count"] == 12
