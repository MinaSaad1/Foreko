"""Anomaly detection router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.anomaly import AnomalyRequest, AnomalyResponse
from ..services import anomaly as anomaly_service, csv_loader
from ._errors import analysis_error_handler

router = APIRouter(prefix="/anomaly", tags=["anomaly"])


@router.post("/detect", response_model=AnomalyResponse)
async def detect(
    request: AnomalyRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> AnomalyResponse:
    async with analysis_error_handler():
        df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
        return await anomaly_service.detect_anomalies(
            df=df,
            request=request,
            registry=registry,
        )
