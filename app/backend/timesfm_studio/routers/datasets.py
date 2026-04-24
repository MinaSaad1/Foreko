"""Dataset upload / preview / series extraction endpoints."""

from __future__ import annotations

import json as json_module
import logging
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..deps import get_settings
from ..schemas.dataset import ColumnMapping, DatasetPreview, DatasetSummary, SeriesExtraction
from ..services import csv_loader
from ..settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/upload", response_model=DatasetPreview)
async def upload(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> DatasetPreview:
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .csv uploads are accepted.",
        )
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"CSV exceeds {settings.max_upload_bytes} bytes.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file."
        )
    try:
        preview = csv_loader.ingest_upload(
            filename=file.filename or "upload.csv",
            content=content,
            datasets_dir=settings.datasets_dir,
        )
    except Exception as exc:  # pandas errors come back as the user's fault 422
        logger.exception("CSV ingest failed")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse CSV: {exc}",
        ) from exc
    return preview


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
def preview(
    dataset_id: str, settings: Settings = Depends(get_settings)
) -> DatasetPreview:
    try:
        df = csv_loader.load_dataset(dataset_id, settings.datasets_dir)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    # Reuse the ingest preview logic without re-saving.
    columns = []
    for name in df.columns:
        col = df[name]
        columns.append(
            {
                "name": str(name),
                "dtype": csv_loader._infer_column_dtype(col),
                "example_values": [str(v) for v in col.dropna().head(5).tolist()],
                "null_fraction": round(float(col.isna().mean()) if len(col) else 0.0, 4),
            }
        )
    first_rows = df.head(50).where(df.notna(), None).to_dict(orient="records")
    return DatasetPreview(
        id=dataset_id,
        filename=f"{dataset_id}.csv",
        columns=columns,  # type: ignore[arg-type]
        row_count=int(len(df)),
        first_rows=first_rows,
    )


@router.get("", response_model=list[DatasetSummary])
def list_datasets(settings: Settings = Depends(get_settings)) -> list[DatasetSummary]:
    results: list[DatasetSummary] = []
    for meta_file in settings.datasets_dir.glob("*/meta.json"):
        try:
            meta = json_module.loads(meta_file.read_text(encoding="utf-8"))
            raw_path = meta_file.parent / "raw.csv"
            results.append(DatasetSummary(
                id=meta.get("id", meta_file.parent.name),
                filename=meta.get("filename", "unknown.csv"),
                row_count=meta.get("row_count", 0),
                uploaded_at=meta.get("uploaded_at", ""),
                size_bytes=int(raw_path.stat().st_size) if raw_path.exists() else 0,
            ))
        except Exception:
            pass
    results.sort(key=lambda d: d.uploaded_at, reverse=True)
    return results


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, settings: Settings = Depends(get_settings)) -> None:
    dataset_dir = settings.datasets_dir / dataset_id
    if not dataset_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
    shutil.rmtree(dataset_dir)


@router.post("/{dataset_id}/series", response_model=SeriesExtraction)
def series(
    dataset_id: str,
    mapping: ColumnMapping,
    settings: Settings = Depends(get_settings),
) -> SeriesExtraction:
    try:
        df = csv_loader.load_dataset(dataset_id, settings.datasets_dir)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    try:
        return csv_loader.build_extraction(dataset_id, df, mapping)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
