# Tempolith V2.0 Forecast Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete local Forecast Projects workflow from project creation through preparation, rolling validation, forecasting, scenario planning, issuance, actuals import, and post-issue accuracy.

**Architecture:** Add an additive project domain beside the existing V1 analyses. SQLite stores versioned metadata and immutable run manifests, while large artifacts remain under `~/.tempolith/projects/<project_id>/`. The React application becomes project-first through a Forecast Studio shell, while existing forecasting services remain the execution engines behind new orchestration boundaries.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic, sqlite3, pandas, NumPy, SciPy, TimesFM 2.5, LightGBM, React 18, TypeScript, TanStack Query, Zustand, Tailwind, ECharts, pytest, Vitest, Playwright.

## Global Constraints

- All data remains local under `TEMPOLITH_STORAGE_DIR`; add no telemetry, account, remote log, or hosted API.
- Keep TimesFM and LightGBM as the primary engines; add no foundation model.
- Keep V1 routes working throughout the migration.
- Use MASE as the default selection metric; MAPE is informational only.
- Multi-series selection is independent per series in V2.0; hierarchy reconciliation is not part of this plan.
- Never silently fabricate required future covariates.
- An issued forecast is immutable.
- Use existing async jobs and SSE for Prepare, Validate, Forecast, and Scenario runs.
- User-facing copy contains no em dashes.
- Every task follows TDD and ends with a focused commit.

---

## File responsibility map

### Backend domain and persistence

- `app/backend/tempolith/schemas/project.py`: all public project, revision, run, factor-plan, issue, actual, and accuracy wire types.
- `app/backend/tempolith/services/project_store.py`: additive SQLite schema and metadata CRUD only.
- `app/backend/tempolith/services/project_artifacts.py`: safe project paths, fingerprints, atomic JSON and Parquet artifacts, and project cleanup.
- `app/backend/tempolith/services/project_workflow.py`: stage readiness and downstream invalidation only.
- `app/backend/tempolith/services/preparation.py`: recipe validation, preparation execution, inverse-transform metadata, and derived cache.
- `app/backend/tempolith/services/validation_policy.py`: folds, metrics, per-series eligibility, selection, and result aggregation.
- `app/backend/tempolith/services/ensemble_policy.py`: constrained out-of-fold ensemble weights and promotion guardrails.
- `app/backend/tempolith/services/factor_plan.py`: covariate roles, baseline plan alignment, fill-policy enforcement, and scenario copies.
- `app/backend/tempolith/services/actuals.py`: actual import, issued-value matching, and post-issue metrics.
- `app/backend/tempolith/routers/projects.py`: project CRUD and synchronous metadata endpoints.
- `app/backend/tempolith/routers/project_jobs.py`: Prepare, Validate, Forecast, Scenario, issue, actuals, accuracy, SSE, and cancellation endpoints.

### Frontend project experience

- `app/frontend/src/types/project.ts`: exact TypeScript mirrors of project API schemas.
- `app/frontend/src/api/projects.ts`: project-specific API calls and SSE URLs.
- `app/frontend/src/stores/projectStore.ts`: active project id, active Studio stage, table preferences, and unsaved factor-grid draft only.
- `app/frontend/src/hooks/useProject.ts`: project and revision queries and mutations.
- `app/frontend/src/hooks/useProjectJob.ts`: generic project-job SSE lifecycle.
- `app/frontend/src/pages/ProjectsPage.tsx`: library, archive filter, create entry point, and empty state.
- `app/frontend/src/pages/ProjectOverviewPage.tsx`: health, current revision, latest run, and next action.
- `app/frontend/src/pages/ForecastStudioPage.tsx`: stage shell and route synchronization.
- `app/frontend/src/pages/ProjectRunsPage.tsx`: immutable run history and manifest drawer.
- `app/frontend/src/pages/ProjectScenariosPage.tsx`: named scenario list and comparison.
- `app/frontend/src/pages/ProjectAccuracyPage.tsx`: issued forecast coverage and post-issue metrics.
- `app/frontend/src/components/project/`: small project navigation, status, stage, leaderboard, factor-grid, and review components.

---

### Task 1: Add the project schema, additive migration, and project metadata store

**Files:**
- Create: `app/backend/tempolith/schemas/project.py`
- Create: `app/backend/tempolith/services/project_store.py`
- Create: `app/backend/tempolith/services/project_artifacts.py`
- Create: `app/backend/tests/unit/test_project_store.py`
- Modify: `app/backend/tempolith/services/store.py:86-311`
- Modify: `app/backend/tempolith/deps.py:45-52`
- Modify: `app/backend/tempolith/settings.py`

**Interfaces:**
- Consumes: `Settings.db_path`, `Settings.storage_dir`, `ColumnMapping`, existing safe path-segment validation.
- Produces: `ProjectStore`, `ProjectCreate`, `ProjectPatch`, `ProjectDetail`, `ProjectRevisionCreate`, `ProjectRevision`, `ProjectRun`, `project_dir()`, `dataset_fingerprint()`, `atomic_write_json()`.

- [ ] **Step 1: Write failing project-store tests**

```python
def test_project_revision_and_archive_roundtrip(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "tempolith.db")
    project = store.create_project(
        ProjectCreate(name="MEA Demand", dataset_id="data-1", description="Monthly plan")
    )
    revision = store.create_revision(
        project.id,
        ProjectRevisionCreate(
            mapping=ColumnMapping(date_col="month", value_col="sales"),
            frequency="MS",
            horizon=12,
            preparation_steps=[],
            candidate_models=["timesfm", "lightgbm", "ets", "seasonal_naive"],
            folds=5,
            primary_metric="mase",
            covariate_roles={},
        ),
    )
    assert revision.revision_no == 1
    assert store.get_project(project.id).current_revision == 1
    store.patch_project(project.id, ProjectPatch(archived=True))
    assert store.list_projects(include_archived=False) == []
    assert store.list_projects(include_archived=True)[0].archived_at is not None
```

