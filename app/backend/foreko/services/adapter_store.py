"""Filesystem-backed store for LoRA adapter metadata and paths."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from ..schemas.finetune import AdapterMetadata
from .paths import validate_segment

logger = logging.getLogger(__name__)


def list_adapters(adapters_dir: Path) -> list[AdapterMetadata]:
    """Return all adapters found in *adapters_dir*, sorted newest-first."""

    results: list[AdapterMetadata] = []
    for meta_file in adapters_dir.glob("*/meta.json"):
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            results.append(AdapterMetadata(**data))
        except Exception:
            logger.warning("Skipping malformed adapter meta at %s", meta_file)
    results.sort(key=lambda m: m.created_at, reverse=True)
    return results


def get_adapter(adapter_id: str, adapters_dir: Path) -> AdapterMetadata | None:
    """Load metadata for a single adapter, or return ``None`` if not found."""

    validate_segment(adapter_id, kind="adapter id")
    meta_file = adapters_dir / adapter_id / "meta.json"
    if not meta_file.exists():
        return None
    try:
        return AdapterMetadata(**json.loads(meta_file.read_text(encoding="utf-8")))
    except Exception:
        logger.warning("Could not parse adapter meta at %s", meta_file)
        return None


def delete_adapter(adapter_id: str, adapters_dir: Path) -> bool:
    """Delete an adapter directory. Returns ``False`` if it does not exist."""

    validate_segment(adapter_id, kind="adapter id")
    adapter_dir = adapters_dir / adapter_id
    if not adapter_dir.exists():
        return False
    shutil.rmtree(adapter_dir)
    return True


def get_adapter_path(adapter_id: str, adapters_dir: Path) -> Path | None:
    """Return the adapter directory path, or ``None`` if it does not exist."""

    validate_segment(adapter_id, kind="adapter id")
    d = adapters_dir / adapter_id
    return d if d.exists() else None
