"""Stage readiness and downstream invalidation for the Forecast Studio.

Orchestration only. This module decides which stage the user can enter and what
a change invalidates. It runs no model, writes no SQL, and transforms no data.

The rule it enforces everywhere: a stage is current only when its completed run
was produced by the project's current revision. Anything older is stale, which
is why changing an upstream configuration invalidates what came after it without
deleting the immutable runs that produced it.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from ..schemas.project import ProjectRun, ProjectStage


StageStatus = Literal["not_started", "needs_attention", "ready", "complete", "blocked"]

# Stage order and dependency, as data rather than nested conditionals. Each
# stage depends on the one before it; Review depends on an issued forecast
# instead, because accuracy is scored against what was issued, not against the
# latest run.
STAGE_ORDER: tuple[ProjectStage, ...] = (
    "prepare",
    "validate",
    "forecast",
    "plan",
    "review",
)

_DEPENDS_ON: Mapping[ProjectStage, ProjectStage | None] = {
    "prepare": None,
    "validate": "prepare",
    "forecast": "validate",
    "plan": "forecast",
    "review": None,
}


@dataclass(frozen=True)
class StageState:
    stage: ProjectStage
    status: StageStatus
    reason: str
    run_id: str | None = None


@dataclass(frozen=True)
class WorkflowState:
    project_id: str
    revision: int
    stages: dict[ProjectStage, StageState]

    @property
    def prepare(self) -> StageState:
        return self.stages["prepare"]

    @property
    def validate(self) -> StageState:
        return self.stages["validate"]

    @property
    def forecast(self) -> StageState:
        return self.stages["forecast"]

    @property
    def plan(self) -> StageState:
        return self.stages["plan"]

    @property
    def review(self) -> StageState:
        return self.stages["review"]

    def next_stage(self) -> ProjectStage | None:
        """First stage that is not complete, which is what Continue links to."""
        for stage in STAGE_ORDER:
            if self.stages[stage].status != "complete":
                return stage
        return None


def _is_current(run: ProjectRun | None, revision: int) -> bool:
    return (
        run is not None and run.status == "done" and run.revision_no == revision
    )


def compute_workflow_state(
    *,
    project_id: str = "",
    current_revision: int,
    latest_runs: Mapping[str, ProjectRun],
    issued_revision: int | None,
    actuals_updated_at: str | None,
) -> WorkflowState:
    """Derive every stage's state from the runs that exist.

    ``latest_runs`` maps a stage name to the most recent run for that stage,
    whatever its status or revision. A run from an older revision is evidence
    that the stage ran, not that it is current.
    """

    stages: dict[ProjectStage, StageState] = {}

    for stage in STAGE_ORDER:
        if stage == "review":
            stages[stage] = _review_state(
                latest_runs.get("forecast"),
                current_revision=current_revision,
                issued_revision=issued_revision,
                actuals_updated_at=actuals_updated_at,
            )
            continue

        run = latest_runs.get(stage)
        dependency = _DEPENDS_ON[stage]

        if dependency is not None and stages[dependency].status != "complete":
            stages[stage] = StageState(
                stage=stage,
                status="blocked",
                reason=f"{dependency.capitalize()} must complete first.",
            )
            continue

        if _is_current(run, current_revision):
            stages[stage] = StageState(
                stage=stage,
                status="complete",
                reason="Complete for the current revision.",
                run_id=run.id if run else None,
            )
            continue

        if run is not None and run.status == "running":
            stages[stage] = StageState(
                stage=stage, status="needs_attention", reason="A run is in progress.",
                run_id=run.id,
            )
            continue

        if run is not None and run.status == "error":
            stages[stage] = StageState(
                stage=stage,
                status="needs_attention",
                reason="The last run failed. Review the error and run it again.",
                run_id=run.id,
            )
            continue

        if run is not None and run.status == "done":
            # The run succeeded, but against an older revision. The result is
            # kept and stays visible; it just is not the current answer.
            stages[stage] = StageState(
                stage=stage,
                status="not_started",
                reason=(
                    f"The last result used revision {run.revision_no}. "
                    f"Run again for revision {current_revision}."
                ),
                run_id=run.id,
            )
            continue

        stages[stage] = StageState(
            stage=stage, status="not_started", reason="Not started yet."
        )

    return WorkflowState(
        project_id=project_id, revision=current_revision, stages=stages
    )


def _review_state(
    forecast_run: ProjectRun | None,
    *,
    current_revision: int,
    issued_revision: int | None,
    actuals_updated_at: str | None,
) -> StageState:
    if issued_revision is None:
        return StageState(
            stage="review",
            status="blocked",
            reason="Issue a forecast before it can be reviewed.",
        )
    if issued_revision != current_revision:
        # The issued forecast itself stays immutable and scoreable on the
        # Accuracy page. It is the Studio's Review stage that is stale, because
        # nothing has been issued for the configuration now being edited.
        return StageState(
            stage="review",
            status="blocked",
            reason=(
                f"The issued forecast used revision {issued_revision}. "
                f"Issue a forecast for revision {current_revision} to review it."
            ),
        )
    if actuals_updated_at is None:
        return StageState(
            stage="review",
            status="ready",
            reason="Import actuals to score the issued forecast.",
        )
    return StageState(
        stage="review",
        status="complete",
        reason="Actuals imported and scored against the issued forecast.",
    )


__all__ = [
    "STAGE_ORDER",
    "StageState",
    "StageStatus",
    "WorkflowState",
    "compute_workflow_state",
]
