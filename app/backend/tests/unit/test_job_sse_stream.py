"""The stage event stream must never lose the outcome of a run.

A user watching Validate saw "Lost connection to the run" while the run itself
completed and was recorded as done. The stream, not the run, was broken: it
stopped on the job's *status* rather than on a terminal *event*, so once the job
finished everything still queued was discarded, the ``done`` event included.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from tempolith.jobs.generic import GenericJobManager, sse_lines


def _events(frames: list[str]) -> list[dict]:
    return [json.loads(f.removeprefix("data: ").strip()) for f in frames]


async def _drain(job, **kwargs) -> list[dict]:
    return _events([frame async for frame in sse_lines(job, **kwargs)])


async def _drain_open_stream(stream) -> list[dict]:
    """Read the rest of an already-connected stream."""
    return _events([frame async for frame in stream])


@pytest.mark.unit
@pytest.mark.asyncio
async def test_queued_events_still_deliver_done_after_the_job_finishes() -> None:
    """The reproduction: connect, fall behind, then read after the finish.

    This is the shape of a real run. The client connects while the job is
    running, the job produces events faster than the stream is drained, and by
    the time the backlog is read the job has finished. Everything queued is
    still owed to the client, and the last of it is the result.
    """
    jobs = GenericJobManager()
    job = jobs.create("project-validate")

    stream = sse_lines(job)
    first = _events([await anext(stream)])
    assert first[0] == {"type": "state", "status": "running", "progress": job.progress}

    for step in range(1, 6):
        await jobs.emit_progress(job, current=step, total=5, stage=f"fold {step}/5")
    await jobs.finish(job, {"series_count": 2})

    events = await _drain_open_stream(stream)

    assert [e["type"] for e in events].count("progress") == 5
    assert events[-1]["type"] == "done"
    assert events[-1]["result"] == {"series_count": 2}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_failure_survives_a_backlog_too() -> None:
    jobs = GenericJobManager()
    job = jobs.create("project-validate")

    stream = sse_lines(job)
    await anext(stream)
    await jobs.emit_progress(job, current=1, total=5, stage="fold 1/5")
    await jobs.fail(job, "Dataset has no series after mapping.")

    events = await _drain_open_stream(stream)

    assert events[-1]["type"] == "error"
    assert events[-1]["error"] == "Dataset has no series after mapping."


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_finished_job_reports_its_outcome_to_a_late_connection() -> None:
    # Connecting after the terminal event was consumed by an earlier stream.
    jobs = GenericJobManager()
    job = jobs.create("project-validate")
    await jobs.finish(job, {"series_count": 1})
    await job._queue.get()  # the first consumer took the done event

    events = await asyncio.wait_for(_drain(job, heartbeat_s=0.05), timeout=5)

    assert events[0]["type"] == "state"
    assert events[-1]["type"] == "done"
    assert events[-1]["result"] == {"series_count": 1}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_running_job_with_nothing_to_say_sends_a_heartbeat() -> None:
    jobs = GenericJobManager()
    job = jobs.create("project-validate")

    frames: list[dict] = []
    async for frame in sse_lines(job, heartbeat_s=0.01):
        frames.append(json.loads(frame.removeprefix("data: ").strip()))
        if len(frames) >= 3:
            # Heartbeats keep a quiet stream open; the loop is endless by
            # design while the job runs, so the test ends it.
            break

    assert frames[0]["type"] == "state"
    assert {f["type"] for f in frames[1:]} == {"heartbeat"}
