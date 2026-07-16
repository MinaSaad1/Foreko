"""Async project stage jobs: Prepare, and later Validate, Forecast, Scenario.

Follows the existing GenericJobManager and SSE contract so interactive runs and
any future scheduled runs share one progress and failure shape.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ..deps import get_generic_jobs, get_project_db, get_registry, get_settings
from ..schemas.project import AccuracyResult, ProjectRunCreate
from ..services import (
    actuals as actuals_service,
    backtest as backtest_service,
    csv_loader,
    factor_plan,
    preparation,
    project_artifacts,
    project_forecast,
    validation_policy,
)
from ..services.forecaster import _infer_future_dates
from ..services.project_store import ProjectStore
from .projects import workflow_for as _workflow_for

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["project-jobs"])
jobs_router = APIRouter(prefix="/project-jobs", tags=["project-jobs"])


@router.post("/{project_id}/prepare", status_code=202)
async def start_prepare(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
    jobs=Depends(get_generic_jobs),
    settings=Depends(get_settings),
) -> dict:
    """Apply the current revision's recipe and write a derived artifact.

    The source dataset is never modified. The artifact is written to a temp path
    and renamed only after it validates, so a failed recipe leaves the previous
    prepared artifact in place.
    """
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(
            409, "Configure the project before preparing it: no revision exists yet."
        )

    config = project.config
    job = jobs.create("project-prepare")
    run = store.create_run(
        ProjectRunCreate(
            project_id=project_id,
            revision_no=project.current_revision,
            stage="prepare",
            job_id=job.job_id,
        )
    )
    store.start_run(run.id)

    async def _run() -> None:
        try:
            await jobs.emit_progress(job, current=1, total=4, stage="load")
            df = csv_loader.load_dataset(project.dataset_id, settings.datasets_dir)
            ids, values, dates = csv_loader.extract_series(df, config.mapping)
            if not ids:
                raise ValueError("The dataset has no series after mapping.")

            await jobs.emit_progress(job, current=2, total=4, stage="transform")
            prepared_values: dict[str, list[float]] = {}
            offsets: dict[str, int] = {}
            notes: list[str] = []
            failures: list[dict[str, str]] = []

            for series_id, series_values, series_dates in zip(ids, values, dates):
                if job.stop_event.is_set():
                    return
                try:
                    prepared = preparation.prepare_series(
                        np.asarray(series_values, dtype=float),
                        list(config.preparation_steps),
                        dates=series_dates,
                    )
                except preparation.PreparationError as exc:
                    # Name the series. A recipe that is invalid for one series
                    # is the single most common preparation failure, and the
                    # user cannot act on "log failed" alone.
                    failures.append({"series_id": series_id, "reason": str(exc)})
                    continue
                prepared_values[series_id] = [float(v) for v in prepared.values]
                offsets[series_id] = prepared.history_offset
                notes.extend(f"{series_id}: {note}" for note in prepared.notes)

            if failures and not prepared_values:
                raise ValueError(
                    "The recipe could not be applied to any series. "
                    + failures[0]["reason"]
                )

            await jobs.emit_progress(job, current=3, total=4, stage="validate")
            fingerprint = project_artifacts.recipe_hash(
                project.dataset_id,
                [s.model_dump() for s in config.preparation_steps],
            )

            await jobs.emit_progress(job, current=4, total=4, stage="persist")
            artifact = (
                project_artifacts.derived_dir(settings.storage_dir, project_id)
                / f"{fingerprint}.json"
            )
            project_artifacts.atomic_write_json(
                artifact,
                {
                    "recipe_hash": fingerprint,
                    "series": prepared_values,
                    "history_offsets": offsets,
                },
            )

            if job.stop_event.is_set():
                return

            summary = {
                "series_count": len(prepared_values),
                "row_count": sum(len(v) for v in prepared_values.values()),
                "recipe_hash": fingerprint,
                "notes": notes,
                "failures": failures,
            }
            store.finish_run(run.id, str(artifact), summary)
            await jobs.finish(job, summary)
        except Exception as exc:  # noqa: BLE001 - reported to the user verbatim
            logger.exception("Prepare failed for project %s", project_id)
            store.fail_run(run.id, str(exc))
            await jobs.fail(job, str(exc))

    asyncio.create_task(_run())
    return {"job_id": job.job_id, "run_id": run.id, "status": "running"}


def _serialize_metrics(metrics: validation_policy.MetricSet) -> dict:
    return {
        "mase": metrics.mase,
        "wape": metrics.wape,
        "smape": metrics.smape,
        "rmse": metrics.rmse,
        "bias_pct": metrics.bias_pct,
        "coverage_p10_p90": metrics.coverage_p10_p90,
        "warnings": list(metrics.warnings),
    }


def _serialize_validation(result: validation_policy.ValidationResult) -> dict:
    return {
        "primary_metric": result.primary_metric,
        "portfolio_metrics": _serialize_metrics(result.portfolio_metrics),
        "series_policies": {
            series_id: {
                "series_id": policy.series_id,
                "champion": policy.champion,
                "challenger": policy.challenger,
                "eligible": list(policy.eligible),
                "ineligible": policy.ineligible,
                "reason": policy.reason,
                "ensemble_weights": policy.ensemble_weights,
                "metrics": {
                    model: _serialize_metrics(m) for model, m in policy.metrics.items()
                },
            }
            for series_id, policy in result.series_policies.items()
        },
        "failures": [
            {
                "model": f.model,
                "fold": f.fold,
                "reason": f.reason,
                "series_id": f.series_id,
            }
            for f in result.failures
        ],
    }


@router.post("/{project_id}/validate", status_code=202)
async def start_validate(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
    jobs=Depends(get_generic_jobs),
    settings=Depends(get_settings),
    registry=Depends(get_registry),
) -> dict:
    """Score every candidate over rolling folds and select a policy per series.

    This is the headline evidence: the champion comes from rolling validation,
    not a single holdout (design 14).
    """
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(409, "Configure the project before validating it.")

    workflow = _workflow_for(store, project)
    if workflow["stages"]["validate"]["status"] == "blocked":
        raise HTTPException(409, workflow["stages"]["validate"]["reason"])

    config = project.config
    job = jobs.create("project-validate")
    run = store.create_run(
        ProjectRunCreate(
            project_id=project_id,
            revision_no=project.current_revision,
            stage="validate",
            job_id=job.job_id,
        )
    )
    store.start_run(run.id)

    async def _run() -> None:
        try:
            async def progress(current, total, stage):
                await jobs.emit_progress(job, current=current, total=total, stage=stage)

            predictions, failures = await backtest_service.run_multi_series_folds(
                dataset_id=project.dataset_id,
                mapping=config.mapping,
                horizon=config.horizon,
                folds=config.folds,
                models=list(config.candidate_models),
                datasets_dir=settings.datasets_dir,
                registry=registry,
                progress_cb=progress,
                stop_event=job.stop_event,
            )
            if job.stop_event.is_set():
                return

            result = validation_policy.select_policies(
                predictions,
                failures,
                expected_folds=config.folds,
                primary_metric=config.primary_metric,
            )
            payload = _serialize_validation(result)

            artifact = (
                project_artifacts.run_dir(settings.storage_dir, project_id, run.id)
                / "validation.json"
            )
            project_artifacts.atomic_write_json(artifact, payload)

            store.finish_run(run.id, str(artifact), payload)
            await jobs.finish(job, payload)
        except Exception as exc:  # noqa: BLE001 - reported to the user verbatim
            logger.exception("Validate failed for project %s", project_id)
            store.fail_run(run.id, str(exc))
            await jobs.fail(job, str(exc))

    asyncio.create_task(_run())
    return {"job_id": job.job_id, "run_id": run.id, "status": "running"}


def _latest_validation(store: ProjectStore, project) -> dict | None:
    for run in store.list_runs(project.id):
        if (
            run.stage == "validate"
            and run.status == "done"
            and run.revision_no == project.current_revision
        ):
            return run.summary
    return None


@router.get("/{project_id}/factor-plan")
def get_factor_plan_requirements(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
    settings=Depends(get_settings),
) -> dict:
    """Which future factors the forecast needs, and for which periods.

    The Forecast stage collects these before it will run, so the user sees the
    exact gaps rather than a refusal after the fact.
    """
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(409, "Configure the project first.")

    config = project.config
    df = csv_loader.load_dataset(project.dataset_id, settings.datasets_dir)
    _ids, _values, dates = csv_loader.extract_series(df, config.mapping)
    periods = [
        str(pd.Timestamp(d).date())
        for d in _infer_future_dates(dates[0], config.horizon)
    ]

    validation = _latest_validation(store, project)
    policies = (validation or {}).get("series_policies") or {}
    required = (
        list(project_forecast.required_future_factors(config.covariate_roles, policies))
        if policies
        else list(factor_plan.required_covariates(config.covariate_roles))
    )
    ignored = sorted(set(factor_plan.required_covariates(config.covariate_roles)) - set(required))

    return {
        "periods": periods,
        "required": required,
        # Declared known-future, but no selected model can read them. Stated
        # rather than silently dropped, so the user is not left wondering why a
        # factor they mapped is not asked for.
        "ignored_by_policy": ignored,
        "roles": dict(config.covariate_roles),
        "calendar": factor_plan.generate_calendar_factors(periods),
    }


@router.post("/{project_id}/forecast", status_code=202)
async def start_forecast(
    project_id: str,
    body: dict | None = None,
    store: ProjectStore = Depends(get_project_db),
    jobs=Depends(get_generic_jobs),
    settings=Depends(get_settings),
    registry=Depends(get_registry),
) -> dict:
    """Run the baseline forecast for every series using its selected policy."""
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(409, "Configure the project before forecasting.")

    workflow = _workflow_for(store, project)
    if workflow["stages"]["forecast"]["status"] == "blocked":
        raise HTTPException(409, workflow["stages"]["forecast"]["reason"])

    validation = _latest_validation(store, project)
    if not validation or not validation.get("series_policies"):
        raise HTTPException(409, "Run validation before forecasting.")

    config = project.config
    payload = body or {}
    df = csv_loader.load_dataset(project.dataset_id, settings.datasets_dir)
    _ids, _values, dates = csv_loader.extract_series(df, config.mapping)
    periods = [
        str(pd.Timestamp(d).date())
        for d in _infer_future_dates(dates[0], config.horizon)
    ]

    # Blocked before any model runs. A missing assumption is the user's to
    # supply, and the response names every gap (design 10.3).
    consumable = project_forecast.required_future_factors(
        config.covariate_roles, validation["series_policies"]
    )
    plan_check = factor_plan.validate_factor_plan(
        roles={k: v for k, v in config.covariate_roles.items() if k in consumable},
        periods=periods,
        values=payload.get("values") or {},
        fill_policies=payload.get("fill_policies") or {},
    )
    if not plan_check.valid:
        raise HTTPException(
            409,
            {
                "message": plan_check.message,
                "missing": plan_check.missing,
                "periods": periods,
            },
        )

    try:
        materialized = factor_plan.materialize_factor_plan(
            roles={k: v for k, v in config.covariate_roles.items() if k in consumable},
            periods=periods,
            values=payload.get("values") or {},
            fill_policies=payload.get("fill_policies") or {},
        )
    except factor_plan.FactorPlanError as exc:
        raise HTTPException(409, str(exc)) from None

    job = jobs.create("project-forecast")
    run = store.create_run(
        ProjectRunCreate(
            project_id=project_id,
            revision_no=project.current_revision,
            stage="forecast",
            job_id=job.job_id,
        )
    )
    store.start_run(run.id)

    async def _run() -> None:
        try:
            async def progress(current, total, stage):
                await jobs.emit_progress(job, current=current, total=total, stage=stage)

            result = await project_forecast.run_project_forecast(
                dataset_id=project.dataset_id,
                config=config,
                series_policies=validation["series_policies"],
                datasets_dir=settings.datasets_dir,
                registry=registry,
                future_factors=materialized.values,
                progress_cb=progress,
                stop_event=job.stop_event,
            )
            if job.stop_event.is_set():
                return

            summary = result.as_dict()
            summary["assumptions"] = materialized.values
            summary["factors_used_by_model"] = list(consumable)
            summary["applied_fills"] = materialized.applied_fills
            summary["periods"] = periods

            artifact = (
                project_artifacts.run_dir(settings.storage_dir, project_id, run.id)
                / "forecast.json"
            )
            project_artifacts.atomic_write_json(artifact, summary)
            store.finish_run(run.id, str(artifact), summary)
            await jobs.finish(job, summary)
        except Exception as exc:  # noqa: BLE001 - reported to the user verbatim
            logger.exception("Forecast failed for project %s", project_id)
            store.fail_run(run.id, str(exc))
            await jobs.fail(job, str(exc))

    asyncio.create_task(_run())
    return {"job_id": job.job_id, "run_id": run.id, "status": "running"}


def _latest_forecast(store: ProjectStore, project) -> dict | None:
    for run in store.list_runs(project.id):
        if (
            run.stage == "forecast"
            and run.status == "done"
            and run.revision_no == project.current_revision
        ):
            return run.summary
    return None


@router.post("/{project_id}/scenarios/run", status_code=202)
async def start_scenario(
    project_id: str,
    body: dict,
    store: ProjectStore = Depends(get_project_db),
    jobs=Depends(get_generic_jobs),
    settings=Depends(get_settings),
    registry=Depends(get_registry),
) -> dict:
    """Run a named scenario against the same revision and policies as the baseline.

    A scenario copies the baseline plan and edits it, so a scenario run never
    changes the baseline it is compared against (design 7.3).
    """
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(409, "Configure the project first.")

    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "A scenario needs a name.")

    baseline = _latest_forecast(store, project)
    if not baseline:
        raise HTTPException(409, "Run the baseline forecast before a scenario.")

    validation = _latest_validation(store, project)
    if not validation:
        raise HTTPException(409, "Run validation before a scenario.")

    config = project.config
    periods = list(baseline.get("periods") or [])

    merged = factor_plan.copy_for_scenario(
        baseline.get("assumptions") or {}, body.get("values") or {}
    )
    plan_check = factor_plan.validate_factor_plan(
        roles=config.covariate_roles,
        periods=periods,
        values=merged,
        fill_policies=body.get("fill_policies") or {},
    )
    if not plan_check.valid:
        raise HTTPException(
            409, {"message": plan_check.message, "missing": plan_check.missing}
        )

    try:
        materialized = factor_plan.materialize_factor_plan(
            roles=config.covariate_roles,
            periods=periods,
            values=merged,
            fill_policies=body.get("fill_policies") or {},
        )
    except factor_plan.FactorPlanError as exc:
        raise HTTPException(409, str(exc)) from None

    job = jobs.create("project-scenario")
    run = store.create_run(
        ProjectRunCreate(
            project_id=project_id,
            revision_no=project.current_revision,
            stage="plan",
            job_id=job.job_id,
        )
    )
    store.start_run(run.id)

    async def _run() -> None:
        try:
            async def progress(current, total, stage):
                await jobs.emit_progress(job, current=current, total=total, stage=stage)

            result = await project_forecast.run_project_forecast(
                dataset_id=project.dataset_id,
                config=config,
                series_policies=validation["series_policies"],
                datasets_dir=settings.datasets_dir,
                registry=registry,
                future_factors=materialized.values,
                progress_cb=progress,
                stop_event=job.stop_event,
            )
            if job.stop_event.is_set():
                return

            summary = result.as_dict()
            summary["scenario_name"] = name
            summary["assumptions"] = materialized.values
            summary["applied_fills"] = materialized.applied_fills
            summary["periods"] = periods
            summary["deltas"] = project_forecast.scenario_deltas(baseline, summary)

            artifact = (
                project_artifacts.run_dir(settings.storage_dir, project_id, run.id)
                / "scenario.json"
            )
            project_artifacts.atomic_write_json(artifact, summary)
            store.finish_run(run.id, str(artifact), summary)
            await jobs.finish(job, summary)
        except Exception as exc:  # noqa: BLE001 - reported to the user verbatim
            logger.exception("Scenario failed for project %s", project_id)
            store.fail_run(run.id, str(exc))
            await jobs.fail(job, str(exc))

    asyncio.create_task(_run())
    return {"job_id": job.job_id, "run_id": run.id, "status": "running"}


@router.get("/{project_id}/scenarios")
def list_scenarios(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> list[dict]:
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    return [
        {
            "run_id": run.id,
            "name": run.summary.get("scenario_name", "Scenario"),
            "revision_no": run.revision_no,
            "created_at": run.started_at,
            "status": run.status,
            "deltas": run.summary.get("deltas"),
            "assumptions": run.summary.get("assumptions"),
            "applied_fills": run.summary.get("applied_fills", []),
        }
        for run in store.list_runs(project_id)
        if run.stage == "plan" and run.status == "done"
    ]


@router.post("/{project_id}/runs/{run_id}/issue", status_code=201)
def issue_run(
    project_id: str,
    run_id: str,
    body: dict | None = None,
    store: ProjectStore = Depends(get_project_db),
) -> dict:
    """Freeze a completed run as the forecast of record.

    Requires ``confirm_assumptions=true``: issuing is a statement about the
    future that will be scored later, so the user confirms they have reviewed
    what it assumes (design 8.3).
    """
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")

    payload = body or {}
    if not payload.get("confirm_assumptions"):
        raise HTTPException(
            409,
            "Issuing records this forecast permanently. Confirm the assumptions "
            "first with confirm_assumptions=true.",
        )

    run = store.get_run(run_id)
    if run is None or run.project_id != project_id:
        raise HTTPException(404, "Run not found for this project.")

    try:
        issued = store.issue_run(run_id, manifest=payload.get("manifest") or {})
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None
    return issued.model_dump()


@router.get("/{project_id}/issued")
def list_issued(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> list[dict]:
    if store.get_project(project_id) is None:
        raise HTTPException(404, "Project not found.")
    return [i.model_dump() for i in store.list_issued(project_id)]


@router.post("/{project_id}/actuals", status_code=201)
async def import_actuals(
    project_id: str,
    file: UploadFile = File(...),
    date_col: str | None = None,
    value_col: str | None = None,
    series_id_col: str | None = None,
    store: ProjectStore = Depends(get_project_db),
) -> dict:
    """Import what actually happened. Mutates no run and no issued forecast."""
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found.")
    if project.config is None:
        raise HTTPException(409, "Configure the project first.")

    mapping = project.config.mapping
    content = await file.read()
    try:
        rows = actuals_service.parse_actuals(
            content,
            date_col=date_col or mapping.date_col or "date",
            value_col=value_col or mapping.value_col,
            series_id_col=series_id_col or mapping.series_id_col,
            default_series_id=mapping.value_col,
        )
    except actuals_service.ActualsImportError as exc:
        raise HTTPException(422, str(exc)) from None

    fingerprint = hashlib.sha256(content).hexdigest()
    imported = store.upsert_actuals(project_id, rows, source_fingerprint=fingerprint)
    return {"imported": imported, "source_fingerprint": fingerprint}


@router.get("/{project_id}/accuracy")
def get_accuracy(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> dict:
    """Post-issue accuracy: what was issued versus what happened.

    Scored against the issued values, never against a later rerun.
    """
    if store.get_project(project_id) is None:
        raise HTTPException(404, "Project not found.")

    issued = store.latest_issued(project_id)
    if issued is None:
        return AccuracyResult(
            metric_warnings=["No forecast has been issued yet."]
        ).model_dump()

    result = actuals_service.score_issued_forecast(
        issued, store.list_actuals(project_id)
    )
    return result.model_dump()


@jobs_router.get("/{job_id}")
async def get_project_job(job_id: str, jobs=Depends(get_generic_jobs)) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    return {
        "job_id": job.job_id,
        "kind": job.kind,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
    }


@jobs_router.get("/{job_id}/events")
async def stream_project_job_events(job_id: str, jobs=Depends(get_generic_jobs)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found.")

    async def gen():
        yield f"data: {json.dumps({'type': 'state', 'status': job.status, 'progress': job.progress})}\n\n"
        if job.status == "done":
            yield f"data: {json.dumps({'type': 'done', 'result': job.result}, default=str)}\n\n"
            return
        if job.status == "error":
            yield f"data: {json.dumps({'type': 'error', 'error': job.error or 'Job failed'})}\n\n"
            return
        if job.status == "cancelled":
            yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
            return
        while job.status == "running":
            try:
                evt = await asyncio.wait_for(job._queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                yield 'data: {"type": "heartbeat"}\n\n'
                continue
            yield f"data: {json.dumps(evt, default=str)}\n\n"
            if evt.get("type") in ("done", "error", "cancelled"):
                break

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@jobs_router.post("/{job_id}/cancel")
async def cancel_project_job(job_id: str, jobs=Depends(get_generic_jobs)) -> dict:
    if not jobs.cancel(job_id):
        raise HTTPException(409, "Job is not running.")
    return {"job_id": job_id, "status": "cancelled"}
