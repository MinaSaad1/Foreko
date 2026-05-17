"""Covariate-augmented forecast router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.covariates import CovariateForecastRequest
from ..schemas.forecast import ForecastResponse
from ..services import csv_loader, forecaster
from ._errors import analysis_error_handler

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/covariates", response_model=ForecastResponse)
async def forecast_covariates(
    request: CovariateForecastRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> ForecastResponse:
    async with analysis_error_handler():
        df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
        return await forecaster.with_covariates_forecast(
            df=df,
            request=request,
            registry=registry,
        )