```python
def test_store_is_keyed_by_database_path(tmp_path: Path) -> None:
    first = get_project_store(tmp_path / "a.db")
    second = get_project_store(tmp_path / "b.db")
    assert first is not second
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run: `uv run pytest app/backend/tests/unit/test_project_store.py -q`

Expected: collection fails with `ModuleNotFoundError: No module named 'tempolith.services.project_store'`.

- [ ] **Step 3: Define strict project schemas**

```python
ProjectStage = Literal["prepare", "validate", "forecast", "plan", "review"]
ProjectStatus = Literal["draft", "ready", "archived"]
RunStatus = Literal["queued", "running", "done", "error", "cancelled"]
ModelId = Literal["timesfm", "lightgbm", "ets", "seasonal_naive", "arima", "prophet"]

class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(min_length=1, max_length=120)
    dataset_id: str
    description: str = Field(default="", max_length=500)

class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    archived: bool | None = None

class ProjectRevisionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    mapping: ColumnMapping
    frequency: str
    horizon: int = Field(ge=1, le=1000)
    preparation_steps: list[dict[str, Any]]
    candidate_models: list[ModelId]
    folds: int = Field(default=5, ge=2, le=10)
    primary_metric: Literal["mase", "wape", "smape"] = "mase"
    covariate_roles: dict[str, str]
    champion_override: dict[str, str] = Field(default_factory=dict)
```

Add response models with explicit fields, `schema_version: Literal[1] = 1`, UTC timestamps, and parsed `config` objects. Do not expose raw SQLite rows.

- [ ] **Step 4: Implement the additive SQLite store**

Use one transaction to create `projects`, `project_revisions`, `project_runs`, `issued_forecasts`, and `project_actuals`. Add foreign keys with `ON DELETE CASCADE`, indexes by project and timestamp, and a unique `(project_id, revision_no)` constraint.

```python
class ProjectStore:
    def __init__(self, db_path: Path) -> None: raise NotImplementedError
    def create_project(self, request: ProjectCreate) -> ProjectDetail: raise NotImplementedError
    def list_projects(self, *, include_archived: bool = False) -> list[ProjectSummary]: raise NotImplementedError
    def get_project(self, project_id: str) -> ProjectDetail | None: raise NotImplementedError
    def patch_project(self, project_id: str, request: ProjectPatch) -> ProjectDetail: raise NotImplementedError
    def delete_project(self, project_id: str) -> bool: raise NotImplementedError
    def create_revision(self, project_id: str, request: ProjectRevisionCreate) -> ProjectRevision: raise NotImplementedError
    def list_revisions(self, project_id: str) -> list[ProjectRevision]: raise NotImplementedError
    def create_run(self, request: ProjectRunCreate) -> ProjectRun: raise NotImplementedError
    def finish_run(self, run_id: str, artifact_path: str, summary: dict[str, Any]) -> ProjectRun: raise NotImplementedError
    def fail_run(self, run_id: str, error: str, *, cancelled: bool = False) -> ProjectRun: raise NotImplementedError
    def list_runs(self, project_id: str) -> list[ProjectRun]: raise NotImplementedError
```

Replace the single global `Store` and project-store singleton with dictionaries keyed by resolved database path so isolated tests cannot reuse another test's database.

- [ ] **Step 5: Implement safe artifact helpers**

```python
def project_dir(storage_dir: Path, project_id: str) -> Path:
    validate_segment(project_id, kind="project id")
    return storage_dir / "projects" / project_id

def dataset_fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, sort_keys=True, default=str), encoding="utf-8")
    temp.replace(path)
```

Add `projects_dir` to `Settings.ensure_dirs()` and include it in the storage wipe inventory.

- [ ] **Step 6: Run focused and regression tests**

Run: `uv run pytest app/backend/tests/unit/test_project_store.py app/backend/tests/unit/test_dataset_store.py app/backend/tests/unit/test_system_endpoints.py -q`

Expected: all selected tests pass, with no test sharing data across `tmp_path` databases.

- [ ] **Step 7: Commit**

```powershell
git add app/backend/tempolith/schemas/project.py app/backend/tempolith/services/project_store.py app/backend/tempolith/services/project_artifacts.py app/backend/tempolith/services/store.py app/backend/tempolith/deps.py app/backend/tempolith/settings.py app/backend/tests/unit/test_project_store.py
git commit -m "feat(projects): add versioned project persistence"
```

### Task 2: Expose project CRUD, revisions, permanent-delete confirmation, and workflow state

**Files:**
- Create: `app/backend/tempolith/services/project_workflow.py`
- Create: `app/backend/tempolith/routers/projects.py`
- Create: `app/backend/tests/unit/test_projects_router.py`
- Create: `app/backend/tests/unit/test_project_workflow.py`
- Modify: `app/backend/tempolith/main.py:133-212`

**Interfaces:**
- Consumes: `ProjectStore`, `ProjectRevision`, project artifact paths.
- Produces: `WorkflowState`, `StageState`, `compute_workflow_state()`, `/api/projects` CRUD, revisions, archive, reopen, and delete confirmation.

- [ ] **Step 1: Write failing router and invalidation tests**

```python
def test_project_crud_revision_and_delete_confirmation(client, uploaded_dataset_id: str) -> None:
    created = client.post("/api/projects", json={
        "name": "Demand Plan", "dataset_id": uploaded_dataset_id, "description": ""
    })
    assert created.status_code == 201
    project = created.json()
    detail = client.get(f"/api/projects/{project['id']}").json()
    token = detail["delete_confirmation_token"]
    assert client.delete(f"/api/projects/{project['id']}").status_code == 409
    assert client.delete(
        f"/api/projects/{project['id']}?confirmation={token}"
    ).status_code == 204
```

```python
def test_preparation_change_invalidates_downstream() -> None:
    state = compute_workflow_state(
        current_revision=3,
        latest_runs={
            "prepare": run(revision=2), "validate": run(revision=2),
            "forecast": run(revision=2), "plan": run(revision=2),
        },
        issued_revision=2,
        actuals_updated_at=None,
    )
    assert state.prepare.status == "not_started"
    assert state.validate.status == "blocked"
    assert state.review.status == "blocked"
