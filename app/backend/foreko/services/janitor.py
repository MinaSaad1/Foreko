"""Background sweeper that deletes uploaded datasets past their TTL.

The ``dataset_ttl_hours`` setting has always advertised that old uploads are
swept, but nothing actually swept them, so ``~/.foreko/datasets/`` grew without
bound. This module implements the sweep: a startup pass plus a periodic loop,
both driven from the FastAPI lifespan.

Setting ``dataset_ttl_hours`` to ``0`` (or any non-positive value) disables the
sweep entirely, so users who want to keep datasets forever have an escape
hatch.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# How often the periodic loop wakes up. The sweep itself is cheap (stat + parse
# one small json per dataset), so an hourly cadence is plenty.
_SWEEP_INTERVAL_SECONDS = 3600


def _parse_iso(value: object) -> datetime | None:
    """Parse an ISO-8601 ``uploaded_at`` string into an aware UTC datetime."""

    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def sweep_expired_datasets(datasets_dir: Path, ttl_hours: int) -> int:
    """Delete dataset directories whose ``uploaded_at`` is older than the TTL.

    Returns the number of datasets removed. Datasets with a missing or
    unparseable timestamp are left alone (we never delete something we cannot
    date). A non-positive ``ttl_hours`` disables sweeping.
    """

    if ttl_hours <= 0:
        return 0
    if not datasets_dir.exists():
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(hours=ttl_hours)
    removed = 0
    for meta_file in datasets_dir.glob("*/meta.json"):
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            uploaded_at = _parse_iso(meta.get("uploaded_at"))
            if uploaded_at is None or uploaded_at >= cutoff:
                continue
            shutil.rmtree(meta_file.parent, ignore_errors=True)
            removed += 1
        except Exception:
            # A corrupt meta.json or a locked directory must not crash the
            # sweep; log and move on to the next dataset.
            logger.warning(
                "Janitor could not evaluate %s", meta_file, exc_info=True
            )
    if removed:
        logger.info("Dataset janitor removed %d expired dataset(s).", removed)
    return removed


async def run_janitor(
    datasets_dir: Path,
    ttl_hours: int,
    *,
    interval_seconds: int = _SWEEP_INTERVAL_SECONDS,
) -> None:
    """Sweep once on startup, then on a fixed interval until cancelled."""

    if ttl_hours <= 0:
        logger.info("Dataset TTL disabled (dataset_ttl_hours=%s); janitor idle.", ttl_hours)
        return
    while True:
        try:
            sweep_expired_datasets(datasets_dir, ttl_hours)
        except Exception:  # pragma: no cover - defensive, sweep already guards
            logger.exception("Dataset janitor sweep failed")
        await asyncio.sleep(interval_seconds)


__all__ = ["sweep_expired_datasets", "run_janitor"]
