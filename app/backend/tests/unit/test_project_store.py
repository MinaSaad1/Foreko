"""Tests for forecast project persistence."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from foreko.schemas.dataset import ColumnMapping
from foreko.schemas.project import (
    ProjectCreate,
    ProjectPatch,
    ProjectRevisionCreate,
    ProjectRunCreate,
)
from foreko.services.project_store import (
    ProjectNotFoundError,
    ProjectStore,
    get_project_store,
)
from foreko.settings import STORAGE_DIR_NAMES


def _revision(horizon: int = 12) -> ProjectRevisionCreate:
    return ProjectRevisionCreate(
        mapping=ColumnMapping(date_col="month", value_col="sales"),
        frequency="MS",
        horizon=horizon,
        preparation_steps=[],
        candidate_models=["timesfm", "lightgbm", "ets", "seasonal_naive"],
        folds=5,
        primary_metric="mase",
        covariate_roles={},
    )


@pytest.fixture()
def store(tmp_path: Path) -> ProjectStore:
    return ProjectStore(tmp_path / "foreko.db")


@pytest.mark.unit
def test_project_revision_and_archive_roundtrip(store: ProjectStore) -> None:
    project = store.create_project(
        ProjectCreate(name="MEA Demand", dataset_id="data-1", description="Monthly plan")
    )
    assert project.status == "draft"
    assert project.current_revision == 0

    revision = store.create_revision(project.id, _revision())
    assert revision.revision_no == 1

    reopened = store.get_project(project.id)
    assert reopened is not None
    assert reopened.current_revision == 1
    assert reopened.status == "ready"
    assert reopened.config == _revision()

    store.patch_project(project.id, ProjectPatch(archived=True))
    assert store.list_projects(include_archived=False) == []
    archived = store.list_projects(include_archived=True)
    assert len(archived) == 1
    assert archived[0].archived_at is not None
    assert archived[0].is_archived is True

    store.patch_project(project.id, ProjectPatch(archived=False))
    reopened_again = store.list_projects(include_archived=False)
    assert len(reopened_again) == 1
    assert reopened_again[0].is_archived is False
    assert reopened_again[0].archived_at is None


@pytest.mark.unit
def test_store_is_keyed_by_database_path(tmp_path: Path) -> None:
    a = tmp_path / "a.db"
    b = tmp_path / "b.db"
    # The same path must be cached; a different path must never be handed the
    # first store, which is what the old global singleton did.
    assert get_project_store(a) is get_project_store(a)
    assert get_project_store(a) is not get_project_store(b)


@pytest.mark.unit
def test_each_database_holds_its_own_projects(tmp_path: Path) -> None:
    first = get_project_store(tmp_path / "one.db")
    second = get_project_store(tmp_path / "two.db")
    first.create_project(ProjectCreate(name="Only In First", dataset_id="d1"))
    assert [p.name for p in first.list_projects()] == ["Only In First"]
    assert second.list_projects() == []


@pytest.mark.unit
def test_revisions_are_sequential_and_immutable(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="Plan", dataset_id="data-1"))
    first = store.create_revision(project.id, _revision(horizon=12))
    second = store.create_revision(project.id, _revision(horizon=24))

    assert (first.revision_no, second.revision_no) == (1, 2)
    assert [r.revision_no for r in store.list_revisions(project.id)] == [1, 2]

    # Revision 1 still describes the horizon it was created with.
    stored_first = store.get_revision(project.id, 1)
    assert stored_first is not None
    assert stored_first.config.horizon == 12
    assert store.get_project(project.id).config.horizon == 24


@pytest.mark.unit
def test_revision_rejects_unknown_preparation_step() -> None:
    with pytest.raises(ValidationError):
        ProjectRevisionCreate.model_validate(
            {
                "mapping": {"date_col": "month", "value_col": "sales"},
                "frequency": "MS",
                "horizon": 12,
                "preparation_steps": [{"kind": "bogus"}],
                "candidate_models": ["timesfm"],
                "covariate_roles": {},
            }
        )


@pytest.mark.unit
def test_revision_rejects_unknown_covariate_role() -> None:
    with pytest.raises(ValidationError):
        ProjectRevisionCreate.model_validate(
            {
                "mapping": {"date_col": "month", "value_col": "sales"},
                "frequency": "MS",
                "horizon": 12,
                "preparation_steps": [],
                "candidate_models": ["timesfm"],
                "covariate_roles": {"price": "not_a_role"},
            }
        )


@pytest.mark.unit
def test_delete_cascades_to_revisions_and_runs(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="Plan", dataset_id="data-1"))
    store.create_revision(project.id, _revision())
    store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="prepare")
    )

    assert store.delete_project(project.id) is True
    assert store.get_project(project.id) is None
    assert store.list_revisions(project.id) == []
    assert store.list_runs(project.id) == []
    assert store.delete_project(project.id) is False


@pytest.mark.unit
def test_run_lifecycle(store: ProjectStore) -> None:
    project = store.create_project(ProjectCreate(name="Plan", dataset_id="data-1"))
    store.create_revision(project.id, _revision())

    run = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="validate")
    )
    assert run.status == "queued"
    assert run.completed_at is None

    finished = store.finish_run(run.id, "runs/abc/result.json", {"folds": 5})
    assert finished.status == "done"
    assert finished.completed_at is not None
    assert finished.summary == {"folds": 5}

    other = store.create_run(
        ProjectRunCreate(project_id=project.id, revision_no=1, stage="forecast")
    )
    cancelled = store.fail_run(other.id, "stopped by user", cancelled=True)
    assert cancelled.status == "cancelled"
    assert cancelled.error == "stopped by user"


@pytest.mark.unit
def test_mutations_on_missing_project_raise(store: ProjectStore) -> None:
    with pytest.raises(ProjectNotFoundError):
        store.patch_project("does-not-exist", ProjectPatch(name="x"))
    with pytest.raises(ProjectNotFoundError):
        store.create_revision("does-not-exist", _revision())
    with pytest.raises(ProjectNotFoundError):
        store.create_run(
            ProjectRunCreate(project_id="does-not-exist", revision_no=1, stage="prepare")
        )


@pytest.mark.unit
def test_projects_dir_is_created_and_wipeable(tmp_path: Path) -> None:
    from foreko.routers.system import _WIPEABLE_DIRS
    from foreko.settings import Settings

    settings = Settings(storage_dir=tmp_path)
    settings.ensure_dirs()

    assert settings.projects_dir.is_dir()
    # A directory that ensure_dirs creates but the wipe misses would leak user
    # data past an explicit wipe.
    assert "projects" in STORAGE_DIR_NAMES
    assert tuple(_WIPEABLE_DIRS) == STORAGE_DIR_NAMES
