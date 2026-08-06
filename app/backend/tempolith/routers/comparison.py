"""Model comparison router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.comparison import ComparisonRequest, ComparisonResponse
from ..services import comparison as comparison_service, csv_loader
from ._errors import analysis_error_handler

router = APIRouter(prefix="/comparison", tags=["comparison"])


@router.post("/run", response_model=ComparisonResponse)
async def run_comparison(
    request: ComparisonRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> ComparisonResponse:
    async with analysis_error_handler():
        df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
        return await comparison_service.run_comparison(
            df=df,
            request=request,
            registry=registry,
        )
