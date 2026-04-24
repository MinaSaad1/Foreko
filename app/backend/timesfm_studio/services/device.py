"""Compute device probing."""

from __future__ import annotations

import logging

from ..schemas.system import DeviceInfo

logger = logging.getLogger(__name__)


def probe() -> DeviceInfo:
    """Return a :class:`DeviceInfo` describing the preferred device.

    Prefers CUDA when available, falls back to CPU. Never raises; any import
    error or probe failure falls through to CPU.
    """

    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            index = torch.cuda.current_device()
            name = torch.cuda.get_device_name(index)
            try:
                free_bytes, total_bytes = torch.cuda.mem_get_info(index)
                free_mb = int(free_bytes // (1024 * 1024))
                total_mb = int(total_bytes // (1024 * 1024))
            except Exception:  # pragma: no cover - driver specific
                free_mb = None
                total_mb = None
            return DeviceInfo(
                kind="cuda",
                name=name,
                memory_total_mb=total_mb,
                memory_free_mb=free_mb,
            )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("CUDA probe failed, falling back to CPU: %s", exc)

    return DeviceInfo(kind="cpu", name="CPU", memory_total_mb=None, memory_free_mb=None)
