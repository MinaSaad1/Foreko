"""Async project stage jobs: Prepare, and later Validate, Forecast, Scenario.

Follows the existing GenericJobManager and SSE contract so interactive runs and
any future scheduled runs share one progress and failure shape.
"""

from __future__ import annotations

import asyncio
import json
import logging

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..deps import get_generic_jobs, get_project_db, get_settings
from ..schemas.project import ProjectRunCreate
from ..services import csv_loader, preparation, project_artifacts
from ..services.project_store import ProjectStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["project-jobs"])
jobs_router = APIRouter(prefix="/project-jobs", tags=["project-jobs"])


@router.post("/{project_id}/prepare", status_code=202)
async def start_prepare(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
    jobs=Depends(get_generic_jobs),
    settings=Depends(get_settings),
) -> dict:
    """Apply the current revision's recipe and write a derived artifact.

    The source dataset is never modified. The artifact is written to a temp path
    and renamed only after it validates, so a failed recipe leaves the previous
    prepared artifact in place.
    """
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(
            409, "Configure the project before preparing it: no revision exists yet."
        )

    config = project.config
    job = jobs.create("project-prepare")
    run = store.create_run(
        ProjectRunCreate(
            project_id=project_id,
            revision_no=project.current_revision,
            stage="prepare",
            job_id=job.job_id,
        )
    )
    store.start_run(run.id)

    async def _run() -> None:
        try:
            await jobs.emit_progress(job, current=1, total=4, stage="load")
            df = csv_loader.load_dataset(project.dataset_id, settings.datasets_dir)
            ids, values, dates = csv_loader.extract_series(df, config.mapping)
            if not ids:
                raise ValueError("The dataset has no series after mapping.")

            await jobs.emit_progress(job, current=2, total=4, stage="transform")
            prepared_values: dict[str, list[float]] = {}
            offsets: dict[str, int] = {}
            notes: list[str] = []
            failures: list[dict[str, str]] = []

            for series_id, series_values, series_dates in zip(ids, values, dates):
                if job.stop_event.is_set():
                    return
                try:
                    prepared = preparation.prepare_series(
                        np.asarray(series_values, dtype=float),
                        list(config.preparation_steps),
                        dates=series_dates,
                    )
                except preparation.PreparationError as exc:
                    # Name the series. A recipe that is invalid for one series
                    # is the single most common preparation failure, and the
                    # user cannot act on "log failed" alone.
                    failures.append({"series_id": series_id, "reason": str(exc)})
                    continue
                prepared_values[series_id] = [float(v) for v in prepared.values]
                offsets[series_id] = prepared.history_offset
                notes.extend(f"{series_id}: {note}" for note in prepared.notes)

            if failures and not prepared_values:
                raise ValueError(
                    "The recipe could not be applied to any series. "
                    + failures[0]["reason"]
                )

            await jobs.emit_progress(job, current=3, total=4, stage="validate")
            fingerprint = project_artifacts.recipe_hash(
                project.dataset_id,
                [s.model_dump() for s in config.preparation_steps],
            )

            await jobs.emit_progress(job, current=4, total=4, stage="persist")
            artifact = (
                project_artifacts.derived_dir(settings.storage_dir, project_id)
                / f"{fingerprint}.json"
            )
            project_artifacts.atomic_write_json(
                artifact,
                {
                    "recipe_hash": fingerprint,
                    "series": prepared_values,
                    "history_offsets": offsets,
                },
            )

            if job.stop_event.is_set():
                return

            summary = {
                "series_count": len(prepared_values),
                "row_count": sum(len(v) for v in prepared_values.values()),
                "recipe_hash": fingerprint,
                "notes": notes,
                "failures": failures,
            }
            store.finish_run(run.id, str(artifact), summary)
            await jobs.finish(job, summary)
        except Exception as exc:  # noqa: BLE001 - reported to the user verbatim
            logger.exception("Prepare failed for project %s", project_id)
            store.fail_run(run.id, str(exc))
            await jobs.fail(job, str(exc))

    asyncio.create_task(_run())
    return {"job_id": job.job_id, "run_id": run.id, "status": "running"}


@jobs_router.get("/{job_id}")
async def get_project_job(job_id: str, jobs=Depends(get_generic_jobs)) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    return {
        "job_id": job.job_id,
        "kind": job.kind,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
    }


@jobs_router.get("/{job_id}/events")
async def stream_project_job_events(job_id: str, jobs=Depends(get_generic_jobs)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")

    async def gen():
        yield f"data: {json.dumps({'type': 'state', 'status': job.status, 'progress': job.progress})}\n\n"
        if job.status == "done":
            yield f"data: {json.dumps({'type': 'done', 'result': job.result}, default=str)}\n\n"
            return
        if job.status == "error":
            yield f"data: {json.dumps({'type': 'error', 'error': job.error or 'Job failed'})}\n\n"
            return
        if job.status == "cancelled":
            yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
            return
        while job.status == "running":
            try:
                evt = await asyncio.wait_for(job._queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                yield 'data: {"type": "heartbeat"}\n\n'
                continue
            yield f"data: {json.dumps(evt, default=str)}\n\n"
            if evt.get("type") in ("done", "error", "cancelled"):
                break

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@jobs_router.post("/{job_id}/cancel")
async def cancel_project_job(job_id: str, jobs=Depends(get_generic_jobs)) -> dict:
    if not jobs.cancel(job_id):
        raise HTTPException(409, "Job is not running.")
    return {"job_id": job_id, "status": "cancelled"}
