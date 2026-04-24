"""Job status schemas for background tasks."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class JobCreated(BaseModel):
    job_id: str


class JobStatus(BaseModel):
    job_id: str
    status: Literal["running", "done", "error", "cancelled"]
    error: str | None = None
    adapter_id: str | None = None
