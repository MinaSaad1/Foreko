"""Schemas for forecast diagnostics."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping


class DiagnosticsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=256)
    model: str = Field(default="timesfm")


class PreflightRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
