"""In-process job manager for background fine-tuning tasks.

Job metadata is persisted to disk so completed jobs survive server restarts.
The SSE queue is in-memory only -- reconnecting to an old job's event stream
is not supported, but the final status is always readable.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


@dataclass
class JobRecord:
    job_id: str
    status: Literal["running", "done", "error", "cancelled"] = "running"
    stop_event: threading.Event = field(default_factory=threading.Event)
    adapter_id: str | None = None
    error: str | None = None
    created_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    _queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    @property
    def queue(self) -> asyncio.Queue:
        return self._queue


class JobManager:
    """Tracks active and completed fine-tuning jobs with disk-backed persistence."""

    def __init__(self, jobs_dir: Path) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._jobs_dir = jobs_dir
        self._jobs_dir.mkdir(parents=True, exist_ok=True)
        self._load_existing()

    def _load_existing(self) -> None:
        """Reload persisted job records on startup. Mark orphaned running jobs as errored."""
        for jf in self._jobs_dir.glob("*.json"):
            try:
                data = json.loads(jf.read_text(encoding="utf-8"))
                record = JobRecord(
                    job_id=data["job_id"],
                    status=data.get("status", "error"),
                    adapter_id=data.get("adapter_id"),
                    error=data.get("error"),
                    created_at=data.get("created_at", ""),
                )
                if record.status == "running":
                    record.status = "error"
                    record.error = "Server restarted"
                    self._persist(record)
                self._jobs[record.job_id] = record
            except Exception:
                pass

    def _persist(self, record: JobRecord) -> None:
        """Write job metadata to disk."""
        try:
            path = self._jobs_dir / f"{record.job_id}.json"
            path.write_text(
                json.dumps({
                    "job_id": record.job_id,
                    "status": record.status,
                    "adapter_id": record.adapter_id,
                    "error": record.error,
                    "created_at": record.created_at,
                }),
                encoding="utf-8",
            )
        except Exception:
            pass

    def create_job(self) -> JobRecord:
        record = JobRecord(job_id=str(uuid.uuid4()))
        self._jobs[record.job_id] = record
        self._persist(record)
        return record

    def get_job(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        record = self._jobs.get(job_id)
        if record is None:
            return False
        record.stop_event.set()
        if record.status == "running":
            record.status = "cancelled"
            self._persist(record)
        return True

    def complete_job(self, job_id: str, *, adapter_id: str, best_val_loss: float | None = None) -> None:
        record = self._jobs.get(job_id)
        if record is None:
            return
        record.status = "done"
        record.adapter_id = adapter_id
        self._persist(record)

    def fail_job(self, job_id: str, error: str) -> None:
        record = self._jobs.get(job_id)
        if record is None:
            return
        record.status = "error"
        record.error = error
        self._persist(record)

    def list_jobs(self) -> list[JobRecord]:
        return list(self._jobs.values())
