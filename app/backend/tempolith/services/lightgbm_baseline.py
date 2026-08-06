"""LightGBM baseline forecasting service.

Trains LGBMRegressor models on each dataset using lag and rolling features,
then forecasts recursively one step at a time. Produces a point forecast
plus P10 and P90 quantile forecasts via separate quantile-regression models
(LightGBM `objective='quantile'`).
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
    # 80% prediction interval bounds, same length as point_forecast. Both are
    # produced by separate LightGBM quantile-regression models so the chart can
    # render an honest uncertainty band, not a degenerate P10=P50=P90 line.
    p10_forecast: np.ndarray
    p90_forecast: np.ndarray


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


def _build_next_row_features(
    step_date: pd.Timestamp,
    history_values: list[float],
    feature_cols: list[str],
) -> np.ndarray:
    """Build a single-row feature vector aligned to the model's training schema."""
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

    for col in feature_cols:
        if col not in next_row_df.columns:
            next_row_df[col] = np.nan

    arr = np.asarray(next_row_df[feature_cols].to_numpy(), dtype=float)
    return arr  # type: ignore[return-value]


def fit_and_forecast(
    dates: pd.DatetimeIndex,
    values: np.ndarray,
    future_dates: pd.DatetimeIndex,
    horizon: int,
) -> LGBMResult:
    """Train LightGBM on (dates, values) and recursively forecast horizon steps.

    Trains three LGBMRegressor models on the same feature set:
      * a default (mean-squared-error) point regressor used for recursive forecasting
      * a quantile regressor at alpha=0.1 for the lower band (P10)
      * a quantile regressor at alpha=0.9 for the upper band (P90)

    The point model drives the recursion (its predictions become the next-step
    lag inputs). At each step the quantile models also predict using the same
    feature vector, producing a per-step P10/P90 band.
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

    common_params = dict(
        n_estimators=500,
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=20,
        verbose=-1,
    )

    point_model = lgb.LGBMRegressor(**common_params)
    point_model.fit(X_train, y_train)

    # Quantile regressors. Note: LightGBM tends to under-cover with very low
    # n_estimators on quantile loss; the same n_estimators here is fine since
    # we cap horizons modestly.
    p10_model = lgb.LGBMRegressor(objective="quantile", alpha=0.1, **common_params)
    p10_model.fit(X_train, y_train)

    p90_model = lgb.LGBMRegressor(objective="quantile", alpha=0.9, **common_params)
    p90_model.fit(X_train, y_train)

    importances = _aggregate_importance(
        feature_cols,
        point_model.feature_importances_,
    )

    # Recursive forecasting: extend the history one step at a time using the
    # POINT model. At each step, also predict P10 and P90 from the quantile
    # models using the same feature vector.
    history_dates = list(dates)
    history_values = list(values)
    point_predictions: list[float] = []
    p10_predictions: list[float] = []
    p90_predictions: list[float] = []

    for step_date in future_dates:
        next_row = _build_next_row_features(step_date, history_values, feature_cols)

        point_pred = float(point_model.predict(next_row)[0])
        p10_pred = float(p10_model.predict(next_row)[0])
        p90_pred = float(p90_model.predict(next_row)[0])

        # Guard against quantile-crossing (LightGBM's independent quantile fits
        # can occasionally produce p10 > p90). Sort and widen the tighter side
        # using the point estimate as the anchor.
        if p10_pred > p90_pred:
            p10_pred, p90_pred = p90_pred, p10_pred
        # Quantiles must bracket the point forecast for sane interpretation.
        p10_pred = min(p10_pred, point_pred)
        p90_pred = max(p90_pred, point_pred)

        point_predictions.append(point_pred)
        p10_predictions.append(p10_pred)
        p90_predictions.append(p90_pred)

        history_dates.append(step_date)
        history_values.append(point_pred)

    logger.info(
        "LightGBM trained (point + P10 + P90) on %d points, forecasted %d steps.",
        n,
        horizon,
    )

    return LGBMResult(
        point_forecast=np.array(point_predictions),
        feature_importance=importances,
        p10_forecast=np.array(p10_predictions),
        p90_forecast=np.array(p90_predictions),
    )
