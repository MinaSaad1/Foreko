"""Dataset loader registry.

Every data source (CSV, Excel, Parquet, JSON, SQL, ...) is implemented as a
DatasetLoader. Each loader is responsible for two things:

1. `ingest()` -- take raw bytes or a source spec, persist whatever on-disk
    artifacts the loader needs under {datasets_dir}/{dataset_id}/, and return a
    DatasetPreview.
2. `load()` -- given a dataset directory, return the pandas DataFrame that
    the series helpers (services.series.extract_series) can consume.

The forecaster and every other consumer call services.dataset_store.load_dataset,
which reads meta.json, looks up the right loader in LOADERS, and delegates.
Consumers never import a concrete loader directly -- that keeps adding new
sources a one-line registry change.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, ClassVar, Protocol, runtime_checkable

import pandas as pd

from ...schemas.dataset import DatasetPreview


@runtime_checkable
class DatasetLoader(Protocol):
    """Contract every data-source loader implements.

    Attributes:
        kind: stable identifier written to meta.json (e.g. "csv", "parquet", "sql").
        extensions: file extensions this loader claims for upload-based ingestion.
            Empty tuple for connection-based loaders (SQL, cloud storage, APIs).
    """

    kind: ClassVar[str]
    extensions: ClassVar[tuple[str, ...]]

    def ingest(
        self,
        *,
        filename: str,
        raw_bytes: bytes | None,
        source_spec: dict[str, Any],
        datasets_dir: Path,
    ) -> DatasetPreview:
        """Persist the dataset and return a preview.

        Args:
            filename: user-visible filename (for uploads) or a display name (for
                connection-based sources such as SQL).
            raw_bytes: upload payload for file-based sources, None for
                connection-based sources.
            source_spec: extra loader-specific arguments (e.g. ``{"sheet": "Q3"}``
                for Excel, ``{"connection_id": "...", "query": "..."}`` for SQL).
                The loader is free to persist any subset of this into meta.json
                under the "source" key so refresh/display works later.
            datasets_dir: root directory to create ``{dataset_id}/`` under.
        """

    def load(self, dataset_dir: Path) -> pd.DataFrame:
        """Return the canonical DataFrame for a stored dataset.

        The dispatcher (services.dataset_store.load_dataset) calls this after
        reading meta.json and resolving the correct loader. Implementations must
        raise FileNotFoundError if the on-disk artifacts are missing.
        """


LOADERS: dict[str, DatasetLoader] = {}
"""Registry keyed by loader.kind. Populated at import time by each loader module."""


def register(loader: DatasetLoader) -> DatasetLoader:
    """Register a loader instance. Safe to call multiple times with the same kind;
    a second registration replaces the first (useful for tests)."""

    LOADERS[loader.kind] = loader
    return loader


def loader_for_extension(ext: str) -> DatasetLoader | None:
    """Return the loader that claims a given file extension, or None.

    ``ext`` should include the leading dot and be lowercased by the caller.
    """

    for loader in LOADERS.values():
        if ext in loader.extensions:
            return loader
    return None


def get_loader(kind: str) -> DatasetLoader:
    """Fetch a loader by kind. Raises KeyError with a friendly list of known
    kinds if the requested kind is not registered."""

    try:
        return LOADERS[kind]
    except KeyError:
        known = ", ".join(sorted(LOADERS)) or "none registered"
        raise KeyError(
            f"No loader registered for kind={kind!r}. Known kinds: {known}."
        ) from None


# Import side effects register built-in loaders. Keep these at module bottom so
# circular-import issues surface clearly rather than as empty registries.
from . import csv as _csv_loader  # noqa: E402,F401  (registers CSVLoader)
from . import excel as _excel_loader  # noqa: E402,F401
from . import json as _json_loader  # noqa: E402,F401
from . import parquet as _parquet_loader  # noqa: E402,F401

try:
    from . import sql as _sql_loader  # noqa: E402,F401
except ImportError as _sql_import_err:  # pragma: no cover - connectors extra not installed
    import logging as _log
    _log.getLogger(__name__).info(
        "SQL loader unavailable (install the 'connectors' extra for database support): %s",
        _sql_import_err,
    )


__all__ = [
    "DatasetLoader",
    "LOADERS",
    "register",
    "loader_for_extension",
    "get_loader",
]
