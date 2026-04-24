"""Generate deterministic synthetic sample CSVs for the frontend samples picker.

Run from the repo root:

    uv run python scripts/generate_samples.py

Writes four CSVs into app/frontend/public/samples/. Each sample carries a
``series`` column with two distinct values so users can pick it as the
``series_id_col`` mapping and see multi-series forecasting end-to-end.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pandas as pd

OUT_DIR = Path(__file__).resolve().parent.parent / "app" / "frontend" / "public" / "samples"


def _save(df: pd.DataFrame, name: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    df.to_csv(path, index=False, quoting=csv.QUOTE_MINIMAL)
    print(f"wrote {path} ({len(df)} rows)")


def daily_sales() -> pd.DataFrame:
    """Three years of daily sales for two stores with shared seasonality."""

    rng = np.random.default_rng(42)
    dates = pd.date_range("2022-01-01", periods=1096, freq="D")
    day_of_week = np.array([d.weekday() for d in dates])
    month_of_year = np.array([d.month for d in dates])
    weekend_lift = np.where(day_of_week >= 5, 1.18, 1.0)
    seasonal = 1.0 + 0.2 * np.sin(2 * np.pi * (month_of_year - 11) / 12)
    holidays = np.zeros(len(dates), dtype=int)
    for idx, d in enumerate(dates):
        if (d.month, d.day) in {(1, 1), (7, 4), (11, 28), (12, 25), (12, 31)}:
            holidays[idx] = 1

    frames: list[pd.DataFrame] = []
    for store, base, trend_end in (("store_north", 1500.0, 1.20), ("store_south", 1100.0, 1.35)):
        trend = np.linspace(1.0, trend_end, len(dates))
        promotion = (rng.random(len(dates)) < 0.04).astype(int)
        promo_lift = 1.0 + 0.45 * promotion
        temperature_f = 50 + 25 * np.sin(2 * np.pi * (np.arange(len(dates)) - 110) / 365) + rng.normal(0, 4, len(dates))
        temp_effect = 1.0 + 0.004 * (temperature_f - 60)
        noise = rng.normal(0, 80, len(dates))
        sales = np.clip(base * trend * seasonal * weekend_lift * promo_lift * temp_effect + noise, 0, None).round(2)
        frames.append(
            pd.DataFrame(
                {
                    "date": dates.strftime("%Y-%m-%d"),
                    "series": store,
                    "sales": sales,
                    "promotion": promotion,
                    "is_holiday": holidays,
                    "temperature_f": np.round(temperature_f, 1),
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def website_traffic() -> pd.DataFrame:
    """Two years of daily sessions split across desktop and mobile traffic."""

    rng = np.random.default_rng(42)
    dates = pd.date_range("2023-01-01", periods=730, freq="D")
    day_of_week = np.array([d.weekday() for d in dates])
    month_of_year = np.array([d.month for d in dates])
    seasonal = 1.0 + 0.15 * np.sin(2 * np.pi * (month_of_year - 3) / 12)

    frames: list[pd.DataFrame] = []
    for segment, base, trend_end, weekend_factor in (
        ("desktop", 4200.0, 1.10, 0.55),
        ("mobile", 5100.0, 1.55, 0.85),
    ):
        trend = np.linspace(1.0, trend_end, len(dates))
        seg_weekend = np.where(day_of_week >= 5, weekend_factor, 1.0)
        base_curve = base * trend * seasonal * seg_weekend
        noise = rng.normal(0, 180, len(dates))
        sessions = np.clip(base_curve + noise, 0, None).round().astype(int)

        promo_day = 200
        sessions[promo_day] = int(sessions[promo_day] * 2.1)
        sessions[promo_day + 1] = int(sessions[promo_day + 1] * 1.5)

        organic = np.clip(
            0.3 + 0.05 * np.sin(np.arange(len(dates)) / 30) + rng.normal(0, 0.03, len(dates)),
            0.1,
            0.55,
        )
        frames.append(
            pd.DataFrame(
                {
                    "date": dates.strftime("%Y-%m-%d"),
                    "series": segment,
                    "sessions": sessions,
                    "organic_share": np.round(organic, 3),
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def energy_consumption() -> pd.DataFrame:
    """Ninety days of hourly kWh for two buildings with different load profiles."""

    rng = np.random.default_rng(42)
    timestamps = pd.date_range("2025-01-01 00:00", periods=24 * 90, freq="h")
    hour = np.array([t.hour for t in timestamps])
    day_of_week = np.array([t.weekday() for t in timestamps])

    frames: list[pd.DataFrame] = []
    for building, base, weekend_factor, peak_hour in (
        ("building_a", 120.0, 0.8, 7),
        ("building_b", 95.0, 1.05, 19),
    ):
        daily_cycle = 1.0 + 0.35 * np.sin(2 * np.pi * (hour - peak_hour) / 24)
        weekly_cycle = np.where(day_of_week >= 5, weekend_factor, 1.0)
        temperature_f = 42 + 12 * np.sin(2 * np.pi * np.arange(len(timestamps)) / (24 * 30)) + rng.normal(0, 2.5, len(timestamps))
        temp_effect = 1.0 + 0.008 * np.abs(temperature_f - 65)
        base_kwh = base * daily_cycle * weekly_cycle * temp_effect
        noise = rng.normal(0, 6, len(timestamps))
        kwh = np.clip(base_kwh + noise, 0, None).round(2)
        frames.append(
            pd.DataFrame(
                {
                    "timestamp": timestamps.strftime("%Y-%m-%d %H:%M"),
                    "series": building,
                    "kwh": kwh,
                    "temperature_f": np.round(temperature_f, 1),
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def monthly_revenue() -> pd.DataFrame:
    """Six years of monthly revenue for two regions with shared seasonality."""

    rng = np.random.default_rng(42)
    months = pd.date_range("2020-01-01", periods=72, freq="MS")
    idx = np.arange(len(months))
    month_num = np.array([d.month for d in months])
    annual = 1.0 + 0.18 * np.sin(2 * np.pi * (month_num - 4) / 12)

    frames: list[pd.DataFrame] = []
    for region, base, slope, spend_base in (
        ("us", 180_000, 3_200, 18_000),
        ("eu", 132_000, 2_400, 13_500),
    ):
        trend = base + slope * idx
        noise = rng.normal(0, 6_500, len(months))
        revenue = np.round(trend * annual + noise, 2)
        marketing = np.round(
            np.clip(spend_base + (slope * 0.18) * idx + rng.normal(0, 1_200, len(months)), 0, None),
            2,
        )
        frames.append(
            pd.DataFrame(
                {
                    "month": months.strftime("%Y-%m-01"),
                    "series": region,
                    "revenue_usd": revenue,
                    "marketing_spend_usd": marketing,
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    _save(daily_sales(), "daily_sales_demo.csv")
    _save(website_traffic(), "website_traffic_demo.csv")
    _save(energy_consumption(), "energy_consumption_demo.csv")
    _save(monthly_revenue(), "monthly_revenue_demo.csv")


if __name__ == "__main__":
    main()
