"""FastAPI application factory for Foreko."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .jobs.manager import JobManager
from .routers import adapters as adapters_router
from .routers import anomaly as anomaly_router
from .routers import comparison as comparison_router
from .routers import covariates as covariates_router
from .routers import factors as factors_router
from .routers import backtest as backtest_router
from .routers import diagnostics as diagnostics_router_mod
from .routers import model as model_router
from .routers import phase2 as phase2_routers
from .routers import scenarios as scenarios_router
from .routers import phase4 as phase4_routers
from .routers import phase6 as phase6_routers
from .routers import connections as connections_router
from .routers import datasets as datasets_router
from .routers import finetune as finetune_router
from .routers import forecast as forecast_router
from .routers import system as system_router
from .services import device as device_service
from .services import model_download as model_download_svc
from .services.logging_config import configure_logging
from .services.model_registry import ModelRegistry
from .settings import Settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    settings.ensure_dirs()

    device_info = device_service.probe()
    logger.info("Detected device: %s (%s)", device_info.kind, device_info.name)

    # Model cache lives under the Foreko storage dir (real file copies,
    # not HF-hub symlinks) so ``from_pretrained`` can read it reliably from
    # a fresh PyInstaller-extracted Python process on Windows.
    safe_model_id = settings.model_id.replace("/", "--")
    local_model_dir = settings.storage_dir / "models" / safe_model_id

    registry = ModelRegistry(
        model_id=settings.model_id,
        device=device_info,
        local_model_dir=local_model_dir,
    )
    app.state.registry = registry

    job_manager = JobManager(jobs_dir=settings.jobs_dir)
    app.state.job_manager = job_manager

    load_task: asyncio.Task[None] | None = None
    if settings.preload_model:
        # Predownload the snapshot with progress reporting, then hand off to
        # the registry's loader. If the snapshot is already cached, download
        # is effectively a no-op.
        async def _preload() -> None:
            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(
                    None,
                    model_download_svc.ensure_model,
                    settings.model_id,
                    local_model_dir,
                )
            except Exception:
                logger.exception("Model snapshot download failed")
                return
            try:
                await registry.load()
            except Exception:
                logger.exception("Model load failed")

        load_task = asyncio.create_task(_preload(), name="timesfm-model-load")

    try:
        yield
    finally:
        if load_task is not None and not load_task.done():
            load_task.cancel()
        registry.shutdown()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.ensure_dirs()
    configure_logging(settings.logs_dir)

    app = FastAPI(
        title="Foreko",
        version=__version__,
        description=(
            "Foreko, a local-first time-series forecasting workbench. "
            "TimesFM and LightGBM side by side, with backtesting, "
            "diagnostics, factor analysis, anomaly detection, and "
            "what-if scenarios."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Global exception handlers. Without these, unhandled ValueError/KeyError
    # in service code bubble up as bare 500 "Internal Server Error" with no
    # detail, so the frontend shows nothing useful. These handlers preserve
    # the original message in the `detail` field so the UI can display it.
    def _truncate(msg: str, limit: int = 500) -> str:
        return msg if len(msg) <= limit else msg[: limit - 1] + "…"

    @app.exception_handler(ValueError)
    async def _value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
        # ValueError in service layer = the request/data is unprocessable.
        # 422 keeps the frontend's existing friendly-message patterns working.
        logger.info("ValueError handled: %s", exc)
        return JSONResponse(
            status_code=422,
            content={"detail": _truncate(str(exc)) or "The request could not be processed."},
        )

    @app.exception_handler(KeyError)
    async def _key_error_handler(_request: Request, exc: KeyError) -> JSONResponse:
        # KeyError typically means a referenced column/id is missing.
        key = exc.args[0] if exc.args else ""
        detail = f"Missing required field or column: {key!r}" if key else "Missing required field."
        logger.info("KeyError handled: %s", detail)
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.exception_handler(FileNotFoundError)
    async def _not_found_handler(_request: Request, exc: FileNotFoundError) -> JSONResponse:
        logger.info("FileNotFoundError handled: %s", exc)
        return JSONResponse(
            status_code=404,
            content={"detail": _truncate(str(exc)) or "Requested file was not found."},
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        # Last-resort handler: log with traceback, but still return a useful
        # detail string so the UI can show WHY the request failed rather than
        # the generic "Internal Server Error".
        logger.exception("Unhandled exception at %s %s", request.method, request.url.path)
        detail = _truncate(f"{type(exc).__name__}: {exc}") or "Unexpected server error."
        return JSONResponse(status_code=500, content={"detail": detail})

    app.include_router(system_router.router, prefix="/api")
    app.include_router(datasets_router.router, prefix="/api")
    app.include_router(connections_router.router, prefix="/api")
    app.include_router(forecast_router.router, prefix="/api")
    app.include_router(comparison_router.router, prefix="/api")
    app.include_router(anomaly_router.router, prefix="/api")
    app.include_router(covariates_router.router, prefix="/api")
    app.include_router(factors_router.router, prefix="/api")
    app.include_router(backtest_router.router, prefix="/api")
    app.include_router(diagnostics_router_mod.diagnostics_router, prefix="/api")
    app.include_router(diagnostics_router_mod.preflight_router, prefix="/api")
    app.include_router(diagnostics_router_mod.analyses_router, prefix="/api")
    app.include_router(phase2_routers.anomaly_methods_router, prefix="/api")
    app.include_router(phase2_routers.changepoints_router, prefix="/api")
    app.include_router(phase2_routers.factor_diag_router, prefix="/api")
    app.include_router(scenarios_router.router, prefix="/api")
    app.include_router(phase4_routers.stl_router, prefix="/api")
    app.include_router(phase4_routers.segments_router, prefix="/api")
    app.include_router(phase4_routers.ensemble_router, prefix="/api")
    app.include_router(phase4_routers.tx_router, prefix="/api")
    app.include_router(phase6_routers.exports_router, prefix="/api")
    app.include_router(phase6_routers.annotations_router, prefix="/api")
    app.include_router(finetune_router.router, prefix="/api")
    app.include_router(adapters_router.router, prefix="/api")
    app.include_router(model_router.router, prefix="/api")

    # Serve pre-built frontend SPA.
    # Search order:
    #   1. PyInstaller frozen bundle -> sys._MEIPASS/frontend
    #   2. Monorepo dev build -> <repo>/dist (produced by `npm run build`)
    import sys
    from pathlib import Path
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    candidates: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "frontend")
    candidates.append(Path(__file__).parent.parent.parent / "frontend" / "dist")

    static_dir: Path | None = None
    for candidate in candidates:
        if candidate.exists() and (candidate / "index.html").exists():
            static_dir = candidate
            app.mount(
                "/",
                StaticFiles(directory=str(candidate), html=True),
                name="static",
            )
            logger.info("Serving SPA from %s", candidate)
            break
    if static_dir is None:
        logger.error(
            "Frontend SPA not found. Searched: %s. The desktop window will be blank.",
            [str(c) for c in candidates],
        )
        return app

    # SPA deep-link fallback. ``StaticFiles(html=True)`` returns index.html
    # only for the root and existing directories; a refresh on /semantic/abc
    # or any other client-routed path would otherwise 404 with the bare
    # ``{"detail":"Not Found"}`` JSON. We catch GET 404s on non-API paths
    # and return index.html so React Router can pick up the route. The
    # built assets under /assets/ are intentionally NOT rewritten — a
    # missing asset is still a real 404.
    index_html = static_dir / "index.html"

    @app.middleware("http")
    async def spa_history_fallback(request: Request, call_next):
        response = await call_next(request)
        if (
            response.status_code == 404
            and request.method == "GET"
            and not request.url.path.startswith("/api/")
            and not request.url.path.startswith("/assets/")
            and "." not in request.url.path.rsplit("/", 1)[-1]
        ):
            return FileResponse(index_html)
        return response

    return app


app = create_app()
