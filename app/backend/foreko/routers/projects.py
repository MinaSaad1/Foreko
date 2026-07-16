"""Project CRUD, revisions, and workflow state.

Synchronous metadata only. Prepare, Validate, Forecast, and Scenario execution
run as async jobs and live in ``routers.project_jobs``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..deps import get_project_db
from ..schemas.project import (
    ProjectCreate,
    ProjectDetail,
    ProjectPatch,
    ProjectRevision,
    ProjectRevisionCreate,
    ProjectRun,
    ProjectSummary,
)
from ..services.project_store import ProjectNotFoundError, ProjectStore
from ..services.project_workflow import (
    STAGE_ORDER,
    WorkflowState,
    compute_workflow_state,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _require_project(store: ProjectStore, project_id: str) -> ProjectDetail:
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("", response_model=list[ProjectSummary])
def list_projects(
    include_archived: bool = False,
    store: ProjectStore = Depends(get_project_db),
) -> list[ProjectSummary]:
    return store.list_projects(include_archived=include_archived)


@router.post("", response_model=ProjectDetail, status_code=201)
def create_project(
    request: ProjectCreate,
    store: ProjectStore = Depends(get_project_db),
) -> ProjectDetail:
    return store.create_project(request)


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> ProjectDetail:
    return _require_project(store, project_id)


@router.patch("/{project_id}", response_model=ProjectDetail)
def patch_project(
    project_id: str,
    request: ProjectPatch,
    store: ProjectStore = Depends(get_project_db),
) -> ProjectDetail:
    try:
        return store.patch_project(project_id, request)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found.") from None


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    confirm: bool = False,
    store: ProjectStore = Depends(get_project_db),
) -> Response:
    """Permanently delete a project and its artifacts.

    Requires ``?confirm=true``. Without it nothing is read or written, so a
    DELETE issued by mistake cannot destroy a project. The source dataset is
    never touched.
    """
    _require_project(store, project_id)
    if not confirm:
        raise HTTPException(
            status_code=409,
            detail="Deleting a project is permanent. Retry with confirm=true.",
        )
    store.delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/revisions", response_model=list[ProjectRevision])
def list_revisions(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> list[ProjectRevision]:
    _require_project(store, project_id)
    return store.list_revisions(project_id)


@router.post("/{project_id}/revisions", response_model=ProjectRevision, status_code=201)
def create_revision(
    project_id: str,
    request: ProjectRevisionCreate,
    store: ProjectStore = Depends(get_project_db),
) -> ProjectRevision:
    try:
        return store.create_revision(project_id, request)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found.") from None


@router.get("/{project_id}/runs", response_model=list[ProjectRun])
def list_runs(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> list[ProjectRun]:
    _require_project(store, project_id)
    return store.list_runs(project_id)


@router.get("/{project_id}/workflow")
def get_workflow(
    project_id: str,
    store: ProjectStore = Depends(get_project_db),
) -> dict:
    project = _require_project(store, project_id)
    runs = store.list_runs(project_id)

    # list_runs is newest first, so the first hit per stage is the latest.
    latest: dict[str, ProjectRun] = {}
    for run in runs:
        latest.setdefault(run.stage, run)

    state: WorkflowState = compute_workflow_state(
        project_id=project_id,
        current_revision=project.current_revision,
        latest_runs=latest,
        issued_revision=None,
        actuals_updated_at=None,
    )
    return {
        "project_id": state.project_id,
        "revision": state.revision,
        "next_stage": state.next_stage(),
        "stages": {
            stage: {
                "stage": state.stages[stage].stage,
                "status": state.stages[stage].status,
                "reason": state.stages[stage].reason,
                "run_id": state.stages[stage].run_id,
            }
            for stage in STAGE_ORDER
        },
    }
