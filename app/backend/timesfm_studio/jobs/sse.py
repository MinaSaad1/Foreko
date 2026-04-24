"""Server-Sent Events stream generator for job queues."""

from __future__ import annotations

import asyncio
import dataclasses
import json
from typing import AsyncIterator

from .events import JobStatusEvent


async def event_stream(queue: asyncio.Queue) -> AsyncIterator[dict]:
    """Yield SSE dicts until a ``None`` sentinel is received."""

    while True:
        event: JobStatusEvent | None = await queue.get()
        if event is None:
            break
        yield {
            "event": event.type,
            "data": json.dumps(dataclasses.asdict(event)),
        }
