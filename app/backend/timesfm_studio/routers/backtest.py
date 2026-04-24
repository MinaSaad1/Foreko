"""Walk-forward backtest router with SSE progress streaming."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..deps import get_db, get_generic_jobs, get_registry, get_settings
from ..schemas.backtest import BacktestRequest, CalibrationRequest, JobHandle, JobStatusResponse
from ..services import backtest as backtest_service
from ..services import calibration as calibration_service
from ..services.store import hash_params

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("/walk-forward", response_model=JobHandle)
async def start_walk_forward(
    request: BacktestRequest,
    jobs=Depends(get_generic_jobs),
    registry=Depends(get_registry),
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> JobHandle:
    key = hash_params(request.model_dump())
    cached = store.cache_get(request.dataset_id, "backtest", key)

    job = jobs.create("backtest")
    if cached:
        await jobs.finish(job, cached["result"])
        return JobHandle(job_id=job.job_id, kind="backtest", status="done")

    async def _run():
        try:
            async def progress(current, total, stage):
                await jobs.emit_progress(job, current=current, total=total, stage=stage)

            result = await backtest_service.run_walk_forward(
                dataset_id=request.dataset_id,
                mapping=request.mapping,
                horizon=request.horizon,
                folds=request.folds,
                models=request.models,
                datasets_dir=settings.datasets_dir,
                registry=registry,
                progress_cb=progress,
                stop_event=job.stop_event,
            )
            if job.stop_event.is_set():
                return
            store.cache_put(request.dataset_id, "backtest", key, result)
            await jobs.finish(job, result)
        except Exception as exc:
            logger.exception("Backtest failed")
            await jobs.fail(job, str(exc))

    asyncio.create_task(_run())
    return JobHandle(job_id=job.job_id, kind="backtest", status="running")


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str, jobs=Depends(get_generic_jobs)) -> JobStatusResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return JobStatusResponse(
        job_id=job.job_id,
        kind=job.kind,
        status=job.status,
        progress=job.progress,
        result=job.result,
        error=job.error,
    )


@router.get("/jobs/{job_id}/events")
async def stream_events(job_id: str, jobs=Depends(get_generic_jobs)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")

    async def gen():
        # Emit current state first
        yield f"data: {json.dumps({'type': 'state', 'status': job.status, 'progress': job.progress})}\n\n"
        while job.status == "running":
            try:
                evt = await asyncio.wait_for(job._queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                yield "data: {\"type\": \"heartbeat\"}\n\n"
                continue
            yield f"data: {json.dumps(evt, default=str)}\n\n"
            if evt.get("type") in ("done", "error", "cancelled"):
                break

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, jobs=Depends(get_generic_jobs)) -> dict:
    ok = jobs.cancel(job_id)
    if not ok:
        raise HTTPException(409, "job not running")
    return {"cancelled": True}


@router.post("/calibration")
async def run_calibration(
    request: CalibrationRequest,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    key = hash_params(request.model_dump())
    cached = store.cache_get(request.dataset_id, "calibration", key)
    if cached:
        return cached["result"]
    result = await calibration_service.run_calibration(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        horizon=request.horizon,
        folds=request.folds,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )
    store.cache_put(request.dataset_id, "calibration", key, result)
    return result
