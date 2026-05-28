"""System endpoints: /health, /model-info, /system/storage, /system/log-bundle."""

from __future__ import annotations

import datetime
import io
import logging
import shutil
import zipfile

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import __version__
from ..deps import get_registry, get_settings
from ..schemas.system import HealthInfo, ModelInfo
from ..services.model_registry import ModelRegistry
from ..settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthInfo)
def health(
    registry: ModelRegistry = Depends(get_registry),
) -> HealthInfo:
    return HealthInfo(
        status="ok",
        model_status=registry.status,
        device=registry.device,
        version=__version__,
    )


@router.get("/model-info", response_model=ModelInfo)
def model_info(
    registry: ModelRegistry = Depends(get_registry),
) -> ModelInfo:
    return ModelInfo(
        model_id=registry.model_id,
        model_status=registry.status,
        current_config=registry.current_config_summary,
        compile_count=registry.compile_count,
        queue_depth=registry.queue_depth,
        device=registry.device,
        error=registry.error,
    )


class StorageWipeResult(BaseModel):
    """Summary of what the storage wipe touched."""

    removed: list[str]
    kept: list[str]


# Directories wiped by ``DELETE /system/storage``. The model cache is kept on
# purpose: the weights are loaded into memory at this point, deleting them on
# Windows would race with the registry's open file handles, and users would
# face an unnecessary 1.2 GB redownload on restart.
_WIPEABLE_DIRS = ("datasets", "adapters", "jobs", "data", "exports", "logs")


@router.delete("/system/storage", response_model=StorageWipeResult)
def wipe_storage(settings: Settings = Depends(get_settings)) -> StorageWipeResult:
    """Remove uploaded datasets, job state, cached results, logs, and exports.

    Leaves the model weights under ``storage_dir/models/`` untouched. The client
    is expected to confirm the action before calling this endpoint.
    """

    removed: list[str] = []
    for name in _WIPEABLE_DIRS:
        target = settings.storage_dir / name
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
            removed.append(str(target))
    settings.ensure_dirs()
    kept = [str(settings.storage_dir / "models")]
    logger.warning("Storage wipe: removed %s, kept %s", removed, kept)
    return StorageWipeResult(removed=removed, kept=kept)


@router.get("/system/log-bundle")
def log_bundle(settings: Settings = Depends(get_settings)) -> StreamingResponse:
    """Return a zip of the logs directory for troubleshooting."""

    buf = io.BytesIO()
    logs_dir = settings.logs_dir
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        if logs_dir.exists():
            for path in sorted(logs_dir.rglob("*")):
                if path.is_file():
                    zf.write(path, arcname=path.relative_to(logs_dir))
        manifest = (
            f"Foreko log bundle\n"
            f"version: {__version__}\n"
            f"generated_at: {datetime.datetime.utcnow().isoformat()}Z\n"
            f"logs_dir: {logs_dir}\n"
        )
        zf.writestr("manifest.txt", manifest)
    buf.seek(0)
    stamp = datetime.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"foreko-logs-{stamp}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
