"""Schemas for walk-forward backtest + calibration."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping


class BacktestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=256)
    folds: int = Field(default=3, ge=1, le=10)
    models: list[str] = Field(default_factory=lambda: ["timesfm", "lightgbm"])


class CalibrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=256)
    folds: int = Field(default=3, ge=1, le=10)


class JobHandle(BaseModel):
    job_id: str
    kind: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    kind: str
    status: str
    progress: dict
    result: dict | None = None
    error: str | None = None
