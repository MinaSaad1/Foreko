"""Filesystem layout, fingerprints, and atomic writes for project artifacts.

SQLite holds project metadata, hashes, and summaries. Anything large (prepared
data, out-of-fold predictions, forecast arrays) is a file under::

    <storage_dir>/projects/<project_id>/
      derived/
      runs/<run_id>/
      exports/

Every identifier that reaches a path goes through :func:`validate_segment`, so a
crafted id cannot escape the storage root.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .paths import validate_segment


_FINGERPRINT_BLOCK = 1024 * 1024


def projects_root(storage_dir: Path) -> Path:
    return storage_dir / "projects"


def project_dir(storage_dir: Path, project_id: str) -> Path:
    validate_segment(project_id, kind="project id")
    return projects_root(storage_dir) / project_id


def derived_dir(storage_dir: Path, project_id: str) -> Path:
    return project_dir(storage_dir, project_id) / "derived"


def run_dir(storage_dir: Path, project_id: str, run_id: str) -> Path:
    validate_segment(run_id, kind="run id")
    return project_dir(storage_dir, project_id) / "runs" / run_id


def exports_dir(storage_dir: Path, project_id: str) -> Path:
    return project_dir(storage_dir, project_id) / "exports"


def dataset_fingerprint(path: Path) -> str:
    """Content hash of a source file, streamed so a large dataset stays cheap."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(_FINGERPRINT_BLOCK), b""):
            digest.update(block)
    return digest.hexdigest()


def recipe_hash(source_fingerprint: str, recipe: Any) -> str:
    """Cache key for a derived artifact.

    Keyed by source content plus the canonical recipe, so the same recipe over
    the same bytes reuses the artifact and any change misses the cache.
    """
    canonical = json.dumps(recipe, sort_keys=True, default=str, separators=(",", ":"))
    digest = hashlib.sha256()
    digest.update(source_fingerprint.encode("utf-8"))
    digest.update(b"\0")
    digest.update(canonical.encode("utf-8"))
    return digest.hexdigest()


def atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    """Write JSON via a temp file and rename, so a crash cannot leave a partial file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(payload, sort_keys=True, default=str),
        encoding="utf-8",
    )
    temp.replace(path)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def remove_project_dir(storage_dir: Path, project_id: str) -> bool:
    """Delete a project's artifacts. Returns False when there was nothing to remove."""
    target = project_dir(storage_dir, project_id)
    if not target.exists():
        return False
    shutil.rmtree(target)
    return True


__all__ = [
    "atomic_write_json",
    "dataset_fingerprint",
    "derived_dir",
    "exports_dir",
    "project_dir",
    "projects_root",
    "read_json",
    "recipe_hash",
    "remove_project_dir",
    "run_dir",
]
