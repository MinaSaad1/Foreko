"""Generate deterministic synthetic sample CSVs for the frontend samples picker.

Run from the repo root:

    uv run python scripts/generate_samples.py

Writes three CSVs into app/frontend/public/samples/. The shipped retail sample
(daily_sales_demo.csv) is left untouched.
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


def website_traffic() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    dates = pd.date_range("2023-01-01", periods=730, freq="D")
    day_of_week = np.array([d.weekday() for d in dates])
    weekend_dip = np.where(day_of_week >= 5, 0.65, 1.0)
    month_of_year = np.array([d.month for d in dates])
    seasonal = 1.0 + 0.15 * np.sin(2 * np.pi * (month_of_year - 3) / 12)
    trend = np.linspace(1.0, 1.35, len(dates))
    base = 4200.0 * trend * seasonal * weekend_dip
    noise = rng.normal(0, 180, len(dates))
    sessions = np.clip(base + noise, 0, None).round().astype(int)

    promo_day = 200
    sessions[promo_day] = int(sessions[promo_day] * 2.1)
    sessions[promo_day + 1] = int(sessions[promo_day + 1] * 1.5)

    referrer_share = np.clip(0.3 + 0.05 * np.sin(np.arange(len(dates)) / 30) + rng.normal(0, 0.03, len(dates)), 0.1, 0.55)
    return pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d"),
            "sessions": sessions,
            "organic_share": np.round(referrer_share, 3),
        }
    )


def energy_consumption() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    timestamps = pd.date_range("2025-01-01 00:00", periods=24 * 90, freq="h")
    hour = np.array([t.hour for t in timestamps])
    day_of_week = np.array([t.weekday() for t in timestamps])

    daily_cycle = 1.0 + 0.35 * np.sin(2 * np.pi * (hour - 7) / 24)
    weekly_cycle = np.where(day_of_week >= 5, 0.8, 1.0)
    temperature_f = 42 + 12 * np.sin(2 * np.pi * np.arange(len(timestamps)) / (24 * 30)) + rng.normal(0, 2.5, len(timestamps))
    temp_effect = 1.0 + 0.008 * np.abs(temperature_f - 65)

    base_kwh = 120.0 * daily_cycle * weekly_cycle * temp_effect
    noise = rng.normal(0, 6, len(timestamps))
    kwh = np.clip(base_kwh + noise, 0, None).round(2)

    return pd.DataFrame(
        {
            "timestamp": timestamps.strftime("%Y-%m-%d %H:%M"),
            "kwh": kwh,
            "temperature_f": np.round(temperature_f, 1),
        }
    )


def monthly_revenue() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    months = pd.date_range("2020-01-01", periods=72, freq="MS")
    idx = np.arange(len(months))
    trend = 180_000 + 3_200 * idx
    month_num = np.array([d.month for d in months])
    annual = 1.0 + 0.18 * np.sin(2 * np.pi * (month_num - 4) / 12)
    noise = rng.normal(0, 6_500, len(months))
    revenue = np.round(trend * annual + noise, 2)

    marketing_spend = np.round(np.clip(18_000 + 600 * idx + rng.normal(0, 1_200, len(months)), 0, None), 2)
    return pd.DataFrame(
        {
            "month": months.strftime("%Y-%m-01"),
            "revenue_usd": revenue,
            "marketing_spend_usd": marketing_spend,
        }
    )


def main() -> None:
    _save(website_traffic(), "website_traffic_demo.csv")
    _save(energy_consumption(), "energy_consumption_demo.csv")
    _save(monthly_revenue(), "monthly_revenue_demo.csv")


if __name__ == "__main__":
    main()
