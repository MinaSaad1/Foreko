"""Runtime metadata for packaged Foreko builds.

The Tauri desktop shell spawns the backend as a sidecar and needs to know which
port it actually bound to (ports may be occupied by another app, or by an
earlier Foreko instance). We:

1. Pick a free port (preferring 8000 if available, else the next open one).
2. Write ``runtime.json`` under ``~/.foreko`` so the shell can read it.
3. Acquire a single-instance lock file so two shells launched at once don't
   start two backends.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

RUNTIME_FILENAME = "runtime.json"
LOCK_FILENAME = "runtime.lock"
PREFERRED_PORT = 8000
MAX_PORT_ATTEMPTS = 50


def pick_free_port(preferred: int = PREFERRED_PORT) -> int:
    """Return a free TCP port on loopback, trying ``preferred`` first."""

    for candidate in [preferred, *range(preferred + 1, preferred + MAX_PORT_ATTEMPTS)]:
        if _is_port_free(candidate):
            return candidate
    # Fall back to asking the OS for an ephemeral port.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def write_runtime_file(storage_dir: Path, *, port: int, host: str = "127.0.0.1") -> Path:
    storage_dir.mkdir(parents=True, exist_ok=True)
    target = storage_dir / RUNTIME_FILENAME
    payload = {
        "host": host,
        "port": port,
        "url": f"http://{host}:{port}",
        "pid": os.getpid(),
    }
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target


def read_runtime_file(storage_dir: Path) -> dict[str, object] | None:
    target = storage_dir / RUNTIME_FILENAME
    if not target.exists():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return None


def acquire_single_instance_lock(storage_dir: Path) -> bool:
    """Try to claim ``runtime.lock``.

    Returns True on success. Returns False if another live process holds it.
    Stale locks (owner pid dead) are auto-reclaimed.
    """

    storage_dir.mkdir(parents=True, exist_ok=True)
    lock_path = storage_dir / LOCK_FILENAME
    my_pid = os.getpid()

    if lock_path.exists():
        try:
            existing = int(lock_path.read_text(encoding="utf-8").strip())
            if existing != my_pid and _pid_alive(existing):
                logger.warning("Another Foreko instance appears to be running (pid=%s).", existing)
                return False
        except Exception:
            pass

    try:
        lock_path.write_text(str(my_pid), encoding="utf-8")
        return True
    except OSError as exc:
        logger.warning("Could not write single-instance lock: %s", exc)
        return False


def release_single_instance_lock(storage_dir: Path) -> None:
    lock_path = storage_dir / LOCK_FILENAME
    if not lock_path.exists():
        return
    try:
        content = lock_path.read_text(encoding="utf-8").strip()
        if content and int(content) == os.getpid():
            lock_path.unlink(missing_ok=True)
    except Exception:
        pass


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid
        )
        if not handle:
            return False
        still_active = ctypes.c_ulong()
        if ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(still_active)):
            ctypes.windll.kernel32.CloseHandle(handle)
            return still_active.value == 259  # STILL_ACTIVE
        ctypes.windll.kernel32.CloseHandle(handle)
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False
