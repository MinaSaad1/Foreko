"""APScheduler wrapper for scheduled forecast refreshes.

The scheduler is a singleton initialized on FastAPI startup. Each schedule
stored in SQLite is registered as an APScheduler CronTrigger job; on fire the
action runs and the result is appended to `forecast_history`.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


_scheduler: Any = None


def start_scheduler() -> Any:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        _scheduler = AsyncIOScheduler()
        _scheduler.start()
        logger.info("Scheduler started")
    except Exception as exc:
        logger.warning("Could not start scheduler: %s", exc)
        _scheduler = None
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass
        _scheduler = None


def _parse_cron(expr: str) -> dict[str, str] | None:
    """Parse a 5-field cron expr into APScheduler kwargs."""
    parts = expr.strip().split()
    if len(parts) != 5:
        return None
    return {
        "minute": parts[0],
        "hour": parts[1],
        "day": parts[2],
        "month": parts[3],
        "day_of_week": parts[4],
    }


def schedule_job(schedule_id: str, cron_expr: str, func: Any, kwargs: dict[str, Any]) -> bool:
    sched = _scheduler
    if sched is None:
        return False
    try:
        from apscheduler.triggers.cron import CronTrigger
        cron_kwargs = _parse_cron(cron_expr)
        if not cron_kwargs:
            return False
        sched.add_job(
            func,
            CronTrigger(**cron_kwargs),
            id=schedule_id,
            kwargs=kwargs,
            replace_existing=True,
        )
        return True
    except Exception as exc:
        logger.warning("Failed to schedule %s: %s", schedule_id, exc)
        return False


def unschedule_job(schedule_id: str) -> bool:
    sched = _scheduler
    if sched is None:
        return False
    try:
        sched.remove_job(schedule_id)
        return True
    except Exception:
        return False
