"""Factor analytics router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.factors import FactorAnalysisRequest, FactorAnalysisResponse
from ..services import factors as factors_service

router = APIRouter(prefix="/factors", tags=["factors"])


@router.post("/analyze", response_model=FactorAnalysisResponse)
async def analyze_factors(
    request: FactorAnalysisRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> FactorAnalysisResponse:
    return await factors_service.analyze_factors(
        request=request,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )
