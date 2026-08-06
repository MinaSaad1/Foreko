"""Factor analytics router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.factors import FactorAnalysisRequest, FactorAnalysisResponse
from ..services import csv_loader, factors as factors_service
from ._errors import analysis_error_handler

router = APIRouter(prefix="/factors", tags=["factors"])


@router.post("/analyze", response_model=FactorAnalysisResponse)
async def analyze_factors(
    request: FactorAnalysisRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> FactorAnalysisResponse:
    async with analysis_error_handler():
        df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
        return await factors_service.analyze_factors(
            df=df,
            request=request,
            registry=registry,
        )
