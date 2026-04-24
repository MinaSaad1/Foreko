"""Covariate-augmented forecast router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.covariates import CovariateForecastRequest
from ..schemas.forecast import ForecastResponse
from ..services import forecaster

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/covariates", response_model=ForecastResponse)
async def forecast_covariates(
    request: CovariateForecastRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> ForecastResponse:
    return await forecaster.with_covariates_forecast(
        request=request,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )
