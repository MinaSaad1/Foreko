"""Anomaly detection router."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_registry, get_settings
from ..schemas.anomaly import AnomalyRequest, AnomalyResponse
from ..services import anomaly as anomaly_service

router = APIRouter(prefix="/anomaly", tags=["anomaly"])


@router.post("/detect", response_model=AnomalyResponse)
async def detect(
    request: AnomalyRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> AnomalyResponse:
    return await anomaly_service.detect_anomalies(
        request=request,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )
