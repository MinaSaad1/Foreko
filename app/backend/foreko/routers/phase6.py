"""Phase 6 routers: PDF exports + annotations."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from ..deps import get_db
from ..services import exports as exports_service

exports_router = APIRouter(prefix="/export", tags=["export"])
annotations_router = APIRouter(prefix="/annotations", tags=["annotations"])


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = "Foreko Analysis"
    sections: list[dict[str, Any]] = Field(default_factory=list)


class AnnotationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    date: str
    label: str
    note: str | None = None


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
