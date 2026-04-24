"""Phase 5 routers: narrative + NLQ + suggest factors."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_settings
from ..services import llm as llm_service
from ..services import nlq as nlq_service

narrative_router = APIRouter(prefix="/narrative", tags=["narrative"])
query_router = APIRouter(prefix="/query", tags=["query"])


class NarrateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any]


class SuggestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    columns: list[dict[str, Any]]


class QueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    records: list[dict[str, Any]]
    query: str
    date_field: str = "date"


@narrative_router.post("/forecast")
async def narrate_forecast(request: NarrateRequest, settings=Depends(get_settings)) -> dict:
    return await llm_service.narrate_forecast(request.payload, settings)


@narrative_router.post("/anomaly")
async def narrate_anomaly(request: NarrateRequest, settings=Depends(get_settings)) -> dict:
    return await llm_service.narrate_anomaly(request.payload, settings)


@narrative_router.post("/factors")
async def narrate_factors(request: NarrateRequest, settings=Depends(get_settings)) -> dict:
    return await llm_service.narrate_factors(request.payload, settings)


@narrative_router.post("/suggest-factors")
async def suggest_factors(request: SuggestRequest, settings=Depends(get_settings)) -> dict:
    return await llm_service.suggest_factors(request.columns, settings)


@query_router.post("")
async def run_query(request: QueryRequest) -> dict:
    return nlq_service.apply_query(request.records, request.query, request.date_field)