```

- [ ] **Step 2: Verify failures**

Run: `uv run pytest app/backend/tests/unit/test_projects_router.py app/backend/tests/unit/test_project_workflow.py -q`

Expected: failures because the router and workflow service do not exist.

- [ ] **Step 3: Implement workflow state as a pure function**

```python
StageStatus = Literal["not_started", "needs_attention", "ready", "complete", "blocked"]

@dataclass(frozen=True)
class StageState:
    stage: ProjectStage
    status: StageStatus
    reason: str
    run_id: str | None = None

def compute_workflow_state(
    *, current_revision: int, latest_runs: Mapping[str, ProjectRun],
    issued_revision: int | None, actuals_updated_at: str | None,
) -> WorkflowState:
    # A stage is current only when its completed run uses current_revision.
    # Validate depends on Prepare; Forecast on Validate; Plan on Forecast;
    # Review on an issued forecast. New actuals recalculate Review only.
```

Implement the dependency table as data, not nested page-specific conditionals. Unit-test every invalidation rule in the design.

- [ ] **Step 4: Implement strict CRUD endpoints**

```python
router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("", response_model=ProjectDetail, status_code=201)
def create_project(request: ProjectCreate, store: ProjectStore = Depends(get_project_db)) -> ProjectDetail: raise NotImplementedError

@router.patch("/{project_id}", response_model=ProjectDetail)
def patch_project(project_id: str, request: ProjectPatch, store: ProjectStore = Depends(get_project_db)) -> ProjectDetail: raise NotImplementedError

@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, confirmation: str | None = None, store: ProjectStore = Depends(get_project_db)) -> Response: raise NotImplementedError
```

The confirmation token is `HMAC-SHA256(project_id + created_at, app-local random secret)` truncated to 24 hexadecimal characters. Store the random secret in memory for the app lifetime. A missing or incorrect token returns 409 and does not mutate files or SQLite.

- [ ] **Step 5: Register the router and PATCH CORS method**

Add `projects_router.router` under `/api` and change the CORS method list to `GET`, `POST`, `PATCH`, `DELETE`, and `OPTIONS`.

- [ ] **Step 6: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_projects_router.py app/backend/tests/unit/test_project_workflow.py app/backend/tests/unit/test_hardening.py -q`

Expected: all selected tests pass, including traversal rejection and wrong-confirmation behavior.

- [ ] **Step 7: Commit**

```powershell
git add app/backend/tempolith/services/project_workflow.py app/backend/tempolith/routers/projects.py app/backend/tempolith/main.py app/backend/tests/unit/test_projects_router.py app/backend/tests/unit/test_project_workflow.py
git commit -m "feat(projects): expose project workflow api"
```

### Task 3: Build the project library, project shell, navigation, and Overview

**Files:**
- Create: `app/frontend/src/types/project.ts`
- Create: `app/frontend/src/api/projects.ts`
- Create: `app/frontend/src/stores/projectStore.ts`
- Create: `app/frontend/src/hooks/useProject.ts`
- Create: `app/frontend/src/pages/ProjectsPage.tsx`
- Create: `app/frontend/src/pages/ProjectOverviewPage.tsx`
- Create: `app/frontend/src/components/project/ProjectSwitcher.tsx`
- Create: `app/frontend/src/components/project/ProjectHealthBadge.tsx`
- Create: `app/frontend/src/components/project/StudioStepper.tsx`
- Create: `app/frontend/src/components/project/__tests__/StudioStepper.test.tsx`
- Create: `app/frontend/src/pages/__tests__/ProjectsPage.test.tsx`
- Modify: `app/frontend/src/api/client.ts`
- Modify: `app/frontend/src/App.tsx:14-282`

**Interfaces:**
- Consumes: project CRUD and workflow-state endpoints from Task 2.
- Produces: `ProjectSummary`, `ProjectDetail`, `WorkflowState`, `projectApi`, `useProjectStore`, `/projects`, `/projects/:projectId`, and project-first sidebar.

- [ ] **Step 1: Add PATCH support and exact TypeScript wire types**

```typescript
export async function apiPatch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return handle<T>(res);
}

export type StudioStage = "prepare" | "validate" | "forecast" | "plan" | "review";
export type StageStatus = "not_started" | "needs_attention" | "ready" | "complete" | "blocked";
export interface StageState { stage: StudioStage; status: StageStatus; reason: string; run_id: string | null; }
export interface WorkflowState { project_id: string; revision: number; stages: Record<StudioStage, StageState>; }
```

- [ ] **Step 2: Write failing UI tests**

```tsx
it("renders projects and preserves archived projects behind the filter", async () => {
  renderProjectsRoute();
  expect(await screen.findByText("MEA Demand Plan")).toBeVisible();
  expect(screen.queryByText("Archived Sales Plan")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: /show archived/i }));
  expect(await screen.findByText("Archived Sales Plan")).toBeVisible();
});
```

```tsx
it("labels blocked and complete stages without relying on color", () => {
  render(<StudioStepper projectId="p1" active="validate" workflow={workflowFixture} />);
  expect(screen.getByText("Prepare").closest("a")).toHaveAccessibleName(/prepare complete/i);
  expect(screen.getByText("Forecast").closest("a")).toHaveAccessibleName(/forecast blocked/i);
});
```

- [ ] **Step 3: Verify UI tests fail**

Run: `cd app/frontend; npm test -- src/pages/__tests__/ProjectsPage.test.tsx src/components/project/__tests__/StudioStepper.test.tsx`

Expected: test collection fails because the pages and components do not exist.

- [ ] **Step 4: Implement project queries and local UI state**

`useProjectStore` contains only `activeProjectId`, `activeStage`, and `showArchived`; do not duplicate project objects from TanStack Query.

