"""End-to-end unit test: upload CSV, forecast, get quantile bands (fake model)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.mark.unit
def test_upload_and_forecast_with_fake_model(client: TestClient) -> None:
    csv = "Date,QTY\n" + "\n".join(
        f"2021-{m:02d}-01,{10 + m}" for m in range(1, 13)
    )
    upload_resp = client.post(
        "/api/datasets/upload",
        files={"file": ("demo.csv", csv.encode("utf-8"), "text/csv")},
    )
    assert upload_resp.status_code == 200, upload_resp.text
    dataset_id = upload_resp.json()["id"]

    forecast_resp = client.post(
        "/api/forecast",
        json={
            "dataset_id": dataset_id,
            "mapping": {
                "value_col": "QTY",
                "date_col": "Date",
            },
            "horizon": 6,
        },
    )
    assert forecast_resp.status_code == 200, forecast_resp.text
    body = forecast_resp.json()
    assert body["horizon"] == 6
    assert len(body["series"]) == 1
    ser = body["series"][0]
    assert len(ser["point"]) == 6
    assert len(ser["q10"]) == 6
    assert len(ser["q50"]) == 6
    assert len(ser["q90"]) == 6
    assert len(ser["all_quantiles"]) == 6
    assert all(len(row) == 10 for row in ser["all_quantiles"])
    # p10 <= p50 <= p90 ordering holds for the fake model.
    assert ser["q10"][0] <= ser["q50"][0] <= ser["q90"][0]


@pytest.mark.unit
def test_year_month_composition_upload(client: TestClient) -> None:
    csv = "Year,Month,QTY\n"
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for i, m in enumerate(months):
        csv += f"2021,{m},{100 + i}\n"
    upload = client.post(
        "/api/datasets/upload",
        files={"file": ("yearmonth.csv", csv.encode("utf-8"), "text/csv")},
    )
    dataset_id = upload.json()["id"]

    resp = client.post(
        "/api/forecast",
        json={
            "dataset_id": dataset_id,
            "mapping": {
                "value_col": "QTY",
                "date_parts": {"year_col": "Year", "month_col": "Month"},
            },
            "horizon": 3,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ser = body["series"][0]
    assert len(ser["history_values"]) == 12
    assert ser["history_dates"][0] == "2021-01-01"
    assert ser["history_dates"][-1] == "2021-12-01"
    assert len(ser["future_dates"]) == 3
