"""Phase 2 routers: anomaly methods comparison, changepoints, factor diagnostics."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_db, get_settings
from ..schemas.dataset import ColumnMapping
from ..services import anomaly_methods as am_service
from ..services import anomaly_root_cause as arc_service
from ..services import changepoints as cp_service
from ..services import factor_diagnostics as fd_service
from ..services.store import hash_params

anomaly_methods_router = APIRouter(prefix="/anomaly-methods", tags=["anomaly-methods"])
changepoints_router = APIRouter(prefix="/changepoints", tags=["changepoints"])
factor_diag_router = APIRouter(prefix="/factor-diagnostics", tags=["factor-diagnostics"])


class AnomalyMethodsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    critical_z: float = 3.0
    warning_z: float = 2.0


class RootCauseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    anomaly_dates: list[str]
    numeric_factors: list[str] = Field(default_factory=list)
    categorical_factors: list[str] = Field(default_factory=list)


class ChangepointsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    penalty: float = 10.0


class FactorDiagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset_id: str
    mapping: ColumnMapping
    numeric_factors: list[str] = Field(default_factory=list)
    categorical_factors: list[str] = Field(default_factory=list)
    max_lag: int = Field(default=14, ge=1, le=60)


@anomaly_methods_router.post("/detect")
async def detect_multi_method(
    request: AnomalyMethodsRequest,
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    key = hash_params(request.model_dump())
    cached = store.cache_get(request.dataset_id, "anomaly_methods", key)
    if cached:
        return cached["result"]
    result = await am_service.detect_all_methods(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        critical_z=request.critical_z,
        warning_z=request.warning_z,
        datasets_dir=settings.datasets_dir,
    )
    store.cache_put(request.dataset_id, "anomaly_methods", key, result)
    return result


@anomaly_methods_router.post("/root-cause")
async def anomaly_root_cause(
    request: RootCauseRequest,
    settings=Depends(get_settings),
) -> dict:
    return await arc_service.explain_anomalies(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        anomaly_dates=request.anomaly_dates,
        numeric_factors=request.numeric_factors,
        categorical_factors=request.categorical_factors,
        datasets_dir=settings.datasets_dir,
    )


@changepoints_router.post("/detect")
async def detect_changepoints(
    request: ChangepointsRequest,
    settings=Depends(get_settings),
    store=Depends(get_db),
) -> dict:
    key = hash_params(request.model_dump())
    cached = store.cache_get(request.dataset_id, "changepoints", key)
    if cached:
        return cached["result"]
    result = await cp_service.detect_changepoints(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        penalty=request.penalty,
        datasets_dir=settings.datasets_dir,
    )
    store.cache_put(request.dataset_id, "changepoints", key, result)
    return result


@factor_diag_router.post("/surrogate")
async def surrogate(
    request: FactorDiagRequest,
    settings=Depends(get_settings),
) -> dict:
    return await fd_service.surrogate_importance(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        numeric_factors=request.numeric_factors,
        categorical_factors=request.categorical_factors,
        datasets_dir=settings.datasets_dir,
    )


@factor_diag_router.post("/lag")
async def lag(
    request: FactorDiagRequest,
    settings=Depends(get_settings),
) -> dict:
    return await fd_service.lag_analysis(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        numeric_factors=request.numeric_factors,
        max_lag=request.max_lag,
        datasets_dir=settings.datasets_dir,
    )


@factor_diag_router.post("/granger")
async def granger(
    request: FactorDiagRequest,
    settings=Depends(get_settings),
) -> dict:
    return await fd_service.granger_tests(
        dataset_id=request.dataset_id,
        mapping=request.mapping,
        numeric_factors=request.numeric_factors,
        max_lag=request.max_lag,
        datasets_dir=settings.datasets_dir,
    )