```typescript
export const projectApi = {
  list: (includeArchived = false) => apiGet<ProjectSummary[]>(`/projects?include_archived=${includeArchived}`),
  get: (id: string) => apiGet<ProjectDetail>(`/projects/${id}`),
  create: (body: ProjectCreate) => apiPost<ProjectDetail>("/projects", body),
  patch: (id: string, body: ProjectPatch) => apiPatch<ProjectDetail>(`/projects/${id}`, body),
  remove: (id: string, confirmation: string) => apiDelete<void>(`/projects/${id}?confirmation=${confirmation}`),
  createRevision: (id: string, body: ProjectRevisionCreate) => apiPost<ProjectRevision>(`/projects/${id}/revisions`, body),
};
```

- [ ] **Step 5: Implement the project library and Overview**

The Projects page provides New Project, active and archived filters, latest status, dataset name, updated time, and next action. The Overview provides current revision, dataset, horizon, series count, latest validation, latest issued forecast, and a single Continue button linked to the first incomplete stage.

Use existing square-border tokens and local-first copy. Do not reproduce the visual companion's pixel dimensions literally.

- [ ] **Step 6: Add project routes and project-first navigation**

Add lazy routes for `/projects`, `/projects/:projectId`, and the later project pages. Keep every V1 route. On non-landing V2 routes, show Projects and the open project's destinations before the compact Advanced Analysis group.

- [ ] **Step 7: Run frontend tests and typecheck**

Run: `cd app/frontend; npm test -- src/pages/__tests__/ProjectsPage.test.tsx src/components/project/__tests__/StudioStepper.test.tsx; npm run typecheck`

Expected: all new tests pass and TypeScript reports zero errors.

- [ ] **Step 8: Commit**

```powershell
git add app/frontend/src/types/project.ts app/frontend/src/api/client.ts app/frontend/src/api/projects.ts app/frontend/src/stores/projectStore.ts app/frontend/src/hooks/useProject.ts app/frontend/src/pages/ProjectsPage.tsx app/frontend/src/pages/ProjectOverviewPage.tsx app/frontend/src/components/project app/frontend/src/pages/__tests__/ProjectsPage.test.tsx app/frontend/src/App.tsx
git commit -m "feat(projects): add project library and overview"
```

### Task 4: Implement reversible preparation and the Prepare stage

**Files:**
- Create: `app/backend/tempolith/services/preparation.py`
- Create: `app/backend/tests/unit/test_preparation.py`
- Modify: `app/backend/tempolith/services/transformations.py`
- Modify: `app/backend/tempolith/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/PrepareStage.tsx`
- Create: `app/frontend/src/components/project/PreparationRecipeEditor.tsx`
- Create: `app/frontend/src/components/project/__tests__/PrepareStage.test.tsx`
- Create: `app/frontend/src/pages/ForecastStudioPage.tsx`

**Interfaces:**
- Consumes: current project revision, immutable dataset loader, project artifacts, preflight service, GenericJobManager.
- Produces: `PreparationStep`, `PreparationRecipe`, `PreparedArtifact`, `prepare_project()`, Prepare job endpoint and Studio stage.

- [ ] **Step 1: Write preparation tests for immutability and round-trip**

```python
@pytest.mark.parametrize("kind", ["none", "log", "box_cox", "diff", "seasonal_diff"])
def test_recipe_roundtrip_preserves_original_scale(kind: str, monthly_series: np.ndarray) -> None:
    recipe = PreparationRecipe(steps=[PreparationStep(kind=kind, period=12 if kind == "seasonal_diff" else 1)])
    prepared = prepare_series(monthly_series, recipe)
    restored = prepared.inverse(prepared.values, context=monthly_series)
    expected = monthly_series[prepared.history_offset:]
    assert np.allclose(restored, expected, atol=1e-3)
```

```python
def test_prepare_artifact_does_not_modify_source(tmp_path: Path, source_parquet: Path) -> None:
    before = source_parquet.read_bytes()
    artifact = prepare_project(source_parquet, recipe_fixture, tmp_path / "derived")
    assert source_parquet.read_bytes() == before
    assert artifact.path.exists()
    assert artifact.recipe_hash
```

- [ ] **Step 2: Verify tests fail**

Run: `uv run pytest app/backend/tests/unit/test_preparation.py -q`

Expected: collection fails because `tempolith.services.preparation` does not exist.

- [ ] **Step 3: Implement typed preparation steps and cached artifacts**

```python
PreparationKind = Literal[
    "aggregate_duplicates", "insert_missing_periods", "impute", "winsorize",
    "log", "box_cox", "diff", "seasonal_diff",
]

class PreparationStep(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: PreparationKind
    method: str | None = None
    period: int | None = Field(default=None, ge=1, le=366)
    lower_quantile: float | None = Field(default=None, ge=0, le=1)
    upper_quantile: float | None = Field(default=None, ge=0, le=1)

class PreparedArtifact(BaseModel):
    source_fingerprint: str
    recipe_hash: str
    path: Path
    row_count: int
    series_count: int
    history_offsets: dict[str, int]
    inverse_state_path: Path
```

Cache by `sha256(source_fingerprint + canonical recipe JSON)`. Write Parquet and inverse-state JSON to a temporary directory, validate them, then rename atomically.

- [ ] **Step 4: Add Prepare job orchestration**

`POST /api/projects/{project_id}/prepare` creates a `ProjectRun(stage="prepare")`, streams `load`, `transform`, `validate`, and `persist`, then finishes with artifact summary and preflight result. Cancellation before atomic rename leaves the previous prepared artifact current.

- [ ] **Step 5: Write and implement the Prepare stage UI**

The failing component test must verify that an invalid log transform on non-positive values shows the exact affected series and that Run Prepare is disabled until the recipe is valid.

The UI includes source summary, mapping, frequency, covariate roles, preflight cards, ordered recipe steps, before/after preview, and streamed job progress. Saving a changed recipe creates a new revision before starting the job.

- [ ] **Step 6: Run focused backend and frontend tests**

Run: `uv run pytest app/backend/tests/unit/test_preparation.py app/backend/tests/unit/test_project_workflow.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/PrepareStage.test.tsx; npm run typecheck`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```powershell
git add app/backend/tempolith/services/preparation.py app/backend/tempolith/services/transformations.py app/backend/tempolith/routers/project_jobs.py app/backend/tests/unit/test_preparation.py app/frontend/src/components/project/PrepareStage.tsx app/frontend/src/components/project/PreparationRecipeEditor.tsx app/frontend/src/components/project/__tests__/PrepareStage.test.tsx app/frontend/src/pages/ForecastStudioPage.tsx
git commit -m "feat(projects): add reversible preparation stage"
```

