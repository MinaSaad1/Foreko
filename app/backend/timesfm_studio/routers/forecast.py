"""Zero-shot forecast endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_registry, get_settings
from ..schemas.forecast import ForecastRequest, ForecastResponse
from ..services import forecaster
from ..services.model_registry import ModelRegistry
from ..settings import Settings

logger = logging.getLogger(__name__)

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
    try:
        return await forecaster.zero_shot_forecast(
            request=request,
            datasets_dir=settings.datasets_dir,
            registry=registry,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Forecast failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecast failed: {exc}",
        ) from exc
