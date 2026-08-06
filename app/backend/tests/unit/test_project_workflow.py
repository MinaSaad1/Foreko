"""Tests for Studio stage readiness and downstream invalidation.

These pin design section 7.3 rule by rule. The property under test everywhere is
that a stage is current only when its completed run used the current revision.
"""

from __future__ import annotations

import pytest

from tempolith.schemas.project import ProjectRun, ProjectStage
from tempolith.services.project_workflow import compute_workflow_state


def run(
    *,
    revision: int,
    stage: ProjectStage = "prepare",
    status: str = "done",
    run_id: str = "run-1",
) -> ProjectRun:
    return ProjectRun(
        id=run_id,
        project_id="p1",
        revision_no=revision,
        stage=stage,
        status=status,  # type: ignore[arg-type]
        started_at="2026-07-16T10:00:00Z",
        completed_at="2026-07-16T10:01:00Z" if status == "done" else None,
    )


def _all_current(revision: int) -> dict[str, ProjectRun]:
    return {
        stage: run(revision=revision, stage=stage, run_id=f"run-{stage}")
        for stage in ("prepare", "validate", "forecast", "plan")
    }


@pytest.mark.unit
def test_empty_project_starts_at_prepare() -> None:
    state = compute_workflow_state(
        current_revision=1,
        latest_runs={},
        issued_revision=None,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "not_started"
    assert state.validate.status == "blocked"
    assert state.review.status == "blocked"
    assert state.next_stage() == "prepare"


@pytest.mark.unit
def test_project_without_a_revision_blocks_prepare_with_the_reason() -> None:
    # "Not started yet" would invite the user to press a button that can only
    # refuse. The stage has to name the missing configuration instead.
    state = compute_workflow_state(
        current_revision=0,
        latest_runs={},
        issued_revision=None,
        actuals_updated_at=None,
        has_config=False,
    )
    assert state.prepare.status == "blocked"
    assert "Configure the project" in state.prepare.reason
    assert state.validate.status == "blocked"
    assert state.next_stage() == "prepare"


@pytest.mark.unit
def test_preparation_change_invalidates_downstream() -> None:
    state = compute_workflow_state(
        current_revision=3,
        latest_runs=_all_current(2),
        issued_revision=2,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "not_started"
    assert state.validate.status == "blocked"
    assert state.forecast.status == "blocked"
    assert state.plan.status == "blocked"
    assert state.review.status == "blocked"


@pytest.mark.unit
def test_stale_run_is_kept_and_named_not_deleted() -> None:
    state = compute_workflow_state(
        current_revision=3,
        latest_runs=_all_current(2),
        issued_revision=None,
        actuals_updated_at=None,
    )
    # Invalidation must not lose the run. It stays linked and explains itself.
    assert state.prepare.run_id == "run-prepare"
    assert "revision 2" in state.prepare.reason
    assert "revision 3" in state.prepare.reason


@pytest.mark.unit
def test_stages_complete_in_order_for_the_current_revision() -> None:
    state = compute_workflow_state(
        current_revision=1,
        latest_runs=_all_current(1),
        issued_revision=None,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "complete"
    assert state.validate.status == "complete"
    assert state.forecast.status == "complete"
    assert state.plan.status == "complete"
    # Nothing issued yet, so Review cannot open.
    assert state.review.status == "blocked"
    assert state.next_stage() == "review"


@pytest.mark.unit
def test_validate_blocked_until_prepare_completes() -> None:
    state = compute_workflow_state(
        current_revision=1,
        latest_runs={"prepare": run(revision=1, stage="prepare", status="running")},
        issued_revision=None,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "needs_attention"
    assert state.validate.status == "blocked"


@pytest.mark.unit
def test_failed_run_needs_attention_rather_than_silently_restarting() -> None:
    state = compute_workflow_state(
        current_revision=1,
        latest_runs={"prepare": run(revision=1, stage="prepare", status="error")},
        issued_revision=None,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "needs_attention"
    assert "failed" in state.prepare.reason


@pytest.mark.unit
def test_review_opens_once_a_forecast_is_issued_for_this_revision() -> None:
    state = compute_workflow_state(
        current_revision=1,
        latest_runs=_all_current(1),
        issued_revision=1,
        actuals_updated_at=None,
    )
    assert state.review.status == "ready"
    assert "actuals" in state.review.reason


@pytest.mark.unit
def test_new_actuals_complete_review_only() -> None:
    before = compute_workflow_state(
        current_revision=1,
        latest_runs=_all_current(1),
        issued_revision=1,
        actuals_updated_at=None,
    )
    after = compute_workflow_state(
        current_revision=1,
        latest_runs=_all_current(1),
        issued_revision=1,
        actuals_updated_at="2026-08-01T00:00:00Z",
    )
    assert before.review.status == "ready"
    assert after.review.status == "complete"
    # Actuals must not disturb any earlier stage.
    for stage in ("prepare", "validate", "forecast", "plan"):
        assert before.stages[stage] == after.stages[stage]


@pytest.mark.unit
def test_a_cancelled_run_does_not_count_as_complete() -> None:
    state = compute_workflow_state(
        current_revision=1,
        latest_runs={"prepare": run(revision=1, stage="prepare", status="cancelled")},
        issued_revision=None,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "not_started"
    assert state.validate.status == "blocked"