### Task 5: Make rolling validation the selection engine and add validated ensembles

**Files:**
- Create: `app/backend/tempolith/services/validation_policy.py`
- Create: `app/backend/tempolith/services/ensemble_policy.py`
- Create: `app/backend/tests/unit/test_validation_policy.py`
- Create: `app/backend/tests/unit/test_ensemble_policy.py`
- Modify: `app/backend/tempolith/services/backtest.py`
- Modify: `app/backend/tempolith/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/ValidateStage.tsx`
- Create: `app/frontend/src/components/project/ValidationLeaderboard.tsx`
- Create: `app/frontend/src/components/project/PortfolioExceptionsTable.tsx`
- Create: `app/frontend/src/components/project/__tests__/ValidateStage.test.tsx`

**Interfaces:**
- Consumes: prepared artifact, existing forecast adapters, Backtest metrics, current revision.
- Produces: `ValidationRequest`, `SeriesModelPolicy`, `ValidationResult`, `fit_ensemble_weights()`, `select_series_policy()`, Validate job and leaderboard.

- [ ] **Step 1: Write metric, eligibility, and ensemble tests**

```python
def test_each_series_selects_its_own_policy() -> None:
    result = select_policies(validation_fixture_two_series())
    assert result.series_policies["egypt"].champion == "timesfm"
    assert result.series_policies["uae"].champion == "lightgbm"
    assert result.portfolio_metrics.mase == pytest.approx(0.65)
```

```python
def test_ensemble_requires_two_percent_gain_without_bias_regression() -> None:
    weights = fit_ensemble_weights(oof_predictions, actuals)
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.79, bias_pct=1.1, coverage=0.80),
        weights=weights,
    )
    assert decision.promoted is False
    assert decision.reason == "Ensemble improvement 1.25% is below the 2.00% threshold."
```

- [ ] **Step 2: Verify tests fail**

Run: `uv run pytest app/backend/tests/unit/test_validation_policy.py app/backend/tests/unit/test_ensemble_policy.py -q`

Expected: missing-module collection failures.

- [ ] **Step 3: Extract reusable fold predictions from backtest**

Add a typed `FoldPrediction` containing `series_id`, `model`, `fold`, `horizon_step`, `actual`, `point`, `p10`, and `p90`. Preserve the existing Backtest response and cache contract. Project validation consumes the new internal structure without changing V1 output.

- [ ] **Step 4: Implement exact selection rules**

```python
def mase(actual: NDArray[np.float64], predicted: NDArray[np.float64], history: NDArray[np.float64], period: int) -> float: raise NotImplementedError
def wape(actual: NDArray[np.float64], predicted: NDArray[np.float64]) -> float: raise NotImplementedError
def smape(actual: NDArray[np.float64], predicted: NDArray[np.float64]) -> float: raise NotImplementedError
def signed_bias_pct(actual: NDArray[np.float64], predicted: NDArray[np.float64]) -> float: raise NotImplementedError
def interval_coverage(actual: NDArray[np.float64], p10: NDArray[np.float64], p90: NDArray[np.float64]) -> float: raise NotImplementedError

def select_series_policy(
    predictions: Sequence[FoldPrediction], primary_metric: Literal["mase", "wape", "smape"]
) -> SeriesModelPolicy: raise NotImplementedError
```

Require every configured fold for eligibility. Fit non-negative weights with `scipy.optimize.nnls`, normalize them, and fall back to inverse-MASE only when NNLS fails or sums to zero. Compare ensemble and individual metrics on the same out-of-fold rows.

- [ ] **Step 5: Add Validate job and persisted result**

Stream series, fold, and model progress. Store raw out-of-fold rows as compressed JSON or Parquet under the run directory and the summary in SQLite. A candidate failure is a result row, not a job failure, unless no eligible policy exists for any series.

- [ ] **Step 6: Implement Validate UI and tests**

The UI configures two to ten folds and candidates, proposes but does not silently accept a reduced fold count, and shows portfolio metrics plus a series-level leaderboard. Manual champion override requires a reason and creates a new revision.

Test zero-value MAPE warning, candidate failure visibility, ensemble promotion reason, per-series policy selection, and the confirmation needed for reduced folds.

- [ ] **Step 7: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_validation_policy.py app/backend/tests/unit/test_ensemble_policy.py app/backend/tests/unit/test_backtest.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/ValidateStage.test.tsx; npm run typecheck`

Expected: all selected tests pass and V1 backtest tests remain green.

- [ ] **Step 8: Commit**

```powershell
git add app/backend/tempolith/services/validation_policy.py app/backend/tempolith/services/ensemble_policy.py app/backend/tempolith/services/backtest.py app/backend/tempolith/routers/project_jobs.py app/backend/tests/unit/test_validation_policy.py app/backend/tests/unit/test_ensemble_policy.py app/frontend/src/components/project/ValidateStage.tsx app/frontend/src/components/project/ValidationLeaderboard.tsx app/frontend/src/components/project/PortfolioExceptionsTable.tsx app/frontend/src/components/project/__tests__/ValidateStage.test.tsx
git commit -m "feat(projects): select models from rolling validation"
```

### Task 6: Generate per-series forecasts, require baseline factor plans, and compare scenarios

**Files:**
- Create: `app/backend/tempolith/services/factor_plan.py`
- Create: `app/backend/tests/unit/test_factor_plan.py`
- Modify: `app/backend/tempolith/services/forecaster.py`
- Modify: `app/backend/tempolith/services/scenarios.py`
- Modify: `app/backend/tempolith/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/ForecastStage.tsx`
- Create: `app/frontend/src/components/project/PlanStage.tsx`
- Create: `app/frontend/src/components/project/FutureFactorGrid.tsx`
- Create: `app/frontend/src/components/project/__tests__/FutureFactorGrid.test.tsx`
- Create: `app/frontend/src/pages/ProjectScenariosPage.tsx`

**Interfaces:**
- Consumes: selected per-series policies, prepared data, covariate roles, existing forecasters and scenario service.
- Produces: `BaselineFactorPlan`, `validate_factor_plan()`, `run_project_forecast()`, `ScenarioDelta`, Forecast and Plan stages.

- [ ] **Step 1: Write future-factor completeness tests**

```python
def test_missing_known_future_values_block_forecast() -> None:
    result = validate_factor_plan(
        roles={"price": "known_future_numerical"},
        periods=["2026-08-01", "2026-09-01"],
        values={"price": {"2026-08-01": 12.5}},
        fill_policies={},
    )
    assert result.valid is False
    assert result.missing == [{"covariate": "price", "period": "2026-09-01"}]
