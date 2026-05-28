"""Compute device probing."""

from __future__ import annotations

import logging
import shutil
import subprocess

from ..schemas.system import DeviceInfo

logger = logging.getLogger(__name__)


def _nvidia_smi_gpu_name() -> str | None:
    """Return the first GPU name from nvidia-smi, or None if unavailable."""
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            timeout=5,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        name = out.strip().splitlines()[0].strip()
        return name if name else None
    except Exception:
        return None


def probe() -> DeviceInfo:
    """Return a DeviceInfo describing the preferred compute device.

    Prefers CUDA when available, falls back to CPU. If nvidia-smi reports a
    GPU but torch cannot see it (CPU-only build installed), a clear warning is
    logged so the user knows to re-run setup.ps1 / setup.sh.
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
            logger.info("GPU acceleration enabled: %s", name)
            return DeviceInfo(
                kind="cuda",
                name=name,
                memory_total_mb=total_mb,
                memory_free_mb=free_mb,
            )

        gpu_name = _nvidia_smi_gpu_name()
        if gpu_name:
            logger.warning(
                "NVIDIA GPU detected (%s) but PyTorch was installed without "
                "CUDA support. Re-run setup.ps1 (Windows) or setup.sh (Linux/macOS) "
                "to enable GPU acceleration.",
                gpu_name,
            )

    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("CUDA probe failed, falling back to CPU: %s", exc)

    return DeviceInfo(kind="cpu", name="CPU", memory_total_mb=None, memory_free_mb=None)
