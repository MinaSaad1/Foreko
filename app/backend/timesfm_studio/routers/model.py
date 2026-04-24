"""Endpoints for the first-run model download.

The Tauri shell / web SPA polls ``GET /api/model/download-progress`` while the
TimesFM checkpoint streams from HuggingFace so it can show a real progress bar.
``POST /api/model/ensure`` kicks off the download in the background if it hasn't
already started.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request

from ..services import model_download

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/model", tags=["model"])


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

    registry = getattr(request.app.state, "registry", None)
    model_id = getattr(registry, "model_id", None) or "google/timesfm-2.5-200m-pytorch"

    loop = asyncio.get_running_loop()

    def _work() -> None:
        try:
            model_download.ensure_model(model_id)
        except Exception:
            logger.exception("Model download failed")

    loop.run_in_executor(None, _work)
    return model_download.progress_snapshot()
