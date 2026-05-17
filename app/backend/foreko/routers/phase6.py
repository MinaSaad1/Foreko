"""Phase 6 routers: exports, schedules, alert rules, annotations, share URLs."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_db, get_settings
from ..services import alerts as alerts_service
from ..services import exports as exports_service
from ..services import scheduler as scheduler_service

exports_router = APIRouter(prefix="/export", tags=["export"])
schedules_router = APIRouter(prefix="/schedules", tags=["schedules"])
alerts_router = APIRouter(prefix="/alerts", tags=["alerts"])
annotations_router = APIRouter(prefix="/annotations", tags=["annotations"])
share_router = APIRouter(prefix="/share", tags=["share"])


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = "Foreko Analysis"
    sections: list[dict[str, Any]] = Field(default_factory=list)


class ScheduleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    cron: str
    action: dict[str, Any]


class AlertRuleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    kind: str = Field(pattern="^(anomaly|drift|influence_shift)$")
    config: dict[str, Any]


class AnnotationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    date: str
    label: str
    note: str | None = None


class ShareMint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str
    expires_at: str | None = None


class WebhookTest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    message: str = "Foreko test alert"


# -------- Exports --------

def _content_disposition(title: str, extension: str) -> str:
    ascii_fallback = title.encode("ascii", errors="ignore").decode("ascii").strip() or "export"
    safe_ascii = "".join(c for c in ascii_fallback if c.isalnum() or c in "-_ ").strip() or "export"
    utf8_encoded = quote(f"{title}.{extension}", safe="")
    return (
        f'attachment; filename="{safe_ascii}.{extension}"; '
        f"filename*=UTF-8''{utf8_encoded}"
    )


@exports_router.post("/pdf")
async def export_pdf(request: ExportRequest) -> Response:
    pdf_bytes = exports_service.analysis_to_pdf(request.title, request.sections)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(request.title, "pdf")},
    )


# -------- Schedules --------

@schedules_router.post("")
async def create_schedule(request: ScheduleCreate, store=Depends(get_db)) -> dict:
    sid = store.schedule_create(request.dataset_id, request.cron, request.action)
    return {"id": sid}


@schedules_router.get("")
async def list_schedules(store=Depends(get_db)) -> list[dict]:
    return store.schedule_list()


@schedules_router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, store=Depends(get_db)) -> dict:
    ok = store.schedule_delete(schedule_id)
    if not ok:
        raise HTTPException(404, "not found")
    scheduler_service.unschedule_job(schedule_id)
    return {"deleted": True}


# -------- Alert Rules --------

@alerts_router.post("/rules")
async def create_alert_rule(request: AlertRuleCreate, store=Depends(get_db)) -> dict:
    rid = store.alert_rule_create(request.dataset_id, request.kind, request.config)
    return {"id": rid}


@alerts_router.get("/rules")
async def list_alert_rules(dataset_id: str | None = None, store=Depends(get_db)) -> list[dict]:
    return store.alert_rule_list(dataset_id)


@alerts_router.delete("/rules/{rule_id}")
async def delete_alert_rule(rule_id: str, store=Depends(get_db)) -> dict:
    ok = store.alert_rule_delete(rule_id)
    if not ok:
        raise HTTPException(404, "not found")
    return {"deleted": True}


@alerts_router.post("/test-webhook")
async def test_webhook(request: WebhookTest) -> dict:
    ok = await alerts_service.dispatch_webhook(
        request.url, {"source": "foreko", "message": request.message}
    )
    return {"ok": ok}


# -------- Annotations --------

@annotations_router.post("")
async def create_annotation(request: AnnotationCreate, store=Depends(get_db)) -> dict:
    aid = store.annotation_create(request.dataset_id, request.date, request.label, request.note)
    return {"id": aid}


@annotations_router.get("/{dataset_id}")
async def list_annotations(dataset_id: str, store=Depends(get_db)) -> list[dict]:
    return store.annotation_list(dataset_id)


@annotations_router.delete("/{annotation_id}")
async def delete_annotation(annotation_id: str, store=Depends(get_db)) -> dict:
    ok = store.annotation_delete(annotation_id)
    if not ok:
        raise HTTPException(404, "not found")
    return {"deleted": True}


# -------- Share --------

@share_router.post("/mint")
async def mint_share(request: ShareMint, store=Depends(get_db)) -> dict:
    token = store.share_mint(request.analysis_id, request.expires_at)
    return {"token": token}


@share_router.get("/{token}")
async def resolve_share(token: str, store=Depends(get_db)) -> dict:
    analysis_id = store.share_resolve(token)
    if not analysis_id:
        raise HTTPException(404, "invalid token")
    analysis = store.analyses_get(analysis_id)
    if not analysis:
        raise HTTPException(404, "analysis no longer exists")
    return analysis
