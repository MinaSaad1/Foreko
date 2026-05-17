"""Covariate-augmented forecast schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping
from .forecast import ForecastConfigIn


class CovariateConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dynamic_numerical: list[str] = Field(default_factory=list)
    dynamic_categorical: list[str] = Field(default_factory=list)
    static_numerical: list[str] = Field(default_factory=list)
    static_categorical: list[str] = Field(default_factory=list)
    xreg_mode: Literal["additive", "multiplicative"] = "additive"


class CovariateForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    covariate_config: CovariateConfig
    forecast_config: ForecastConfigIn = Field(default_factory=ForecastConfigIn)
    horizon: int = Field(default=12, ge=1, le=512)
    future_dataset_id: str | None = None
    future_mapping: ColumnMapping | None = None


class CovariateForecastResponse(BaseModel):
    horizon: int
    series: list  # list of SeriesForecast (same as zero-shot)
    compile_config_hash: str
    xreg_mode: str
