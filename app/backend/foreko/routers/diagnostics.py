"""Diagnostics + preflight + analyses cache routers."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_db, get_registry, get_settings
from ..schemas.diagnostics import DiagnosticsRequest, PreflightRequest
from ..services import diagnostics as diagnostics_service
from ..services import preflight as preflight_service

diagnostics_router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])
preflight_router = APIRouter(prefix="/preflight", tags=["preflight"])
analyses_router = APIRouter(prefix="/analyses", tags=["analyses"])


@diagnostics_router.post("/run")
async def run_diagnostics(
    request: DiagnosticsRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    _key, cached = store.cache_lookup(request.dataset_id, "diagnostics", request)
    if cached is not None:
        return cached
    result = await diagnostics_service.run_diagnostics(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        horizon=request.horizon,
        model=request.model,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )
    store.cache_put(request.dataset_id, "diagnostics", _key, result)
    return result


@preflight_router.post("/run")
async def run_preflight(
    request: PreflightRequest,
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    _key, cached = store.cache_lookup(request.dataset_id, "preflight", request)
    if cached is not None:
        return cached
    result = await preflight_service.run_preflight(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        datasets_dir=settings.datasets_dir,
    )
    store.cache_put(request.dataset_id, "preflight", _key, result)
    return result


@analyses_router.get("")
async def list_analyses(dataset_id: str, store=Depends(get_db)) -> list[dict]:
    return store.analyses_list(dataset_id)


@analyses_router.get("/{analysis_id}")
async def get_analysis(analysis_id: str, store=Depends(get_db)) -> dict:
    result = store.analyses_get(analysis_id)
    if not result:
        raise HTTPException(404, "analysis not found")
    return result


@analyses_router.delete("/{analysis_id}")
async def delete_analysis(analysis_id: str, store=Depends(get_db)) -> dict:
    ok = store.analyses_delete(analysis_id)
    if not ok:
        raise HTTPException(404, "analysis not found")
    return {"deleted": True}
