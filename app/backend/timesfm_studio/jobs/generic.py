"""Generalized long-running job abstraction used by walk-forward backtest,
permutation importance, scheduled refreshes, and narrative streaming.

Unlike :class:`jobs.manager.JobManager` which is finetune-specific, this is a
pure in-memory registry with an async queue per job for SSE streaming of
progress events. Results are stored in memory and optionally mirrored to the
SQLite `analyses` cache by the caller.
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal


JobStatus = Literal["running", "done", "error", "cancelled"]


@dataclass
class GenericJob:
    job_id: str
    kind: str
    status: JobStatus = "running"
    progress: dict[str, Any] = field(default_factory=lambda: {"current": 0, "total": 0, "stage": "queued"})
    result: dict[str, Any] | None = None
    error: str | None = None
    stop_event: threading.Event = field(default_factory=threading.Event)
    created_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    _queue: asyncio.Queue = field(default_factory=asyncio.Queue)


class GenericJobManager:
    """In-memory registry of long-running jobs."""

    def __init__(self) -> None:
        self._jobs: dict[str, GenericJob] = {}
        self._lock = threading.Lock()

    def create(self, kind: str) -> GenericJob:
        job_id = uuid.uuid4().hex
        job = GenericJob(job_id=job_id, kind=kind)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> GenericJob | None:
        return self._jobs.get(job_id)

    def list(self) -> list[GenericJob]:
        return list(self._jobs.values())

    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if not job or job.status != "running":
            return False
        job.stop_event.set()
        job.status = "cancelled"
        try:
            job._queue.put_nowait({"type": "cancelled"})
        except Exception:
            pass
        return True

    async def emit_progress(self, job: GenericJob, *, current: int, total: int, stage: str) -> None:
        job.progress = {"current": current, "total": total, "stage": stage}
        await job._queue.put({"type": "progress", "progress": job.progress})

    async def finish(self, job: GenericJob, result: dict[str, Any]) -> None:
        job.status = "done"
        job.result = result
        await job._queue.put({"type": "done", "result": result})

    async def fail(self, job: GenericJob, error: str) -> None:
        job.status = "error"
        job.error = error
        await job._queue.put({"type": "error", "error": error})


_singleton: GenericJobManager | None = None


def get_job_manager() -> GenericJobManager:
    global _singleton
    if _singleton is None:
        _singleton = GenericJobManager()
    return _singleton
