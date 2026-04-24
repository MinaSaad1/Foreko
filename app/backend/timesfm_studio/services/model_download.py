"""Track TimesFM model download progress for the first-run splash.

The model is ~1.2 GB and streams from HuggingFace Hub on first run. The frontend
polls :func:`progress_snapshot` while this runs and renders a real progress bar.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

DownloadState = Literal["idle", "downloading", "ready", "error"]


@dataclass
class _ProgressState:
    state: DownloadState = "idle"
    total_bytes: int = 0
    downloaded_bytes: int = 0
    speed_bps: float = 0.0
    started_at: float = 0.0
    updated_at: float = 0.0
    error: str | None = None
    cache_path: str | None = None


_state = _ProgressState()
_lock = threading.Lock()


def progress_snapshot() -> dict[str, object]:
    """Cheap, thread-safe read of the current download progress."""

    with _lock:
        elapsed = max(time.monotonic() - _state.started_at, 0.0) if _state.started_at else 0.0
        remaining = 0.0
        if (
            _state.total_bytes
            and _state.downloaded_bytes < _state.total_bytes
            and _state.speed_bps > 0
        ):
            remaining = (_state.total_bytes - _state.downloaded_bytes) / _state.speed_bps
        return {
            "state": _state.state,
            "total_bytes": _state.total_bytes,
            "downloaded_bytes": _state.downloaded_bytes,
            "speed_bps": int(_state.speed_bps),
            "elapsed_seconds": int(elapsed),
            "eta_seconds": int(remaining),
            "error": _state.error,
            "cache_path": _state.cache_path,
        }


def _update(
    *,
    state: DownloadState | None = None,
    downloaded: int | None = None,
    total: int | None = None,
    error: str | None = None,
    cache_path: str | None = None,
) -> None:
    with _lock:
        now = time.monotonic()
        if state is not None:
            _state.state = state
            if state == "downloading" and _state.started_at == 0.0:
                _state.started_at = now
        if total is not None:
            _state.total_bytes = total
        if downloaded is not None:
            delta = max(downloaded - _state.downloaded_bytes, 0)
            dt = now - _state.updated_at if _state.updated_at else 0.0
            if dt > 0.5 and delta > 0:
                _state.speed_bps = 0.7 * _state.speed_bps + 0.3 * (delta / dt)
            _state.downloaded_bytes = downloaded
        if error is not None:
            _state.error = error
        if cache_path is not None:
            _state.cache_path = cache_path
        _state.updated_at = now


def mark_ready(cache_path: Path | None = None) -> None:
    _update(
        state="ready",
        cache_path=str(cache_path) if cache_path else None,
    )


def mark_error(message: str) -> None:
    _update(state="error", error=message)


def reset_for_retry() -> None:
    """Reset progress state so a new download attempt shows fresh counters.

    Intended for stalled-download recovery. Any in-flight HTTP connection
    started by the previous attempt will eventually time out on its own.
    HuggingFace's ``snapshot_download`` skips files already present on disk,
    so a fresh call picks up where the last attempt stopped.
    """

    global _state
    with _lock:
        prev_state = _state.state
        _state = _ProgressState()
    logger.warning("Model download reset for retry (was state=%s)", prev_state)


def ensure_model(model_id: str, local_dir: Path) -> Path:
    """Download the model snapshot into ``local_dir`` with progress reporting.

    ``local_dir`` is a Foresee-owned directory (not HuggingFace's default hub
    cache). HuggingFace writes real file copies into it — no symlinks — which
    sidesteps the Windows ``OSError[Errno 22]`` that happens when a fresh
    Python process opens HF's relative-symlink snapshot files. Existing hub
    cache blobs are still reused: ``hf_hub_download`` copies them locally in
    seconds instead of re-downloading from the network.

    Safe to call repeatedly; returns the local directory path.
    """

    from huggingface_hub import snapshot_download
    from huggingface_hub.utils import HfHubHTTPError

    with _lock:
        if _state.state == "ready" and _state.cache_path:
            return Path(_state.cache_path)

    # Seed the progress state. The custom tqdm below will update
    # total_bytes as the hub hub.snapshot_download walks each file.
    _update(state="downloading", downloaded=0, total=0, cache_path=str(local_dir))

    try:
        local_dir.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id=model_id,
            local_dir=str(local_dir),
            tqdm_class=_ProgressTqdm,
        )
        mark_ready(local_dir)
        return local_dir
    except HfHubHTTPError as exc:
        mark_error(
            f"HuggingFace error: {exc}. If the Hub is unreachable, "
            f"you can place the snapshot at {local_dir} and restart Foresee."
        )
        raise
    except (ConnectionError, TimeoutError) as exc:
        mark_error(
            f"Network error reaching HuggingFace: {exc}. If this persists, "
            f"place the snapshot at {local_dir} and restart Foresee."
        )
        raise
    except Exception as exc:
        mark_error(str(exc))
        raise


from tqdm import tqdm as _tqdm_base


class _ProgressTqdm(_tqdm_base):
    """tqdm subclass that feeds byte counts into the shared _state sink.

    Inherits from ``tqdm.tqdm`` (with ``disable=True`` so no bar is drawn) so
    we retain all of tqdm's classmethods like ``get_lock`` / ``set_lock`` that
    ``huggingface_hub`` passes through ``tqdm.contrib.concurrent.thread_map``.
    """

    def __init__(self, *args: object, **kwargs: object) -> None:
        kwargs["disable"] = True  # suppress visual rendering
        super().__init__(*args, **kwargs)
        total = int(self.total or 0)
        if total:
            with _lock:
                _state.total_bytes = max(
                    _state.total_bytes, _state.downloaded_bytes + total
                )

    def update(self, n: int = 1) -> bool | None:  # type: ignore[override]
        n_int = int(n or 0)
        with _lock:
            _state.downloaded_bytes += n_int
            now = time.monotonic()
            dt = now - _state.updated_at if _state.updated_at else 0.0
            if dt > 0.5:
                _state.speed_bps = 0.7 * _state.speed_bps + 0.3 * (n_int / dt)
            _state.updated_at = now
        return super().update(n_int)


@dataclass
class _NoopEvent:
    flag: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)
