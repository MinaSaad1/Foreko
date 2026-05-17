"""LightGBM baseline forecasting service.

Trains a fresh LGBMRegressor on each dataset using lag and rolling
features, then forecasts recursively one step at a time.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_LAG_WINDOWS = [1, 7, 14, 28, 30, 90, 365]
_ROLL_WINDOWS = [7, 14, 30]

# Maps raw LightGBM feature name prefixes to business-friendly categories
_FEATURE_CATEGORIES: list[tuple[str, str]] = [
    ("lag_", "Recent trend"),
    ("roll_mean_7", "Weekly pattern"),
    ("roll_mean_14", "Weekly pattern"),
    ("roll_mean_30", "Monthly trend"),
    ("roll_mean_90", "Monthly trend"),
    ("roll_std_", "Variability"),
    ("roll_min_", "Recent low"),
    ("roll_max_", "Recent high"),
    ("month", "Seasonality"),
    ("week", "Seasonality"),
    ("quarter", "Seasonality"),
    ("dayofweek", "Day of week pattern"),
    ("dayofyear", "Day of year pattern"),
    ("year", "Long-term trend"),
    ("day", "Daily pattern"),
]


@dataclass
class LGBMResult:
    point_forecast: np.ndarray
    feature_importance: dict[str, float]


def _make_features(
    dates: pd.DatetimeIndex,
    values: np.ndarray,
    max_lag: int,
) -> pd.DataFrame:
    """Build a feature DataFrame from a time-indexed value array."""
    df = pd.DataFrame({"y": values}, index=dates)

    df["year"] = df.index.year
    df["month"] = df.index.month
    df["day"] = df.index.day
    df["dayofweek"] = df.index.dayofweek
    df["dayofyear"] = df.index.dayofyear
    df["week"] = df.index.isocalendar().week.astype(int)
    df["quarter"] = df.index.quarter

    for lag in _LAG_WINDOWS:
        if lag < max_lag:
            df[f"lag_{lag}"] = df["y"].shift(lag)

    for w in _ROLL_WINDOWS:
        if w < max_lag:
            df[f"roll_mean_{w}"] = df["y"].shift(1).rolling(w).mean()
            df[f"roll_std_{w}"] = df["y"].shift(1).rolling(w).std()
            df[f"roll_min_{w}"] = df["y"].shift(1).rolling(w).min()
            df[f"roll_max_{w}"] = df["y"].shift(1).rolling(w).max()

    return df


def _map_feature_to_category(name: str) -> str:
    for prefix, category in _FEATURE_CATEGORIES:
        if name.startswith(prefix):
            return category
    return "Other"


def _aggregate_importance(
    names: list[str],
    scores: np.ndarray,
) -> dict[str, float]:
    """Aggregate raw feature importances into business categories."""
    category_totals: dict[str, float] = {}
    for name, score in zip(names, scores):
        cat = _map_feature_to_category(name)
        category_totals[cat] = category_totals.get(cat, 0.0) + float(score)

    total = sum(category_totals.values()) or 1.0
    return {cat: round(v / total, 4) for cat, v in category_totals.items()}


def fit_and_forecast(
    dates: pd.DatetimeIndex,
    values: np.ndarray,
    future_dates: pd.DatetimeIndex,
    horizon: int,
) -> LGBMResult:
    """Train LightGBM on (dates, values) and recursively forecast horizon steps.

    Requires lightgbm to be installed. The caller is responsible for
    ensuring the dependency is present.
    """
    try:
        import lightgbm as lgb
    except ImportError as exc:
        raise RuntimeError(
            "lightgbm is not installed. Run: pip install lightgbm"
        ) from exc

    n = len(values)
    df_train = _make_features(dates, values, max_lag=n)
    df_train = df_train.dropna()

    feature_cols = [c for c in df_train.columns if c != "y"]
    X_train = df_train[feature_cols].values
    y_train = df_train["y"].values

    model = lgb.LGBMRegressor(
        n_estimators=500,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=20,
        verbose=-1,
    )
    model.fit(X_train, y_train)

    importances = _aggregate_importance(
        feature_cols,
        model.feature_importances_,
    )

    # Recursive forecasting: extend the history one step at a time
    history_dates = list(dates)
    history_values = list(values)
    predictions: list[float] = []

    for step_date in future_dates:
        step_df = _make_features(
            pd.DatetimeIndex(history_dates),
            np.array(history_values),
            max_lag=len(history_values),
        )
        step_df = step_df.dropna()

        # Build a single-row feature vector for the next step
        next_row_df = pd.DataFrame(
            {
                "year": [step_date.year],
                "month": [step_date.month],
                "day": [step_date.day],
                "dayofweek": [step_date.dayofweek],
                "dayofyear": [step_date.dayofyear],
                "week": [step_date.isocalendar()[1]],
                "quarter": [step_date.quarter],
            }
        )

        # Add lag and rolling features from current history
        for lag in _LAG_WINDOWS:
            col = f"lag_{lag}"
            if col in feature_cols:
                idx = len(history_values) - lag
                next_row_df[col] = history_values[idx] if idx >= 0 else np.nan

        for w in _ROLL_WINDOWS:
            for stat in ("mean", "std", "min", "max"):
                col = f"roll_{stat}_{w}"
                if col in feature_cols:
                    window = history_values[-w:] if len(history_values) >= w else history_values
                    arr = np.array(window, dtype=float)
                    if stat == "mean":
                        val = float(arr.mean())
                    elif stat == "std":
                        val = float(arr.std())
                    elif stat == "min":
                        val = float(arr.min())
                    else:
                        val = float(arr.max())
                    next_row_df[col] = val

        # Align columns to training feature order
        for col in feature_cols:
            if col not in next_row_df.columns:
                next_row_df[col] = np.nan

        pred = float(model.predict(next_row_df[feature_cols].values)[0])
        predictions.append(pred)

        history_dates.append(step_date)
        history_values.append(pred)

    logger.info("LightGBM trained on %d points, forecasted %d steps.", n, horizon)

    return LGBMResult(
        point_forecast=np.array(predictions),
        feature_importance=importances,
    )
