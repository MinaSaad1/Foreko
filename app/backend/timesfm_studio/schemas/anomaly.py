"""Anomaly detection request and response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping
from .forecast import ForecastConfigIn


class AnomalyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=512)
    critical_z: float = Field(default=3.0, gt=0)
    warning_z: float = Field(default=2.0, gt=0)
    forecast_config: ForecastConfigIn = Field(default_factory=ForecastConfigIn)


class ContextAnomalyRecord(BaseModel):
    date: str
    value: float
    trend: float
    residual: float
    z_score: float
    severity: Literal["CRITICAL", "WARNING", "NORMAL"]


class ForecastAnomalyRecord(BaseModel):
    date: str
    forecast: float
    q10: float
    q20: float
    q80: float
    q90: float
    severity: Literal["CRITICAL", "WARNING", "NORMAL"]


class AnomalySummary(BaseModel):
    total: int
    critical: int
    warning: int
    normal: int


class SeriesAnomalyResult(BaseModel):
    series_id: str
    res_std: float
    context_summary: AnomalySummary
    forecast_summary: AnomalySummary
    context_records: list[ContextAnomalyRecord]
    forecast_records: list[ForecastAnomalyRecord]


class AnomalyResponse(BaseModel):
    results: list[SeriesAnomalyResult]
