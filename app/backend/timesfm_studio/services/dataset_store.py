"""Dataset metadata + load dispatcher.

Every downstream caller that used to say ``csv_loader.load_dataset(id, dir)``
now goes through ``load_dataset`` here. The dispatcher reads meta.json,
looks up the loader in the registry by ``kind``, and delegates. That means
adding a new source type is purely additive: register a loader, the rest of
the app (forecaster, scenarios, backtest, anomaly, etc.) picks it up with no
code change.

Backward compatibility: meta.json files written before this refactor did not
contain "kind" or "schema_version". ``read_meta`` treats missing kind as
"csv" so pre-existing datasets on disk keep working without a migration.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from .loaders import LOADERS, get_loader

_LEGACY_KIND = "csv"


def read_meta(dataset_dir: Path) -> dict[str, Any]:
    """Read meta.json from a dataset directory, filling in schema defaults.

    Raises FileNotFoundError if meta.json is missing (dataset was never
    ingested, or the directory has been deleted).
    """

    meta_path = dataset_dir / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(
            f"Dataset metadata missing at {meta_path}"
        )
    meta: dict[str, Any] = json.loads(meta_path.read_text(encoding="utf-8"))
    meta.setdefault("kind", _LEGACY_KIND)
    meta.setdefault("schema_version", 1)
    return meta


def write_meta(dataset_dir: Path, meta: dict[str, Any]) -> None:
    """Write meta.json atomically (write-rename) so a crashed write leaves the
    previous file untouched."""

    meta_path = dataset_dir / "meta.json"
    tmp_path = meta_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(meta), encoding="utf-8")
    tmp_path.replace(meta_path)


def load_dataset(dataset_id: str, datasets_dir: Path) -> pd.DataFrame:
    """Return the DataFrame for a stored dataset, regardless of source type.

    Raises FileNotFoundError if the dataset does not exist.
    """

    dataset_dir = datasets_dir / dataset_id
    if not dataset_dir.exists():
        raise FileNotFoundError(f"Dataset {dataset_id} not found at {dataset_dir}")
    meta = read_meta(dataset_dir)
    loader = get_loader(meta["kind"])
    return loader.load(dataset_dir)


def list_known_kinds() -> list[str]:
    """Return registered loader kinds. Useful for diagnostics and tests."""

    return sorted(LOADERS)


__all__ = [
    "read_meta",
    "write_meta",
    "load_dataset",
    "list_known_kinds",
]