```

```python
def test_explicit_forward_fill_records_affected_periods() -> None:
    result = materialize_factor_plan(plan_with_forward_fill())
    assert result.values["price"]["2026-09-01"] == 12.5
    assert result.applied_fills == [{
        "covariate": "price", "policy": "forward_fill", "periods": ["2026-09-01"]
    }]
```

- [ ] **Step 2: Verify tests fail**

Run: `uv run pytest app/backend/tests/unit/test_factor_plan.py -q`

Expected: missing-module collection failure.

- [ ] **Step 3: Implement covariate-role and plan models**

```python
CovariateRole = Literal[
    "historical_only", "known_future_numerical", "known_future_categorical",
    "calendar_generated", "static_numerical", "static_categorical", "scenario_controlled",
]
FillPolicy = Literal["none", "forward_fill", "zero"]

class BaselineFactorPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    values: dict[str, dict[str, float | int | str]]
    fill_policies: dict[str, FillPolicy]
```

Calendar generation is deterministic from the project frequency and supports month, quarter, day of week, and weekend. It does not call a holiday API.

- [ ] **Step 4: Implement per-series policy execution**

Add `run_project_forecast()` that groups the prepared data by series id, loads each selected policy, executes the individual model or ensemble, inverses the preparation transform, and returns exceptions separately. Never fall back to another model silently. A failed series is marked failed and remains visible; successful series complete.

- [ ] **Step 5: Implement scenario delta storage**

A scenario copies the baseline factor plan, applies edits, and runs against the same project revision and model policies. Store absolute, percentage, and cumulative deltas per series and portfolio. Scenario edits do not invalidate the baseline.

- [ ] **Step 6: Implement Forecast and Plan UIs**

Forecast shows required baseline factor inputs before Run when the selected policy uses them. After completion it shows portfolio totals, calibrated bands, per-series exceptions, model policy, and run manifest.

Plan copies the baseline grid, supports flat, ramp, zero, percentage change, and manual values, then compares named scenarios side by side.

- [ ] **Step 7: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_factor_plan.py app/backend/tests/unit/test_forecast_flow.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/FutureFactorGrid.test.tsx; npm run typecheck`

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```powershell
git add app/backend/tempolith/services/factor_plan.py app/backend/tempolith/services/forecaster.py app/backend/tempolith/services/scenarios.py app/backend/tempolith/routers/project_jobs.py app/backend/tests/unit/test_factor_plan.py app/frontend/src/components/project/ForecastStage.tsx app/frontend/src/components/project/PlanStage.tsx app/frontend/src/components/project/FutureFactorGrid.tsx app/frontend/src/components/project/__tests__/FutureFactorGrid.test.tsx app/frontend/src/pages/ProjectScenariosPage.tsx
git commit -m "feat(projects): add baseline and scenario planning"
```

### Task 7: Issue immutable forecasts, import actuals, and calculate post-issue accuracy

**Files:**
- Create: `app/backend/tempolith/services/actuals.py`
- Create: `app/backend/tests/unit/test_actuals.py`
- Modify: `app/backend/tempolith/services/project_store.py`
- Modify: `app/backend/tempolith/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/ReviewStage.tsx`
- Create: `app/frontend/src/components/project/IssuedForecastBanner.tsx`
- Create: `app/frontend/src/components/project/AccuracySummary.tsx`
- Create: `app/frontend/src/components/project/__tests__/ReviewStage.test.tsx`
- Create: `app/frontend/src/pages/ProjectAccuracyPage.tsx`

**Interfaces:**
- Consumes: completed baseline or scenario run, project store, uploaded file parsing, validation metrics.
- Produces: `IssuedForecast`, `ActualRow`, `AccuracyResult`, `issue_run()`, `import_actuals()`, `score_issued_forecast()`, Review and Accuracy UI.

- [ ] **Step 1: Write immutability and scoring tests**

```python
def test_issued_forecast_remains_unchanged_after_new_revision(store: ProjectStore) -> None:
    issued = store.issue_run(completed_forecast_run.id, assumptions={"price": 12.5})
    store.create_revision(completed_forecast_run.project_id, changed_horizon_revision())
    reloaded = store.get_issued_forecast(issued.id)
    assert reloaded.run_id == completed_forecast_run.id
    assert reloaded.forecast == issued.forecast
```

```python
def test_score_matches_series_and_period_only() -> None:
    result = score_issued_forecast(issued_fixture, [
        ActualRow(series_id="egypt", date="2026-08-01", value=103.0),
        ActualRow(series_id="uae", date="2026-08-01", value=81.0),
    ])
    assert result.matched_points == 2
    assert result.metrics.mase >= 0
    assert result.metrics.coverage == 1.0
```

- [ ] **Step 2: Verify tests fail**

Run: `uv run pytest app/backend/tests/unit/test_actuals.py -q`

Expected: missing-module collection failure.

- [ ] **Step 3: Implement issue and actual persistence**

Issuing copies the completed run's forecast values, quantiles, assumptions, manifest, and artifact hashes into an immutable issued-forecast record. Reject issue when the run is incomplete, stale for the current revision, or not a Forecast or Scenario run.

Actual imports upsert on `(project_id, series_id, date)` and record import time and source fingerprint. They never update run or issued tables.

