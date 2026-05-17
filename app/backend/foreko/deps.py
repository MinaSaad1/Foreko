"""FastAPI dependencies: share :class:`ModelRegistry` and settings across routers."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from .jobs.generic import GenericJobManager, get_job_manager as _get_generic_job_manager
from .jobs.manager import JobManager
from .services.model_registry import ModelRegistry
from .services.store import Store, get_store
from .settings import Settings


def get_settings(request: Request) -> Settings:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="App settings not initialised.",
        )
    return settings


def get_registry(request: Request) -> ModelRegistry:
    registry = getattr(request.app.state, "registry", None)
    if registry is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model registry not initialised.",
        )
    return registry


def get_job_manager(request: Request) -> JobManager:
    job_manager = getattr(request.app.state, "job_manager", None)
    if job_manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job manager not initialised.",
        )
    return job_manager


def get_generic_jobs() -> GenericJobManager:
    return _get_generic_job_manager()


def get_db(request: Request) -> Store:
    settings = get_settings(request)
    settings.ensure_dirs()
    return get_store(settings.db_path)


__all__ = [
    "Depends",
    "get_settings",
    "get_registry",
    "get_job_manager",
    "get_generic_jobs",
    "get_db",
]
