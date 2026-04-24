"""Model comparison router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.comparison import ComparisonRequest, ComparisonResponse
from ..services import comparison as comparison_service

router = APIRouter(prefix="/comparison", tags=["comparison"])


@router.post("/run", response_model=ComparisonResponse)
async def run_comparison(
    request: ComparisonRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> ComparisonResponse:
    return await comparison_service.run_comparison(
        request=request,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )
