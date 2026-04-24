"""Fine-tuning job management router."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from ..deps import get_job_manager, get_registry, get_settings
from ..jobs.sse import event_stream
from ..schemas.finetune import FinetuneRequest
from ..schemas.jobs import JobCreated, JobStatus
from ..services import finetune as finetune_service

router = APIRouter(prefix="/finetune", tags=["finetune"])


@router.post("/start", response_model=JobCreated)
async def start_finetune(
    request: FinetuneRequest,
    job_mgr=Depends(get_job_manager),
    settings=Depends(get_settings),
    registry=Depends(get_registry),
) -> JobCreated:
    record = job_mgr.create_job()

    async def _run() -> None:
        try:
            adapter_id = await finetune_service.start_finetune(
                request=request,
                datasets_dir=settings.datasets_dir,
                adapters_dir=settings.adapters_dir,
                device_info=registry.device,
                queue=record.queue,
                stop_event=record.stop_event,
            )
            job_mgr.complete_job(record.job_id, adapter_id=adapter_id)
        except Exception as exc:
            job_mgr.fail_job(record.job_id, str(exc))

    asyncio.create_task(_run())
    return JobCreated(job_id=record.job_id)


@router.get("/jobs/{job_id}/events")
async def job_events(
    job_id: str,
    job_mgr=Depends(get_job_manager),
) -> EventSourceResponse:
    record = job_mgr.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return EventSourceResponse(event_stream(record.queue))


@router.post("/jobs/{job_id}/cancel", response_model=JobStatus)
async def cancel_job(
    job_id: str,
    job_mgr=Depends(get_job_manager),
) -> JobStatus:
    if not job_mgr.cancel_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    record = job_mgr.get_job(job_id)
    assert record is not None
    return JobStatus(job_id=job_id, status=record.status)


@router.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(
    job_id: str,
    job_mgr=Depends(get_job_manager),
) -> JobStatus:
    record = job_mgr.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatus(
        job_id=job_id,
        status=record.status,
        error=record.error,
        adapter_id=record.adapter_id,
    )
