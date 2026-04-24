"""Comparison request and response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping
from .forecast import ForecastConfigIn


class FeatureImportanceItem(BaseModel):
    model_config = ConfigDict(frozen=True)

    category: str
    weight: float


class ModelResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: Literal["global_model", "your_model"]
    display_name: str
    point_forecast: list[float]
    p10: list[float]
    p90: list[float]
    mape: float
    accuracy: float
    confidence: Literal["High", "Medium", "Low"]
    total_forecast: float
    feature_importance: list[FeatureImportanceItem] | None = None


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=256)
    forecast_config: ForecastConfigIn = Field(default_factory=ForecastConfigIn)


class ComparisonResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    winner: ModelResult
    alternative: ModelResult
    winner_explanation: str
    dates: list[str]
    historical_dates: list[str]
    historical_values: list[float]
    backtest_holdout: int
