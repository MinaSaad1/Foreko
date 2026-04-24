"""Fine-tuning request, response, and adapter metadata schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping
from .jobs import JobCreated, JobStatus  # re-export

__all__ = ["FinetuneConfig", "FinetuneRequest", "AdapterMetadata", "AdapterForecastRequest", "JobCreated", "JobStatus"]


class FinetuneConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    epochs: int = Field(default=5, ge=1, le=100)
    batch_size: int = Field(default=32, ge=1, le=256)
    lr: float = Field(default=1e-4, gt=0)
    context_len: int = Field(default=64, ge=32, le=512)
    horizon_len: int = Field(default=13, ge=1, le=512)
    lora_r: int = Field(default=4, ge=1, le=64)
    lora_alpha: int = Field(default=8, ge=1)
    lora_dropout: float = Field(default=0.05, ge=0.0, le=0.5)
    num_samples: int = Field(default=2000, ge=10, le=50000)
    seed: int = 42


class FinetuneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    mapping: ColumnMapping
    config: FinetuneConfig = Field(default_factory=FinetuneConfig)
    adapter_name: str = ""


class AdapterMetadata(BaseModel):
    adapter_id: str
    name: str
    created_at: str
    dataset_id: str
    best_val_loss: float | None = None
    config: FinetuneConfig


class AdapterForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapter_id: str
    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=512)
    context_len: int = Field(default=512, ge=32, le=512)
