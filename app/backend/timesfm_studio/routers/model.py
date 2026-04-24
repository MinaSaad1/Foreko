"""Endpoints for the first-run model download.

The Tauri shell / web SPA polls ``GET /api/model/download-progress`` while the
TimesFM checkpoint streams from HuggingFace so it can show a real progress bar.
``POST /api/model/ensure`` kicks off the download in the background if it hasn't
already started. ``POST /api/model/retry`` forces a fresh attempt if the
current one has stalled.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from ..services import model_download

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/model", tags=["model"])


def _resolve_model_target(request: Request) -> tuple[str, Path]:
    """Return ``(model_id, local_model_dir)`` derived from app settings.

    Mirrors the layout computed in ``main.lifespan``:
    ``<storage_dir>/models/<safe_model_id>`` where slashes in the HF repo id
    are replaced with ``--`` so the path is valid on every filesystem.
    """

    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="App settings not initialized.",
        )
    model_id: str = settings.model_id
    safe_model_id = model_id.replace("/", "--")
    local_dir: Path = settings.storage_dir / "models" / safe_model_id
    return model_id, local_dir


def _spawn_download(loop: asyncio.AbstractEventLoop, model_id: str, local_dir: Path) -> None:
    def _work() -> None:
        try:
            model_download.ensure_model(model_id, local_dir)
        except Exception:
            logger.exception("Model download failed")

    loop.run_in_executor(None, _work)


@router.get("/download-progress")
def get_progress() -> dict[str, Any]:
    """Current HuggingFace snapshot download progress."""

    return model_download.progress_snapshot()


@router.post("/ensure")
async def ensure_model(request: Request) -> dict[str, Any]:
    """Kick off the model download on a background thread if not already running."""

    state = model_download.progress_snapshot()
    if state["state"] in ("ready", "downloading"):
        return state

    model_id, local_dir = _resolve_model_target(request)
    _spawn_download(asyncio.get_running_loop(), model_id, local_dir)
    return model_download.progress_snapshot()


@router.post("/retry")
async def retry_download(request: Request) -> dict[str, Any]:
    """Reset progress state and kick off a fresh download attempt.

    Intended for users who see a stalled progress bar. The existing in-flight
    HTTP connection, if any, will time out on its own. HuggingFace resumes
    from whatever's already on disk, so a retry is always safe.
    """

    model_id, local_dir = _resolve_model_target(request)
    model_download.reset_for_retry()
    _spawn_download(asyncio.get_running_loop(), model_id, local_dir)
    return model_download.progress_snapshot()