- [ ] **Step 4: Implement post-issue scoring**

```python
class AccuracyMetrics(BaseModel):
    mase: float | None
    wape: float | None
    smape: float | None
    rmse: float | None
    bias_pct: float | None
    pinball_loss: float | None
    coverage_p10_p90: float | None

def score_issued_forecast(
    issued: IssuedForecast, actuals: Sequence[ActualRow]
) -> AccuracyResult: raise NotImplementedError
```

Return `None` for a metric that cannot be calculated and a structured reason in `metric_warnings`. Never replace missing metrics with zero.

- [ ] **Step 5: Add issue, actuals, and accuracy endpoints**

Implement `POST /runs/{run_id}/issue`, multipart `POST /actuals`, and `GET /accuracy`. Reuse the file-loader registry for CSV, Excel, Parquet, and JSON actuals. Require mapping when column names do not match project mapping.

- [ ] **Step 6: Implement Review and Accuracy UIs**

Review distinguishes `Backtest evidence` and `Post-issue accuracy` as separate headings. It shows issued time, run, revision, assumptions, matched periods, remaining forecast periods, MASE, WAPE, bias, and coverage. Importing actuals invalidates only the accuracy query.

- [ ] **Step 7: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_actuals.py app/backend/tests/unit/test_project_store.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/ReviewStage.test.tsx; npm run typecheck`

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```powershell
git add app/backend/tempolith/services/actuals.py app/backend/tempolith/services/project_store.py app/backend/tempolith/routers/project_jobs.py app/backend/tests/unit/test_actuals.py app/frontend/src/components/project/ReviewStage.tsx app/frontend/src/components/project/IssuedForecastBanner.tsx app/frontend/src/components/project/AccuracySummary.tsx app/frontend/src/components/project/__tests__/ReviewStage.test.tsx app/frontend/src/pages/ProjectAccuracyPage.tsx
git commit -m "feat(projects): close the loop with actuals"
```

### Task 8: Add immutable run history, manifests, export packages, and compatibility checks

**Files:**
- Create: `app/frontend/src/pages/ProjectRunsPage.tsx`
- Create: `app/frontend/src/components/project/RunManifestDrawer.tsx`
- Create: `app/frontend/src/components/project/__tests__/RunManifestDrawer.test.tsx`
- Modify: `app/backend/tempolith/services/exports.py`
- Modify: `app/backend/tempolith/routers/project_jobs.py`
- Modify: `app/backend/tempolith/routers/system.py`
- Create: `app/backend/tests/unit/test_project_exports.py`
- Modify: `app/frontend/src/App.tsx`

**Interfaces:**
- Consumes: project runs, issued forecast, project artifacts, existing PDF export.
- Produces: project run list/detail, manifest drawer, JSON and ZIP forecast package, storage wipe coverage.

- [ ] **Step 1: Write export package tests**

```python
def test_forecast_package_contains_manifest_and_machine_readable_values(client, issued_project) -> None:
    response = client.get(f"/api/projects/{issued_project.id}/exports/package")
    assert response.status_code == 200
    with ZipFile(io.BytesIO(response.content)) as archive:
        assert set(archive.namelist()) >= {
            "manifest.json", "forecast.csv", "assumptions.json",
            "validation-summary.json", "accuracy.json",
        }
