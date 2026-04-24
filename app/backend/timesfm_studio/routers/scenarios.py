"""Scenarios CRUD + run + compare router."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_db, get_registry, get_settings
from ..schemas.dataset import ColumnMapping
from ..services import scenarios as scenarios_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


class ScenarioConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(default=12, ge=1, le=256)
    numeric_factors: list[str] = Field(default_factory=list)
    categorical_factors: list[str] = Field(default_factory=list)
    future_numeric: dict[str, list[float]] = Field(default_factory=dict)
    future_categorical: dict[str, list[int]] = Field(default_factory=dict)
    counterfactuals: list[str] = Field(default_factory=list)
    xreg_mode: str = "additive"


class SaveScenarioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    config: ScenarioConfig


class CompareScenariosRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_ids: list[str]


@router.post("/run")
async def run_scenario_endpoint(
    config: ScenarioConfig,
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> dict:
    return await scenarios_service.run_scenario(
        dataset_id=config.dataset_id,
        mapping=config.mapping,
        horizon=config.horizon,
        numeric_factors=config.numeric_factors,
        categorical_factors=config.categorical_factors,
        future_numeric=config.future_numeric or None,
        future_categorical=config.future_categorical or None,
        counterfactuals=config.counterfactuals,
        xreg_mode=config.xreg_mode,
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )


@router.post("")
async def save_scenario(
    request: SaveScenarioRequest,
    store=Depends(get_db),
) -> dict:
    sid = store.scenario_create(
        dataset_id=request.config.dataset_id,
        label=request.label,
        config=request.config.model_dump(),
    )
    return {"id": sid}


@router.get("")
async def list_scenarios(dataset_id: str, store=Depends(get_db)) -> list[dict]:
    return store.scenario_list(dataset_id)


@router.get("/{scenario_id}")
async def get_scenario(scenario_id: str, store=Depends(get_db)) -> dict:
    s = store.scenario_get(scenario_id)
    if not s:
        raise HTTPException(404, "scenario not found")
    return s


@router.delete("/{scenario_id}")
async def delete_scenario(scenario_id: str, store=Depends(get_db)) -> dict:
    ok = store.scenario_delete(scenario_id)
    if not ok:
        raise HTTPException(404, "scenario not found")
    return {"deleted": True}


@router.post("/compare")
async def compare_scenarios(
    request: CompareScenariosRequest,
    store=Depends(get_db),
    registry=Depends(get_registry),
    settings=Depends(get_settings),
) -> dict:
    stored = []
    for sid in request.scenario_ids:
        s = store.scenario_get(sid)
        if not s:
            raise HTTPException(404, f"scenario {sid} not found")
        stored.append(s)

    results: list[dict[str, Any]] = []
    tasks = []
    for s in stored:
        cfg = s["config"]
        tasks.append(
            scenarios_service.run_scenario(
                dataset_id=cfg["dataset_id"],
                mapping=cfg["mapping"] if isinstance(cfg["mapping"], ColumnMapping) else ColumnMapping(**cfg["mapping"]),
                horizon=cfg.get("horizon", 12),
                numeric_factors=cfg.get("numeric_factors", []),
                categorical_factors=cfg.get("categorical_factors", []),
                future_numeric=cfg.get("future_numeric") or None,
                future_categorical=cfg.get("future_categorical") or None,
                counterfactuals=cfg.get("counterfactuals", []),
                xreg_mode=cfg.get("xreg_mode", "additive"),
                datasets_dir=settings.datasets_dir,
                registry=registry,
            )
        )
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    baseline_total: float | None = None
    for s, r in zip(stored, raw_results):
        if isinstance(r, Exception):
            logger.warning("scenario %s failed: %s", s["label"], r)
            continue
        total = float(r.get("total", sum(r["forecast"])))
        if baseline_total is None:
            baseline_total = total
        delta = total - (baseline_total or 0.0)
        delta_pct = delta / abs(baseline_total) if baseline_total else 0.0
        results.append({
            "id": s["id"],
            "label": s["label"],
            "forecast_dates": r["forecast_dates"],
            "forecast": r["forecast"],
            "p10": r["p10"],
            "p90": r["p90"],
            "total": total,
            "delta_vs_first": round(delta, 2),
            "delta_pct_vs_first": round(delta_pct, 4),
        })

    if not results:
        raise HTTPException(500, "All scenarios failed to run.")

    first_ok = next(r for r in raw_results if not isinstance(r, Exception))
    return {
        "historical_dates": first_ok["historical_dates"],
        "historical_values": first_ok["historical_values"],
        "scenarios": results,
    }


# Forecast history (stability)
@router.get("/history/{dataset_id}")
async def forecast_history(dataset_id: str, limit: int = 20, store=Depends(get_db)) -> list[dict]:
    return store.history_list(dataset_id, limit=limit)


@router.post("/history/{dataset_id}")
async def record_forecast(
    dataset_id: str,
    payload: dict,
    store=Depends(get_db),
) -> dict:
    hid = store.history_append(
        dataset_id=dataset_id,
        model=payload.get("model", "unknown"),
        horizon=int(payload.get("horizon", 12)),
        forecast=payload.get("forecast", {}),
    )
    return {"id": hid}
