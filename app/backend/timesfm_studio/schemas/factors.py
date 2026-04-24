"""Factor (covariate) analytics schemas.

These schemas back the `/api/factors/analyze` endpoint, which runs a side-by-side
comparison of forecast-with-factors vs forecast-without-factors and returns
descriptive statistics plus per-factor influence scores.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping
from .forecast import ForecastConfigIn


class FactorStat(BaseModel):
    """Descriptive + statistical summary for one factor."""

    model_config = ConfigDict(frozen=True)

    name: str
    kind: Literal["numeric", "categorical"]

    # Descriptive stats (numeric only; None for categorical)
    mean: float | None = None
    std: float | None = None
    min_value: float | None = None
    max_value: float | None = None
    last_value: float | None = None

    # Categorical-only descriptors
    unique_count: int | None = None
    top_category: str | None = None

    # Relationship with the target
    correlation: float = 0.0  # signed Pearson r
    elasticity: float | None = None  # linreg slope of target on factor
    influence: float = 0.0  # normalized |correlation| across selected factors


class FactorImpact(BaseModel):
    """Aggregate impact of factors on the forecast."""

    model_config = ConfigDict(frozen=True)

    total_baseline: float
    total_with_factors: float
    delta_absolute: float
    delta_percent: float
    top_driver: str | None = None
    direction: Literal["up", "down", "flat"]


class FactorAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=256)
    numeric_factors: list[str] = Field(default_factory=list)
    categorical_factors: list[str] = Field(default_factory=list)
    xreg_mode: Literal["additive", "multiplicative"] = "additive"
    forecast_config: ForecastConfigIn = Field(default_factory=ForecastConfigIn)


class FactorAnalysisResponse(BaseModel):
    """Everything the factors page needs to render its insights in one payload."""

    factors: list[FactorStat]
    impact: FactorImpact

    historical_dates: list[str]
    historical_values: list[float]
    forecast_dates: list[str]

    baseline_forecast: list[float]
    baseline_p10: list[float]
    baseline_p90: list[float]

    factors_forecast: list[float]
    factors_p10: list[float]
    factors_p90: list[float]
