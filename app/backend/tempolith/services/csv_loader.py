"""Backward-compatibility shim.

The original services.csv_loader has been split across:
    - services.loaders.csv       -- CSV-specific upload/load
    - services.dataset_store     -- source-agnostic load dispatcher
    - services.series            -- DataFrame -> (ids, values, dates) helpers

This module re-exports the subset of names that existing callers import via
``from .services import csv_loader``. New code should import from the modules
above directly; keep this shim until every call site is migrated.
"""

from __future__ import annotations

from .dataset_store import load_dataset
from .loaders.csv import ingest_upload
from .series import (
    _infer_column_dtype,
    _normalize_month,
    _resolve_date_column,
    build_extraction,
    ensure_min_length,
    extract_series,
    infer_frequency,
    summarize_series,
)

__all__ = [
    "ingest_upload",
    "load_dataset",
    "extract_series",
    "ensure_min_length",
    "build_extraction",
    "summarize_series",
    "infer_frequency",
    "_infer_column_dtype",
    "_resolve_date_column",
    "_normalize_month",
]
