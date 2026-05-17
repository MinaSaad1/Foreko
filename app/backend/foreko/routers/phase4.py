"""Phase 4 routers: transformations, ensembles, segments, STL standalone."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
import numpy as np

from ..deps import get_db, get_settings
from ..schemas.dataset import ColumnMapping
from ..services import segments as segments_service
from ..services.diagnostics import _stl, _detect_period
from ..services import csv_loader
from ..services import transformations as tx_service
from ..services import ensembles as ens_service
import pandas as pd

stl_router = APIRouter(prefix="/stl", tags=["stl"])
segments_router = APIRouter(prefix="/segments", tags=["segments"])
ensemble_router = APIRouter(prefix="/ensemble", tags=["ensemble"])
tx_router = APIRouter(prefix="/transforms", tags=["transforms"])


class STLRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    period: int | None = None


class SegmentsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    top_n: int = Field(default=20, ge=1, le=200)


class EnsembleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    forecasts: dict[str, list[float]]
    mapes: dict[str, float]


class TransformRoundtripRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    kind: str = Field(default="log")
    period: int = Field(default=1, ge=1, le=365)


@stl_router.post("/decompose")
async def stl_decompose(
    request: STLRequest,
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    _key, cached = store.cache_lookup(request.dataset_id, "stl", request)
    if cached is not None:
        return cached
    df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, request.mapping)
    if not ids:
        raise ValueError("Dataset has no series.")
    series = values[0]
    series_dates = dates[0]
    freq = None
    try:
        freq = pd.infer_freq(series_dates)
    except Exception:
        pass
    period = request.period or _detect_period(freq, len(series))
    result = _stl(series, period)
    result["dates"] = [str(d.date()) for d in series_dates]
    result["period"] = period
    result["freq"] = freq or "unknown"
    store.cache_put(request.dataset_id, "stl", _key, result)
    return result


@segments_router.post("/compare")
async def segments_compare(
    request: SegmentsRequest,
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    _key, cached = store.cache_lookup(request.dataset_id, "segments", request)
    if cached is not None:
        return cached
    result = await segments_service.compare_segments(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        datasets_dir=settings.datasets_dir,
        top_n=request.top_n,
    )
    store.cache_put(request.dataset_id, "segments", _key, result)
    return result


@ensemble_router.post("/combine")
async def ensemble_combine(request: EnsembleRequest) -> dict:
    fc = {k: np.asarray(v, dtype=float) for k, v in request.forecasts.items()}
    return ens_service.summarize_ensemble(fc, request.mapes)


@tx_router.post("/roundtrip")
async def transform_roundtrip(
    request: TransformRoundtripRequest,
    settings=Depends(get_settings),
) -> dict:
    df = csv_loader.load_dataset(request.dataset_id, settings.datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, request.mapping)
    if not ids:
        raise ValueError("Dataset has no series.")
    series = values[0]
    ok = tx_service.roundtrip_ok(series, request.kind, period=request.period)
    t = tx_service.Transformer(request.kind, period=request.period)
    try:
        transformed = t.forward(series)
        return {
            "kind": request.kind,
            "reversible": ok,
            "transformed_preview": [float(v) for v in transformed[:50]],
            "n_points_after": int(len(transformed)),
        }
    except Exception as exc:
        return {"kind": request.kind, "reversible": False, "error": str(exc)}
