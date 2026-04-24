"""System endpoints: /health and /model-info."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import __version__
from ..deps import get_registry
from ..schemas.system import HealthInfo, ModelInfo
from ..services.model_registry import ModelRegistry

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthInfo)
def health(registry: ModelRegistry = Depends(get_registry)) -> HealthInfo:
    return HealthInfo(
        status="ok",
        model_status=registry.status,
        device=registry.device,
        version=__version__,
    )


@router.get("/model-info", response_model=ModelInfo)
def model_info(registry: ModelRegistry = Depends(get_registry)) -> ModelInfo:
    return ModelInfo(
        model_id=registry.model_id,
        model_status=registry.status,
        current_config=registry.current_config_summary,
        compile_count=registry.compile_count,
        queue_depth=registry.queue_depth,
        device=registry.device,
        error=registry.error,
    )
