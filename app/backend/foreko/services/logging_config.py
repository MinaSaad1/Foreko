"""Rotating file + console logging for packaged Foreko builds."""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

_CONFIGURED = False


def configure_logging(logs_dir: Path) -> Path:
    """Install a rotating file handler under ``logs_dir/foreko.log``.

    Idempotent. Returns the log file path.
    """

    global _CONFIGURED
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / "foreko.log"

    if _CONFIGURED:
        return log_path

    level_name = os.environ.get("FOREKO_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)
    file_handler.setLevel(level)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(fmt)
    stream_handler.setLevel(level)

    root = logging.getLogger()
    root.setLevel(level)
    # Remove any pre-existing basicConfig handlers to avoid duplicate lines.
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(file_handler)
    root.addHandler(stream_handler)

    _CONFIGURED = True
    return log_path
