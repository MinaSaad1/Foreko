"""Adapter management and adapter-based forecast router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_registry, get_settings
from ..schemas.finetune import AdapterForecastRequest, AdapterMetadata
from ..schemas.forecast import ForecastResponse
from ..services import adapter_store, forecaster

router = APIRouter(prefix="/adapters", tags=["adapters"])


@router.get("", response_model=list[AdapterMetadata])
async def list_adapters(
    settings=Depends(get_settings),
) -> list[AdapterMetadata]:
    return adapter_store.list_adapters(settings.adapters_dir)


@router.get("/{adapter_id}", response_model=AdapterMetadata)
async def get_adapter(
    adapter_id: str,
    settings=Depends(get_settings),
) -> AdapterMetadata:
    meta = adapter_store.get_adapter(adapter_id, settings.adapters_dir)
    if meta is None:
        raise HTTPException(status_code=404, detail="Adapter not found")
    return meta


@router.delete("/{adapter_id}")
async def delete_adapter(
    adapter_id: str,
    settings=Depends(get_settings),
) -> dict[str, str]:
    if not adapter_store.delete_adapter(adapter_id, settings.adapters_dir):
        raise HTTPException(status_code=404, detail="Adapter not found")
    return {"deleted": adapter_id}


@router.post("/forecast", response_model=ForecastResponse)
async def adapter_forecast(
    request: AdapterForecastRequest,
    settings=Depends(get_settings),
    registry=Depends(get_registry),
) -> ForecastResponse:
    adapter_path = adapter_store.get_adapter_path(request.adapter_id, settings.adapters_dir)
    if adapter_path is None:
        raise HTTPException(status_code=404, detail="Adapter not found")
    return await forecaster.with_adapter_forecast(
        request=request,
        adapter_path=adapter_path,
        datasets_dir=settings.datasets_dir,
        device_info=registry.device,
    )
