"""System-level schemas: health, model info, device."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DeviceInfo(BaseModel):
    """Describes the compute device the model runs on."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["cuda", "cpu"]
    name: str = Field(description="Human-readable device name.")
    memory_total_mb: int | None = None
    memory_free_mb: int | None = None


ModelStatus = Literal["loading", "ready", "error"]


class HealthInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    model_status: ModelStatus
    device: DeviceInfo
    version: str


class ForecastConfigSummary(BaseModel):
    """Snapshot of the currently compiled ForecastConfig."""

    model_config = ConfigDict(extra="forbid")

    max_context: int
    max_horizon: int
    normalize_inputs: bool
    use_continuous_quantile_head: bool
    force_flip_invariance: bool
    infer_is_positive: bool
    fix_quantile_crossing: bool
    return_backcast: bool


class ModelInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str
    model_status: ModelStatus
    current_config: ForecastConfigSummary | None = None
    compile_count: int = 0
    queue_depth: int = 0
    device: DeviceInfo
    error: str | None = None
