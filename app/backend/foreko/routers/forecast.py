"""Zero-shot forecast endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_registry, get_settings
from ..schemas.forecast import ForecastRequest, ForecastResponse
from ..services import csv_loader, forecaster
from ..services.model_registry import ModelRegistry
from ..settings import Settings
from ._errors import analysis_error_handler

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("", response_model=ForecastResponse)
async def forecast(
    request: ForecastRequest,
    settings: Settings = Depends(get_settings),
    registry: ModelRegistry = Depends(get_registry),
) -> ForecastResponse:
    if registry.status == "error":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model failed to load: {registry.error}",
        )
    async with analysis_error_handler():
        df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
        return await forecaster.zero_shot_forecast(
            df=df,
            request=request,
            registry=registry,
        )