```

- [ ] **Step 2: Implement manifest and export package**

The manifest includes schema version, project and revision ids, dataset and recipe fingerprints, package and model versions, candidate policies, seeds, fill policies, warnings, timestamps, and artifact hashes. The ZIP is created in process under the project's exports directory and contains no database secrets.

- [ ] **Step 3: Implement Runs page and manifest drawer**

List stage, status, revision, start, duration, warnings, and current/stale label. The drawer renders the exact manifest and links to available artifacts. Cancelled and failed runs remain visible.

- [ ] **Step 4: Extend storage wipe and Privacy inventory**

Storage wipe removes project artifacts and project-domain SQLite rows while preserving model weights as the existing endpoint specifies. Update endpoint tests to assert projects are gone after wipe.

- [ ] **Step 5: Run tests and production build**

Run: `uv run pytest app/backend/tests/unit/test_project_exports.py app/backend/tests/unit/test_system_endpoints.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/RunManifestDrawer.test.tsx; npm run typecheck; npm run build`

Expected: tests pass and Vite produces `dist` without warnings treated as errors.

- [ ] **Step 6: Commit**

```powershell
git add app/backend/tempolith/services/exports.py app/backend/tempolith/routers/project_jobs.py app/backend/tempolith/routers/system.py app/backend/tests/unit/test_project_exports.py app/backend/tests/unit/test_system_endpoints.py app/frontend/src/pages/ProjectRunsPage.tsx app/frontend/src/components/project/RunManifestDrawer.tsx app/frontend/src/components/project/__tests__/RunManifestDrawer.test.tsx app/frontend/src/App.tsx
git commit -m "feat(projects): add run manifests and packages"
```

### Task 9: Add the deterministic browser journey and full regression gates

**Files:**
- Create: `app/frontend/e2e/tempolith-v2-project.spec.ts`
- Create: `app/frontend/public/samples/multi_series_demand_demo.csv`
- Modify: `app/frontend/playwright.config.ts`
- Modify: `app/backend/tests/conftest.py`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: complete V2 API and UI, fake deterministic registry and model adapters.
- Produces: one release-gating V2 Playwright journey on Windows and CI Linux.

- [ ] **Step 1: Add deterministic fake candidate fixtures**

Extend test-only app configuration so TimesFM, LightGBM, ETS, and seasonal naive return deterministic but distinct fold predictions. Keep the production service registry unchanged.

- [ ] **Step 2: Write the E2E flow before fixing selectors**

```typescript
test("forecast project survives the complete issue and review cycle", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("MEA Demand Plan");
  await page.getByRole("button", { name: "Use multi-series demand sample" }).click();
  await page.getByRole("button", { name: "Create project" }).click();

  await page.getByRole("link", { name: /prepare/i }).click();
  await page.getByRole("button", { name: "Add linear interpolation" }).click();
  await page.getByRole("button", { name: "Run prepare" }).click();
  await expect(page.getByText("Prepare complete")).toBeVisible();

  await page.getByRole("link", { name: /validate/i }).click();
  await page.getByRole("button", { name: "Run validation" }).click();
  await expect(page.getByText("Selected policy")).toBeVisible();

  await page.getByRole("link", { name: /forecast/i }).click();
  await page.getByRole("button", { name: "Run baseline forecast" }).click();
  await expect(page.getByText("Baseline complete")).toBeVisible();

  await page.getByRole("link", { name: /plan/i }).click();
  await page.getByRole("button", { name: "Create scenario" }).click();
  await page.getByLabel("Scenario name").fill("Price increase");
  await page.getByRole("button", { name: "Run scenario" }).click();
  await page.getByRole("button", { name: "Issue this forecast" }).click();
  await page.getByRole("button", { name: "Confirm issue" }).click();

  await page.getByRole("link", { name: /review/i }).click();
  await page.getByLabel("Import actuals").setInputFiles("public/samples/multi_series_demand_demo.csv");
  await expect(page.getByText("Post-issue accuracy")).toBeVisible();

  await page.reload();
  await expect(page.getByText("MEA Demand Plan")).toBeVisible();
  await expect(page.getByText("Forecast issued")).toBeVisible();
});
```

- [ ] **Step 3: Run E2E and fix only product defects or accessible selectors**

Run: `cd app/frontend; npx playwright test e2e/tempolith-v2-project.spec.ts --project=chromium`

Expected: one passing V2 journey with no ErrorBoundary output and no unexpected 4xx or 5xx API response.

- [ ] **Step 4: Run complete backend, frontend, and build gates**

Run: `uv run ruff check app/backend/tempolith app/backend/tests`

Run: `uv run pytest app/backend/tests -q -m "not integration"`

Run: `cd app/frontend; npm test; npm run typecheck; npm run lint; npm run build`

Run: `cd app/frontend; npx playwright test --project=chromium`

Expected: every command exits zero. Record test counts and durations in the release checklist.

- [ ] **Step 5: Commit**

```powershell
git add app/frontend/e2e/tempolith-v2-project.spec.ts app/frontend/public/samples/multi_series_demand_demo.csv app/frontend/playwright.config.ts app/backend/tests/conftest.py .github/workflows/ci.yml
git commit -m "test(v2): gate the complete forecast project journey"
```

### Task 10: Synchronize documentation and complete the V2.0 release review

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `UBIQUITOUS_LANGUAGE.md`
- Modify: `app/frontend/src/pages/PrivacyPage.tsx`
- Modify: `app/frontend/src/pages/AboutPage.tsx`
- Modify: `app/frontend/src/data/termDictionary.ts`
- Modify: `app/frontend/src/data/pageIntros.ts`
- Modify: `docs/screenshots/`
- Modify: `scripts/capture_screenshots.mjs`

**Interfaces:**
- Consumes: verified implementation and final API/storage behavior.
- Produces: accurate V2 product documentation, privacy inventory, glossary, screenshots, and release evidence.

- [ ] **Step 1: Update product and storage documentation**

Document Forecast Projects, Studio stages, per-series validation policies, preparation recipes, baseline factor plans, issued forecasts, actuals, project artifact paths, migration behavior, and export packages. State explicitly that hierarchy reconciliation, schedules, alerts, and automatic champion replacement are not in V2.0.

- [ ] **Step 2: Update in-app language**

Add exact glossary entries for Forecast Project, Project Revision, Project Run, Issued Forecast, Post-issue Accuracy, MASE, WAPE, Signed Bias, and Coverage. Update Privacy with every new SQLite table and `~/.tempolith/projects/` subdirectory.

- [ ] **Step 3: Refresh screenshots**

Capture Projects, Prepare, Validate, Forecast, Plan, and Review using the deterministic demo project. Ensure screenshots contain no local personal paths, credentials, or temporary ids.

- [ ] **Step 4: Run documentation and prohibited-copy scans**

Run: `rg -n "—|T[B]D|T[O]DO|coming soon|paid tier|cloud sync|AI assistant" README.md CHANGELOG.md UBIQUITOUS_LANGUAGE.md app/frontend/src`

Expected: no em dashes or placeholder claims. References inside historical design documents must still describe intentional non-goals accurately.

- [ ] **Step 5: Run final release gates again**

Run: `uv run pytest app/backend/tests -q -m "not integration"`

Run: `cd app/frontend; npm test; npm run typecheck; npm run lint; npm run build; npx playwright test --project=chromium`

Expected: all gates exit zero with no changed test expectation hidden behind snapshots.

- [ ] **Step 6: Review the implementation against every design acceptance criterion**

Check the acceptance criteria in `docs/superpowers/specs/2026-07-15-tempolith-v2-design.md` one by one. Add a release-note evidence line for project persistence, preparation immutability, rolling selection, multi-series policies, explicit future factors, immutable issuance, actual matching, local-only behavior, V1 compatibility, and reproducible reopen.

- [ ] **Step 7: Commit**

```powershell
git add README.md CHANGELOG.md UBIQUITOUS_LANGUAGE.md app/frontend/src/pages/PrivacyPage.tsx app/frontend/src/pages/AboutPage.tsx app/frontend/src/data/termDictionary.ts app/frontend/src/data/pageIntros.ts docs/screenshots scripts/capture_screenshots.mjs
git commit -m "docs(v2): document forecast projects"
```

---

## Final completion evidence

The V2.0 build is complete only after all ten task commits exist and the following evidence is reported:

- Backend unit and non-model integration test count and duration.
- Frontend Vitest count and duration.
- TypeScript, ESLint, Ruff, and Vite build status.
- Full Playwright result including the V2 project journey.
- Git status proving no unintended user files were staged or modified.
- A manual local smoke test using the Windows desktop packaging path or a documented reason it must run in the separate `tempolith-desktop` repository.
- A list of deferred V2.1 and V2.2 features confirming that none are represented as implemented.
