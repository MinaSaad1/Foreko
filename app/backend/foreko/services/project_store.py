"""SQLite persistence for forecast projects, revisions, and runs.

Metadata only. Large artifacts live on disk under the project directory and are
referenced here by path and hash. See :mod:`foreko.services.project_artifacts`.

The schema itself is owned by :mod:`foreko.services.migrations` (migration 2).
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from ..schemas.project import (
    ProjectCreate,
    ProjectDetail,
    ProjectPatch,
    ProjectRevision,
    ProjectRevisionCreate,
    ProjectRun,
    ProjectRunCreate,
    ProjectStatus,
    ProjectSummary,
)
from .migrations import run_migrations


_db_lock = threading.Lock()

# Separate from _db_lock: the store registry is guarded while ProjectStore's
# constructor is itself taking _db_lock to migrate, and Lock is not reentrant.
_registry_lock = threading.Lock()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _gen_id() -> str:
    return uuid.uuid4().hex


def _status(current_revision: int) -> ProjectStatus:
    return "ready" if current_revision >= 1 else "draft"


class ProjectNotFoundError(LookupError):
    """Raised when a mutation targets a project that does not exist."""


class ProjectStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with _db_lock:
            run_migrations(self.db_path)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=10.0, isolation_level=None)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            # Required for the ON DELETE CASCADE that removes a project's
            # revisions, runs, issued forecasts, and actuals.
            conn.execute("PRAGMA foreign_keys=ON")
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            conn.close()

    # ---------- projects ----------

    def create_project(self, request: ProjectCreate) -> ProjectDetail:
        project_id = _gen_id()
        now = _now()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO projects "
                "(id, name, description, dataset_id, created_at, updated_at, "
                " archived_at, current_revision) "
                "VALUES (?, ?, ?, ?, ?, ?, NULL, 0)",
                (
                    project_id,
                    request.name,
                    request.description,
                    request.dataset_id,
                    now,
                    now,
                ),
            )
        detail = self.get_project(project_id)
        if detail is None:  # pragma: no cover - insert just succeeded
            raise ProjectNotFoundError(project_id)
        return detail

    def list_projects(self, *, include_archived: bool = False) -> list[ProjectSummary]:
        sql = "SELECT * FROM projects"
        if not include_archived:
            sql += " WHERE archived_at IS NULL"
        sql += " ORDER BY updated_at DESC"
        with self._conn() as c:
            rows = c.execute(sql).fetchall()
        return [_summary_from_row(r) for r in rows]

    def get_project(self, project_id: str) -> ProjectDetail | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if row is None:
                return None
            config_row = c.execute(
                "SELECT config_json FROM project_revisions "
                "WHERE project_id=? AND revision_no=?",
                (project_id, row["current_revision"]),
            ).fetchone()
        config = (
            ProjectRevisionCreate.model_validate_json(config_row["config_json"])
            if config_row is not None
            else None
        )
        return ProjectDetail(**_summary_fields(row), config=config)

    def patch_project(self, project_id: str, request: ProjectPatch) -> ProjectDetail:
        sets: list[str] = []
        params: list[Any] = []
        if request.name is not None:
            sets.append("name=?")
            params.append(request.name)
        if request.description is not None:
            sets.append("description=?")
            params.append(request.description)
        if request.archived is not None:
            sets.append("archived_at=?")
            params.append(_now() if request.archived else None)

        with _db_lock, self._conn() as c:
            exists = c.execute(
                "SELECT 1 FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if exists is None:
                raise ProjectNotFoundError(project_id)
            if sets:
                sets.append("updated_at=?")
                params.append(_now())
                params.append(project_id)
                c.execute(
                    f"UPDATE projects SET {', '.join(sets)} WHERE id=?",
                    tuple(params),
                )
        detail = self.get_project(project_id)
        if detail is None:  # pragma: no cover - existence checked above
            raise ProjectNotFoundError(project_id)
        return detail

    def delete_project(self, project_id: str) -> bool:
        with _db_lock, self._conn() as c:
            cur = c.execute("DELETE FROM projects WHERE id=?", (project_id,))
            return cur.rowcount > 0

    # ---------- revisions ----------

    def create_revision(
        self, project_id: str, request: ProjectRevisionCreate
    ) -> ProjectRevision:
        revision_id = _gen_id()
        now = _now()
        with _db_lock, self._conn() as c:
            row = c.execute(
                "SELECT current_revision FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if row is None:
                raise ProjectNotFoundError(project_id)
            revision_no = int(row["current_revision"]) + 1
            try:
                c.execute("BEGIN IMMEDIATE")
                c.execute(
                    "INSERT INTO project_revisions "
                    "(id, project_id, revision_no, created_at, config_json) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        revision_id,
                        project_id,
                        revision_no,
                        now,
                        request.model_dump_json(),
                    ),
                )
                c.execute(
                    "UPDATE projects SET current_revision=?, updated_at=? WHERE id=?",
                    (revision_no, now, project_id),
                )
                c.execute("COMMIT")
            except sqlite3.Error:
                if c.in_transaction:
                    c.execute("ROLLBACK")
                raise
        return ProjectRevision(
            id=revision_id,
            project_id=project_id,
            revision_no=revision_no,
            created_at=now,
            config=request,
        )

    def list_revisions(self, project_id: str) -> list[ProjectRevision]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM project_revisions WHERE project_id=? "
                "ORDER BY revision_no ASC",
                (project_id,),
            ).fetchall()
        return [_revision_from_row(r) for r in rows]

    def get_revision(self, project_id: str, revision_no: int) -> ProjectRevision | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM project_revisions WHERE project_id=? AND revision_no=?",
                (project_id, revision_no),
            ).fetchone()
        return _revision_from_row(row) if row is not None else None

    # ---------- runs ----------

    def create_run(self, request: ProjectRunCreate) -> ProjectRun:
        run_id = _gen_id()
        now = _now()
        with _db_lock, self._conn() as c:
            exists = c.execute(
                "SELECT 1 FROM projects WHERE id=?", (request.project_id,)
            ).fetchone()
            if exists is None:
                raise ProjectNotFoundError(request.project_id)
            c.execute(
                "INSERT INTO project_runs "
                "(id, project_id, revision_no, stage, status, job_id, started_at) "
                "VALUES (?, ?, ?, ?, 'queued', ?, ?)",
                (
                    run_id,
                    request.project_id,
                    request.revision_no,
                    request.stage,
                    request.job_id,
                    now,
                ),
            )
        run = self.get_run(run_id)
        if run is None:  # pragma: no cover - insert just succeeded
            raise LookupError(run_id)
        return run

    def get_run(self, run_id: str) -> ProjectRun | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM project_runs WHERE id=?", (run_id,)
            ).fetchone()
        return _run_from_row(row) if row is not None else None

    def start_run(self, run_id: str) -> ProjectRun:
        return self._set_run_status(run_id, "running")

    def finish_run(
        self,
        run_id: str,
        artifact_path: str | None,
        summary: dict[str, Any],
    ) -> ProjectRun:
        with _db_lock, self._conn() as c:
            cur = c.execute(
                "UPDATE project_runs SET status='done', completed_at=?, "
                "artifact_path=?, summary_json=? WHERE id=?",
                (_now(), artifact_path, json.dumps(summary, default=str), run_id),
            )
            if cur.rowcount == 0:
                raise LookupError(run_id)
        return self._require_run(run_id)

    def fail_run(self, run_id: str, error: str, *, cancelled: bool = False) -> ProjectRun:
        with _db_lock, self._conn() as c:
            cur = c.execute(
                "UPDATE project_runs SET status=?, completed_at=?, error=? WHERE id=?",
                ("cancelled" if cancelled else "error", _now(), error, run_id),
            )
            if cur.rowcount == 0:
                raise LookupError(run_id)
        return self._require_run(run_id)

    def list_runs(self, project_id: str) -> list[ProjectRun]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM project_runs WHERE project_id=? "
                "ORDER BY started_at DESC, rowid DESC",
                (project_id,),
            ).fetchall()
        return [_run_from_row(r) for r in rows]

    def _set_run_status(self, run_id: str, status: str) -> ProjectRun:
        with _db_lock, self._conn() as c:
            cur = c.execute(
                "UPDATE project_runs SET status=? WHERE id=?", (status, run_id)
            )
            if cur.rowcount == 0:
                raise LookupError(run_id)
        return self._require_run(run_id)

    def _require_run(self, run_id: str) -> ProjectRun:
        run = self.get_run(run_id)
        if run is None:  # pragma: no cover - caller just updated it
            raise LookupError(run_id)
        return run


def _summary_fields(row: sqlite3.Row) -> dict[str, Any]:
    current_revision = int(row["current_revision"])
    archived_at = row["archived_at"]
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "dataset_id": row["dataset_id"],
        "status": _status(current_revision),
        "current_revision": current_revision,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "archived_at": archived_at,
        "is_archived": archived_at is not None,
    }


def _summary_from_row(row: sqlite3.Row) -> ProjectSummary:
    return ProjectSummary(**_summary_fields(row))


def _revision_from_row(row: sqlite3.Row) -> ProjectRevision:
    return ProjectRevision(
        id=row["id"],
        project_id=row["project_id"],
        revision_no=int(row["revision_no"]),
        created_at=row["created_at"],
        config=ProjectRevisionCreate.model_validate_json(row["config_json"]),
    )


def _run_from_row(row: sqlite3.Row) -> ProjectRun:
    return ProjectRun(
        id=row["id"],
        project_id=row["project_id"],
        revision_no=int(row["revision_no"]),
        stage=row["stage"],
        status=row["status"],
        job_id=row["job_id"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        artifact_path=row["artifact_path"],
        summary=json.loads(row["summary_json"]),
        error=row["error"],
    )


_stores: dict[Path, ProjectStore] = {}


def get_project_store(db_path: Path) -> ProjectStore:
    """Return the store for *db_path*, one instance per resolved path.

    Keyed by path rather than a single global so a test pointing at its own
    tmp_path database cannot be handed another test's store.
    """
    resolved = Path(db_path).resolve()
    with _registry_lock:
        store = _stores.get(resolved)
        if store is None:
            store = ProjectStore(resolved)
            _stores[resolved] = store
        return store


__all__ = ["ProjectNotFoundError", "ProjectStore", "get_project_store"]
