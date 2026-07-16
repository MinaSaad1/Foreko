# Foreko V2.0 Forecast Projects Implementation Plan (Revised)

> Supersedes `docs/superpowers/plans/2026-07-15-foreko-v2-implementation.md`.
> Design of record remains `docs/superpowers/specs/2026-07-15-foreko-v2-design.md`,
> amended by the "Design amendments" section below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete local Forecast Projects workflow from project creation through
preparation, rolling validation, forecasting, scenario planning, issuance, actuals import,
and post-issue accuracy.

**Architecture:** Add an additive project domain beside the existing V1 analyses. SQLite stores
versioned metadata and immutable run manifests, while large artifacts remain under
`~/.foreko/projects/<project_id>/`. The React application becomes project-first through a
Forecast Studio shell, while existing forecasting services remain the execution engines behind
new orchestration boundaries.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic, sqlite3, pandas, NumPy, SciPy, TimesFM 2.5,
LightGBM, React 18, TypeScript, TanStack Query, Zustand, Tailwind, ECharts, pytest, Vitest,
Playwright.

---

## Why this revision exists

The 2026-07-15 plan was well researched and correctly identified three real defects in the
current code (the `Store` singleton, the missing PATCH CORS method, and the duplicated storage
directory inventory). It is superseded because an audit of the plan against the repository on
2026-07-16 found six blocking gaps and several smaller ones. Each is addressed by a numbered
task below.

| # | Gap found in the 2026-07-15 plan | Addressed by |
|---|---|---|
| 1 | Promises "versioned migrations" but no migration mechanism exists to build on | Task 0 |
| 2 | Rolling validation must select per series, but `backtest.py` is single-series | Task 5 |
| 3 | `backtest.py` silently replaces a failed model with a naive forecast and scores it, which makes the design's fold-eligibility rule unimplementable | Task 5 |
| 4 | Revision config ships untyped (`list[dict[str, Any]]`) because typed models arrive in later tasks | Task 1 ordering |
| 5 | E2E is a release gate, but Playwright has no `webServer` and CI has no Playwright job at all | Task 10 |
| 6 | Two model-selection engines ship side by side, one of them labelled "Forecast" | Decision D1, Task 9 |

### Verified facts this plan is built on

Every reference below was checked against the working tree on 2026-07-16.

- `services/store.py:21-61` is a single `executescript` of `CREATE TABLE IF NOT EXISTS`.
  There is no `PRAGMA user_version`, no version table, and no ALTER path.
- `services/store.py:298-305` `get_store` ignores `db_path` after the first call.
- `services/store.py:96-99` already sets `PRAGMA foreign_keys=ON`, so `ON DELETE CASCADE` works.
- `services/backtest.py:176-177` uses `values[0]` and `dates[0]` only. Backtesting is single-series.
- `services/backtest.py:222-226` catches a model exception and substitutes
  `np.full(len(actuals), history[-1])`, then scores it as a normal result.
- `services/backtest.py:45-48` `FoldMetrics` already carries `point_forecast`, `actuals`,
  `p10`, `p90`. `backtest.py:291-309` drops them during serialization.
- `services/transformations.py:13-79` provides forward and inverse pairs for `log`, `box_cox`,
  `diff`, `seasonal_diff`, and `none`. It has no `winsorize`, `impute`, or `insert_missing_periods`.
  `aggregate_duplicates_by_date` lives at `services/series.py:106`.
- `services/ensembles.py:13-51` already fits inverse-MAPE weights and is served by
  `routers/phase4.py:104-107` at `POST /api/ensemble/combine`.
- `services/comparison.py:126,185-188,212` performs single-holdout MAPE winner selection.
- `pages/ComparisonPage.tsx:42-70` `resolveRecommendation()` already overrides the holdout winner
  with the walk-forward backtest winner when a backtest result exists in the store.
- `App.tsx:214` renders the `/compare` route with the sidebar label `"Forecast"`.
- `main.py:133` allows `GET`, `POST`, `DELETE`, `OPTIONS`. PATCH is absent.
- `services/paths.py:19` exports `validate_segment(value, *, kind="identifier")`.
- `settings.py:87-88` `db_path` is a property resolving to `storage_dir/data/foreko.db`.
  `settings.py:98-107` `ensure_dirs()` creates `datasets, adapters, jobs, data, exports, logs`.
  `routers/system.py:64` `_WIPEABLE_DIRS` repeats that same list by hand.
- `jobs/generic.py:36-90` `GenericJobManager` supports SSE queues and a `threading.Event` stop flag.
- `api/client.ts` exports `apiGet`, `apiPost`, `apiPut`, `apiUpload`. There is no `apiPatch`
  and no `apiDelete`.
- `hooks/useJobEvents.ts:21` hardcodes `/api/finetune/jobs/${jobId}/events`. It is not generic.
- `playwright.config.ts` is 28 lines with no `webServer` block.
- `.github/workflows/main.yml` is the CI file. There is no `ci.yml`. It has no Playwright job,
  and its frontend job never runs `npm run lint`.

---

## Findings from Task 11 (the browser journey)

Building the release gate surfaced three defects that no unit test could have
caught, because each needed the assembled system running:

**ETS never worked.** `classical_baselines.ets_forecast` called
`.fit(disp=False)`, which statsmodels' `ExponentialSmoothing` does not accept.
It raised on every call and returned seasonal naive's forecast under the ETS
name. Every "ETS" number the app has ever shown was seasonal naive. It also
explains an oddity accepted earlier in this build: validation kept reporting
"Ensemble improvement 0.00%", because ETS and seasonal naive were literally the
same model. Fixed and pinned; mutation-tested.

**Google Fonts contradicted the README.** `index.html` loaded a Google Fonts
stylesheet, so every page load sent the user's IP and user-agent to a third
party. README:57 says "Your data never leaves your machine... The only outbound
request is the one-time TimesFM weights download." That was false. Fonts are now
bundled via @fontsource and the journey asserts zero external requests, which
makes the claim true rather than softening it.

**The e2e suite had a stale assertion and never ran.** `foreko.spec.ts` asserted
a heading "Upload your data" that has not existed for some time. Nothing caught
it because there was no Playwright job in CI. That job now exists on Windows and
Linux.

Also worth recording: the first version of the gate reused a developer's backend
on port 8000, so the journey created projects in real `~/.foreko` storage and
scored them with real models. It was neither isolated nor deterministic and left
data behind. The run now starts its own backend on 8001 with its own temp
storage and never reuses an existing server.

## BLOCKER B1 (RESOLVED 2026-07-16): factor plans never reached a model

Found on 2026-07-16 by running a scenario, not by a test. Doubling a `price`
assumption from 10 to 20 changed the forecast by exactly +0.0.

`backtest._forecast_one_model` takes `(model, history_values, history_dates,
horizon, registry, freq)`. It has **no covariates parameter at all**, and
`project_forecast.py` references covariates zero times. So the current chain is:

1. The Forecast stage requires `price` for every future period.
2. It refuses to run until the user supplies it.
3. It then runs a model that cannot see `price`.
4. Scenario edits to `price` therefore produce identical forecasts.

Two separate defects, and the second is the serious one:

**B1a. The gate is unconditional.** Design 6.5 says "**if the selected model
policy requires future covariates**, the Forecast stage collects the baseline
values before execution." The gate must be conditional on the champion actually
consuming covariates. Blocking a `seasonal_naive` forecast on a factor that
`seasonal_naive` cannot read is incoherent: the user is being asked for an input
that provably does nothing.

**B1b. No project model consumes covariates.** `forecaster.py` has covariate
handling for the V1 path, and LightGBM supports them, but the project forecast
path routes through `_forecast_one_model`, which drops them. Of the V2.0
candidates, only LightGBM can use covariates at all; TimesFM covariate support
is a separate question. So today the Plan stage cannot move a number.

**Resolved.** TimesFM consumes covariates via `registry.forecast_with_covariates`;
the classical baselines and LightGBM take `(dates, values)` only. Verified against
real TimesFM: moving `price` from 10 to 40 moved the portfolio forecast from
750.00 to 4350.00. Before the fix that delta was exactly +0.00.

What was done:

1. `project_forecast._forecast_with_covariates` routes a covariate-capable
   champion through `forecast_with_covariates`, building each dynamic covariate
   as observed history concatenated with the planned future.
2. `required_future_factors` is policy-aware: a factor is only demanded when a
   model that will actually run can read it. An ensemble is judged by its
   members. The factor-plan endpoint returns `ignored_by_policy` so a mapped
   factor that no champion reads is stated rather than silently dropped.
3. `test_project_covariates.py` asserts a different assumption produces a
   different forecast, and that the covariate spans history and horizon.
   Verified by mutation: disconnecting the covariates fails those tests.

The test fake also had to change. `FakeTimesFMModel` had no
`forecast_with_covariates` at all, so a fake that ignored covariates would have
let this bug survive indefinitely. It now responds to them.

Four existing tests failed after the fix and were **correct to fail**: they
asserted a `seasonal_naive` forecast should block on `price`, which is the
incoherence this blocker names. They now test the gate with a covariate-capable
champion, plus a new test that a classical champion is not asked for factors it
cannot read.

## Decisions required before Task 1

These are product decisions, not implementation details. Confirm or override each before work
starts. The recommendation is what this plan assumes.

**D1 (DECIDED 2026-07-16, relabelled). The nav item labelled "Forecast" at `/compare`.**
Design §4 keeps V1 routes alive, and design §14 requires the headline champion to come from
rolling validation. Both hold today only because `/compare` is called "Forecast" in the sidebar
while doing single-holdout MAPE selection. Shipping V2 unchanged means two destinations named
Forecast giving two different champions.
*Decided:* relabelled to "Model Comparison" and moved into Advanced Analysis. Route and service
unchanged. Taken on the standing "go on till the full plan is implemented" directive after the
question went unanswered; reversible in one commit if you disagree.

The rename touched more than the two lines this recommendation named. `ComparisonPage.tsx` also
hardcoded `useDocumentTitle("Forecast")`, an `EmptyDatasetState title`, a `PageHeader kicker`, and a
display-name fallback. A grep of `App.tsx` alone would have left the page still calling itself
Forecast, which is why this was verified in the browser rather than in the source.

**D2. `services/ensembles.py` and `POST /api/ensemble/combine`.**
The V2 `ensemble_policy.py` fits out-of-fold weights under promotion guardrails. The V1 module
fits inverse-MAPE weights over point forecasts with no guardrail and has a live endpoint.
*Recommendation:* keep both, and have `ensemble_policy.py` own the V2 path without importing V1.
They answer different questions and the V1 endpoint is a public API surface. Add a docstring to
`ensembles.py` naming it the V1 path so nobody merges them by accident. Do not delete in V2.0.

**D3. The delete confirmation token.**
The prior plan issued an HMAC token on every project-detail GET. Since it is handed out
unconditionally on a local, unauthenticated, single-user app with `allow_credentials=False`, it
only blocks a DELETE issued with no prior GET.
*Recommendation:* drop the HMAC. Require `DELETE /api/projects/{id}?confirm=true` and put the
real guard in the UI confirm dialog, which is where it actually protects the user. This removes
`delete_confirmation_token` from `ProjectDetail`. Assumed by Task 2.

**D4. Screenshot weight.**
Commit `9827e06` deliberately removed ~11 MB of screenshots, leaving `docs/screenshots/` with one
file. Task 10 of the prior plan re-added six.
*Recommendation:* capture the six Studio screens only if README references them, and cap the set
at the README's actual needs. Assumed by Task 11.

## Design amendments

These resolve underspecified points in the design. Apply them to the spec when V2.0 lands.

**A1. Quantify design §6.4's "materially worsen".** The ensemble is promoted only when all three
hold:
1. primary metric improves by at least 2.00 percent relative to the best individual model;
2. `abs(signed_bias_pct)` does not increase by more than 0.5 percentage points;
3. P10 to P90 empirical coverage does not move more than 5 percentage points further from 0.80.

Fixed in V2.0, same rationale as the fixed 2 percent gate.

**A2. Single source of truth for archived state.** Design §6.1 lists both `status` and
`archived_at`. `ProjectStatus` becomes `Literal["draft", "ready"]`, and archived state is derived
from `archived_at is not None`. Responses expose a computed `is_archived: bool`.

**A3. Fold failure is recorded, never substituted.** Design §10.1 requires failure isolation by
model, fold, and series. Amend §6.3 to state explicitly that a candidate raising an exception on a
fold records a `FoldFailure` and produces no metric row for that fold. See Task 5.

---

## File responsibility map

### Backend domain and persistence

- `app/backend/foreko/services/migrations.py`: schema version detection and ordered migration steps.
- `app/backend/foreko/schemas/project.py`: all public project, revision, run, factor-plan, issue, actual, and accuracy wire types.
- `app/backend/foreko/services/project_store.py`: additive SQLite schema and metadata CRUD only.
- `app/backend/foreko/services/project_artifacts.py`: safe project paths, fingerprints, atomic JSON and Parquet artifacts, and project cleanup.
- `app/backend/foreko/services/project_workflow.py`: stage readiness and downstream invalidation only.
- `app/backend/foreko/services/preparation.py`: recipe validation, preparation execution, inverse-transform metadata, and derived cache.
- `app/backend/foreko/services/validation_policy.py`: folds, metrics, per-series eligibility, selection, and result aggregation.
- `app/backend/foreko/services/ensemble_policy.py`: constrained out-of-fold ensemble weights and promotion guardrails. V2 only, independent of `ensembles.py` (see D2).
- `app/backend/foreko/services/factor_plan.py`: covariate roles, baseline plan alignment, fill-policy enforcement, and scenario copies.
- `app/backend/foreko/services/actuals.py`: actual import, issued-value matching, and post-issue metrics.
- `app/backend/foreko/routers/projects.py`: project CRUD and synchronous metadata endpoints.
- `app/backend/foreko/routers/project_jobs.py`: Prepare, Validate, Forecast, Scenario, issue, actuals, accuracy, SSE, and cancellation endpoints.

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

## Global Constraints

- All data remains local under `FOREKO_STORAGE_DIR`; add no telemetry, account, remote log, or hosted API.
- Keep TimesFM and LightGBM as the primary engines; add no foundation model.
- Keep V1 routes working throughout the migration.
- Use MASE as the default selection metric; MAPE is informational only.
- Multi-series selection is independent per series in V2.0; hierarchy reconciliation is not part of this plan.
- Never silently fabricate required future covariates.
- Never silently substitute a fallback forecast for a failed model.
- An issued forecast is immutable.
- Use existing async jobs and SSE for Prepare, Validate, Forecast, and Scenario runs.
- User-facing copy contains no em dashes.
- Every task follows TDD.

### Commit granularity

The prior plan allowed one commit per task, which produces unreviewable commits for tasks the
size of Task 5. Each task below lists explicit commit points. A commit lands when its tests pass.
Tasks 5 and 6 have three commit points each.

### On TDD steps

Write the failing test, watch it fail **for the right reason**, then implement. A test that fails
with `ModuleNotFoundError` has not demonstrated anything about behavior, so those steps are not
listed separately here. Where a test's first meaningful red state matters, the step says what the
assertion should report.

---

### Task 0: Add a schema version and migration runner

This task did not exist in the prior plan. Design §6.7 requires "an explicit, versioned
migration" and §10.5 requires that "migration failure leaves the prior schema untouched", but
`store.py:21-61` has no versioning primitive of any kind. Without this task, design §13.1's
required test ("additive migration from a populated V1 database") has nothing to test, and every
future column addition silently no-ops on existing databases.

**Files:**
- Create: `app/backend/foreko/services/migrations.py`
- Create: `app/backend/tests/unit/test_migrations.py`
- Modify: `app/backend/foreko/services/store.py:105-107`

**Interfaces:**
- Consumes: an open `sqlite3.Connection`.
- Produces: `SCHEMA_VERSION`, `Migration`, `MIGRATIONS`, `current_version()`, `run_migrations()`.

- [ ] **Step 1: Write failing migration tests**

```python
def test_v1_database_without_user_version_is_adopted_at_baseline(tmp_path: Path) -> None:
    db = tmp_path / "foreko.db"
    legacy = sqlite3.connect(db)
    legacy.executescript(LEGACY_V1_SCHEMA)   # verbatim copy of store._SCHEMA
    legacy.execute(
        "INSERT INTO forecast_history VALUES ('h1','d1','timesfm','2026-01-01',12,'{}')"
    )
    legacy.commit()
    legacy.close()

    store = Store(db)  # must adopt, not wipe
    assert current_version(db) == SCHEMA_VERSION
    assert len(store.history_list("d1")) == 1


def test_failed_migration_leaves_prior_schema_untouched(tmp_path: Path) -> None:
    db = tmp_path / "foreko.db"
    Store(db)
    before = _table_names(db)
    with pytest.raises(MigrationError):
        run_migrations(db, migrations=[*MIGRATIONS, _exploding_migration()])
    assert _table_names(db) == before
    assert current_version(db) == SCHEMA_VERSION
```

The first test is the one that matters. An existing user's `~/.foreko/data/foreko.db` has
`user_version = 0` and four populated tables. Adopting it at the baseline version without
touching its rows is the whole point.

- [ ] **Step 2: Implement the version primitive**

```python
SCHEMA_VERSION = 1   # 1 = the current four-table baseline; Task 1 adds 2

@dataclass(frozen=True)
class Migration:
    version: int
    description: str
    statements: tuple[str, ...]

def current_version(db_path: Path) -> int: ...
def run_migrations(db_path: Path, *, migrations: Sequence[Migration] = MIGRATIONS) -> int: ...
```

Rules:
- Version is read and written with `PRAGMA user_version`. It needs no table.
- A database whose `user_version` is 0 but which already contains `analyses` is a V1 install:
  stamp it to version 1 without running migration 1. A database with neither is fresh: run every
  migration from 0.
- Each migration runs inside a single `BEGIN IMMEDIATE` transaction with its `PRAGMA user_version`
  bump as the last statement, so a failure rolls back the DDL and the version together. SQLite
  supports transactional DDL, which is what makes design §10.5 achievable.
- `run_migrations` raises `MigrationError` and never leaves a partial version.
- Migrations are append-only. Never edit a shipped migration.

- [ ] **Step 3: Route `Store._init_schema` through the runner**

Replace the `executescript(_SCHEMA)` call at `store.py:105-107` with `run_migrations(self.db_path)`.
Migration 1 is the current `_SCHEMA` verbatim, so a fresh database is byte-identical to today.
Migration 2 is added by Task 1.

- [ ] **Step 4: Run tests**

Run: `uv run pytest app/backend/tests -q -m "not integration"`

Expected: new tests pass and the whole unit suite stays green. There is no
`test_store.py`; `Store` is covered indirectly, so the full suite is the real
regression gate here.

- [ ] **Commit:** `feat(store): add versioned sqlite migrations`

### Task 1: Add project schemas, the project domain migration, and the metadata store

Ordering note: the prior plan defined `ProjectRevisionCreate` with
`preparation_steps: list[dict[str, Any]]` and `covariate_roles: dict[str, str]` because the typed
models arrived in Tasks 4 and 6. That contradicts design §7.2 ("all mutation schemas reject
unknown fields") and writes untyped blobs into SQLite that nothing later comes back to tighten.
`PreparationStep` and `CovariateRole` are therefore defined here, in Step 1, before anything
consumes them. Their execution logic still lands in Tasks 4 and 6.

**Files:**
- Create: `app/backend/foreko/schemas/project.py`
- Create: `app/backend/foreko/services/project_store.py`
- Create: `app/backend/foreko/services/project_artifacts.py`
- Create: `app/backend/tests/unit/test_project_store.py`
- Modify: `app/backend/foreko/services/migrations.py` (append migration 2)
- Modify: `app/backend/foreko/services/store.py:298-305`
- Modify: `app/backend/foreko/deps.py:44-51`
- Modify: `app/backend/foreko/settings.py:98-107`

**Interfaces:**
- Consumes: `Settings.db_path`, `Settings.storage_dir`, `ColumnMapping`, `validate_segment`.
- Produces: `ProjectStore`, `ProjectCreate`, `ProjectPatch`, `ProjectDetail`,
  `ProjectRevisionCreate`, `ProjectRevision`, `ProjectRun`, `PreparationStep`, `CovariateRole`,
  `project_dir()`, `dataset_fingerprint()`, `atomic_write_json()`.

- [ ] **Step 1: Define the full typed vocabulary up front**

```python
ProjectStage = Literal["prepare", "validate", "forecast", "plan", "review"]
ProjectStatus = Literal["draft", "ready"]            # see amendment A2
RunStatus = Literal["queued", "running", "done", "error", "cancelled"]
ModelId = Literal["timesfm", "lightgbm", "ets", "seasonal_naive", "arima", "prophet"]

PreparationKind = Literal[
    "aggregate_duplicates", "insert_missing_periods", "impute", "winsorize",
    "log", "box_cox", "diff", "seasonal_diff",
]
CovariateRole = Literal[
    "historical_only", "known_future_numerical", "known_future_categorical",
    "calendar_generated", "static_numerical", "static_categorical", "scenario_controlled",
]

class PreparationStep(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: PreparationKind
    method: str | None = None
    period: int | None = Field(default=None, ge=1, le=366)
    lower_quantile: float | None = Field(default=None, ge=0, le=1)
    upper_quantile: float | None = Field(default=None, ge=0, le=1)

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
    preparation_steps: list[PreparationStep]          # typed, not dict[str, Any]
    candidate_models: list[ModelId]
    folds: int = Field(default=5, ge=2, le=10)
    primary_metric: Literal["mase", "wape", "smape"] = "mase"
    covariate_roles: dict[str, CovariateRole]         # typed, not dict[str, str]
    champion_override: dict[str, str] = Field(default_factory=dict)
```

Response models carry explicit fields, `schema_version: Literal[1] = 1`, UTC timestamps, a
computed `is_archived: bool`, and parsed `config` objects. Do not expose raw SQLite rows. Do not
add `delete_confirmation_token` (decision D3).

- [ ] **Step 2: Write failing project-store tests**

```python
def test_project_revision_and_archive_roundtrip(tmp_path: Path) -> None:
    store = ProjectStore(tmp_path / "foreko.db")
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
    assert store.list_projects(include_archived=True)[0].is_archived is True
```

```python
def test_store_is_keyed_by_database_path(tmp_path: Path) -> None:
    a, b = tmp_path / "a.db", tmp_path / "b.db"
    assert get_project_store(a) is get_project_store(a)   # same path, cached
    assert get_project_store(a) is not get_project_store(b)
```

The identity assertion on the same path is the half the prior plan omitted. Without it, an
implementation that returns a fresh instance on every call passes.

```python
def test_revision_rejects_unknown_preparation_step(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        ProjectRevisionCreate.model_validate({..., "preparation_steps": [{"kind": "bogus"}]})
```

- [ ] **Step 3: Append migration 2 and implement the store**

Migration 2 creates `projects`, `project_revisions`, `project_runs`, `issued_forecasts`, and
`project_actuals` with foreign keys `ON DELETE CASCADE` (already enabled by `store.py:99`),
indexes by project and timestamp, and a unique `(project_id, revision_no)` constraint.

```python
class ProjectStore:
    def __init__(self, db_path: Path) -> None: ...
    def create_project(self, request: ProjectCreate) -> ProjectDetail: ...
    def list_projects(self, *, include_archived: bool = False) -> list[ProjectSummary]: ...
    def get_project(self, project_id: str) -> ProjectDetail | None: ...
    def patch_project(self, project_id: str, request: ProjectPatch) -> ProjectDetail: ...
    def delete_project(self, project_id: str) -> bool: ...
    def create_revision(self, project_id: str, request: ProjectRevisionCreate) -> ProjectRevision: ...
    def list_revisions(self, project_id: str) -> list[ProjectRevision]: ...
    def create_run(self, request: ProjectRunCreate) -> ProjectRun: ...
    def finish_run(self, run_id: str, artifact_path: str, summary: dict[str, Any]) -> ProjectRun: ...
    def fail_run(self, run_id: str, error: str, *, cancelled: bool = False) -> ProjectRun: ...
    def list_runs(self, project_id: str) -> list[ProjectRun]: ...
```

- [ ] **Step 4: Fix the `get_store` singleton**

`store.py:298-305` ignores `db_path` after the first call, so a second call with a different path
silently returns the first store. Replace the module global with a dict keyed by
`db_path.resolve()`, guarded by the existing `_db_lock`. Apply the same pattern to
`get_project_store`. This is a real bug independent of V2, so it also belongs in the changelog.

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

Add `projects` to `Settings.ensure_dirs()` at `settings.py:98-107` **and** to `_WIPEABLE_DIRS` at
`routers/system.py:64`. These are two hand-maintained copies of one list, so a directory added to
only the first leaks past a storage wipe. Add a test that asserts the two lists are equal, which
prevents the next person from hitting the same trap.

- [ ] **Step 6: Run focused and regression tests**

Run: `uv run pytest app/backend/tests/unit/test_project_store.py app/backend/tests/unit/test_migrations.py app/backend/tests/unit/test_dataset_store.py app/backend/tests/unit/test_system_endpoints.py -q`

Expected: all pass, with no test sharing data across `tmp_path` databases.

- [ ] **Commit:** `feat(projects): add versioned project persistence`

### Task 2: Expose project CRUD, revisions, and workflow state

**Files:**
- Create: `app/backend/foreko/services/project_workflow.py`
- Create: `app/backend/foreko/routers/projects.py`
- Create: `app/backend/tests/unit/test_projects_router.py`
- Create: `app/backend/tests/unit/test_project_workflow.py`
- Modify: `app/backend/foreko/main.py:129-135` (CORS), `main.py:188-212` (router registration)

**Interfaces:**
- Consumes: `ProjectStore`, `ProjectRevision`, project artifact paths.
- Produces: `WorkflowState`, `StageState`, `compute_workflow_state()`, `/api/projects` CRUD.

- [ ] **Step 1: Write failing router and invalidation tests**

```python
def test_project_crud_and_delete_confirmation(client, uploaded_dataset_id: str) -> None:
    created = client.post("/api/projects", json={
        "name": "Demand Plan", "dataset_id": uploaded_dataset_id, "description": ""
    })
    assert created.status_code == 201
    project_id = created.json()["id"]
    assert client.delete(f"/api/projects/{project_id}").status_code == 409
    assert client.delete(f"/api/projects/{project_id}?confirm=true").status_code == 204
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

- [ ] **Step 2: Implement workflow state as a pure function**

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
) -> WorkflowState: ...
```

Express the dependency table as data, not nested conditionals. Design §7.3 lists seven
invalidation rules; unit-test each one by name, including the two that are easy to get wrong: a
scenario-only change must not invalidate the baseline or Review, and new actuals must invalidate
Review only.

- [ ] **Step 3: Implement strict CRUD endpoints**

```python
router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("", response_model=ProjectDetail, status_code=201)
def create_project(request: ProjectCreate, store: ProjectStore = Depends(get_project_db)) -> ProjectDetail: ...

@router.patch("/{project_id}", response_model=ProjectDetail)
def patch_project(project_id: str, request: ProjectPatch, store: ProjectStore = Depends(get_project_db)) -> ProjectDetail: ...

@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, confirm: bool = False, store: ProjectStore = Depends(get_project_db)) -> Response: ...
```

`confirm` defaults to false and a missing confirmation returns 409 without touching SQLite or the
filesystem (decision D3).

- [ ] **Step 4: Register the router and add PATCH to CORS**

`main.py:133` currently allows `GET`, `POST`, `DELETE`, `OPTIONS`. Add `PATCH`, or every
`patch_project` call fails preflight from the browser while passing in TestClient, which is
exactly the kind of bug that reaches a user. Add a test asserting the allowlist contains PATCH.

- [ ] **Step 5: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_projects_router.py app/backend/tests/unit/test_project_workflow.py app/backend/tests/unit/test_hardening.py -q`

Expected: all pass, including traversal rejection and missing-confirmation behavior.

- [ ] **Commit:** `feat(projects): expose project workflow api`

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
- Modify: `app/frontend/src/App.tsx:145,209-231,264-281`

- [ ] **Step 1: Add the missing HTTP helpers and wire types**

`client.ts` has `apiGet`, `apiPost`, `apiPut`, `apiUpload`. Both `apiPatch` and `apiDelete` are
missing and must be added alongside the existing `handle<T>` error path.

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

Types are hand-mirrored from Pydantic with no codegen, matching the existing 11 files in
`src/types/`. Nothing enforces agreement, so any wire change is a two-sided edit.

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

The second test is design §12's "not color alone" requirement made executable. Keep it.

- [ ] **Step 3: Implement project queries and local UI state**

`useProjectStore` holds only `activeProjectId`, `activeStage`, and `showArchived`. Do not duplicate
TanStack Query's project objects into Zustand.

```typescript
export const projectApi = {
  list: (includeArchived = false) => apiGet<ProjectSummary[]>(`/projects?include_archived=${includeArchived}`),
  get: (id: string) => apiGet<ProjectDetail>(`/projects/${id}`),
  create: (body: ProjectCreate) => apiPost<ProjectDetail>("/projects", body),
  patch: (id: string, body: ProjectPatch) => apiPatch<ProjectDetail>(`/projects/${id}`, body),
  remove: (id: string) => apiDelete<void>(`/projects/${id}?confirm=true`),
  createRevision: (id: string, body: ProjectRevisionCreate) => apiPost<ProjectRevision>(`/projects/${id}/revisions`, body),
};
```

- [ ] **Step 4: Implement the project library and Overview**

Projects page: New Project, active and archived filters, latest status, dataset name, updated
time, next action. Overview: current revision, dataset, horizon, series count, latest validation,
latest issued forecast, and one Continue button linked to the first incomplete stage.

Use existing square-border tokens and local-first copy. Do not reproduce the visual companion's
pixel dimensions literally.

- [ ] **Step 5: Add project routes**

Add lazy routes for `/projects`, `/projects/:projectId`, and the later project pages. Keep every
V1 route. Navigation restructuring is Task 9, not here, because it touches all eleven existing
destinations and deserves its own review.

- [ ] **Step 6: Run frontend tests and typecheck**

Run: `cd app/frontend; npm test -- src/pages/__tests__/ProjectsPage.test.tsx src/components/project/__tests__/StudioStepper.test.tsx; npm run typecheck`

- [ ] **Commit:** `feat(projects): add project library and overview`

### Task 4: Implement reversible preparation and the Prepare stage

Scope note: `transformations.py:13-79` already provides tested forward and inverse pairs for
`log`, `box_cox`, `diff`, `seasonal_diff`, and `none`, plus `roundtrip_ok()` at `:82-94`. Reuse
`Transformer`; do not reimplement it. The genuinely new transforms are `winsorize`, `impute`, and
`insert_missing_periods`. `aggregate_duplicates` wraps the existing
`series.py:106 aggregate_duplicates_by_date`.

**Files:**
- Create: `app/backend/foreko/services/preparation.py`
- Create: `app/backend/tests/unit/test_preparation.py`
- Modify: `app/backend/foreko/services/transformations.py`
- Create: `app/backend/foreko/routers/project_jobs.py`
- Create: `app/frontend/src/pages/ForecastStudioPage.tsx`
- Create: `app/frontend/src/components/project/PrepareStage.tsx`
- Create: `app/frontend/src/components/project/PreparationRecipeEditor.tsx`
- Create: `app/frontend/src/components/project/__tests__/PrepareStage.test.tsx`
- Create: `app/frontend/src/hooks/useProjectJob.ts`

- [ ] **Step 1: Write preparation tests for immutability and round-trip**

```python
@pytest.mark.parametrize("kind", ["none", "log", "box_cox", "diff", "seasonal_diff"])
def test_recipe_roundtrip_preserves_original_scale(kind: str, monthly_series: np.ndarray) -> None:
    recipe = PreparationRecipe(steps=[PreparationStep(kind=kind, period=12 if kind == "seasonal_diff" else 1)])
    prepared = prepare_series(monthly_series, recipe)
    restored = prepared.inverse(prepared.values, context=monthly_series)
    expected = monthly_series[prepared.history_offset:]
    assert np.allclose(restored, expected, atol=1e-3)


def test_prepare_artifact_does_not_modify_source(tmp_path: Path, source_parquet: Path) -> None:
    before = source_parquet.read_bytes()
    artifact = prepare_project(source_parquet, recipe_fixture, tmp_path / "derived")
    assert source_parquet.read_bytes() == before
    assert artifact.path.exists()
    assert artifact.recipe_hash


def test_non_invertible_recipe_cannot_become_forecast_ready(negative_series: np.ndarray) -> None:
    recipe = PreparationRecipe(steps=[PreparationStep(kind="log")])
    with pytest.raises(PreparationError) as exc:
        prepare_series(negative_series, recipe)
    assert "log" in str(exc.value)
```

The third test is design §6.2's hard rule ("a recipe that cannot round-trip within the configured
numerical tolerance cannot be selected for forecasting"). Note `transformations.py:26-30` currently
auto-shifts non-positive values for log rather than refusing. Decide explicitly: V2 preparation
must refuse and report, so `prepare_series` validates before delegating and does not rely on the
V1 auto-shift.

- [ ] **Step 2: Implement typed recipes and cached artifacts**

```python
class PreparedArtifact(BaseModel):
    source_fingerprint: str
    recipe_hash: str
    path: Path
    row_count: int
    series_count: int
    history_offsets: dict[str, int]
    inverse_state_path: Path
```

Cache by `sha256(source_fingerprint + canonical recipe JSON)`. Write Parquet and inverse-state
JSON to a temporary directory, validate, then rename atomically so a failed recipe leaves the
prior artifact intact (design §10.2).

- [ ] **Step 3: Add Prepare job orchestration and the generic SSE hook**

`POST /api/projects/{project_id}/prepare` creates a `ProjectRun(stage="prepare")` via
`GenericJobManager` (`jobs/generic.py:36-90`), streams `load`, `transform`, `validate`, `persist`,
then finishes with artifact summary and preflight result. Cancellation before the atomic rename
leaves the previous prepared artifact current.

`hooks/useJobEvents.ts:21` hardcodes the finetune SSE URL, so it cannot be reused. Write
`useProjectJob.ts` as a URL-parameterized hook. Do not modify `useJobEvents.ts` in this task;
V1 finetune keeps its own path.

- [ ] **Step 4: Write and implement the Prepare stage UI**

The failing component test must show that an invalid log transform on non-positive values names
the exact affected series and that Run Prepare stays disabled until the recipe is valid.

UI: source summary, mapping, frequency, covariate roles, preflight cards, ordered recipe steps,
before and after preview, streamed job progress. Saving a changed recipe creates a new revision
before starting the job.

- [ ] **Step 5: Run focused tests**

Run: `uv run pytest app/backend/tests/unit/test_preparation.py app/backend/tests/unit/test_project_workflow.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/PrepareStage.test.tsx; npm run typecheck`

- [ ] **Commit:** `feat(projects): add reversible preparation stage`

### Task 5: Make rolling validation the per-series selection engine

This is the largest and highest-risk task in the plan. The prior plan folded it into one commit
and did not mention either of the two blockers below.

**Blocker 1: backtesting is single-series.** `backtest.py:176-177` reads `values[0]` and
`dates[0]` and discards every other series. Design §6.3 requires independent per-series selection,
so the selection engine must become multi-series before any of §6.3 is reachable. Forecasting is
already multi-series (`forecaster.py` groups by `series_id_col` throughout), which is what makes
this gap easy to miss.

**Blocker 2: fold failures are erased, not recorded.** `backtest.py:222-226` catches a model
exception and substitutes `np.full(len(actuals), history[-1])`, then scores that naive forecast as
if the model produced it. A broken model therefore appears as a merely mediocre model. Design
§6.4's eligibility rule ("a model with any failed fold is ineligible for that series") cannot be
implemented on top of this, because the failure has already been laundered into a plausible number.
This is also a live correctness bug in V1 Backtest, so it gets its own commit and changelog line.

**Files:**
- Create: `app/backend/foreko/services/validation_policy.py`
- Create: `app/backend/foreko/services/ensemble_policy.py`
- Create: `app/backend/tests/unit/test_validation_policy.py`
- Create: `app/backend/tests/unit/test_ensemble_policy.py`
- Modify: `app/backend/foreko/services/backtest.py:45-48,153-260,291-309`
- Modify: `app/backend/foreko/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/ValidateStage.tsx`
- Create: `app/frontend/src/components/project/ValidationLeaderboard.tsx`
- Create: `app/frontend/src/components/project/PortfolioExceptionsTable.tsx`
- Create: `app/frontend/src/components/project/__tests__/ValidateStage.test.tsx`

#### Commit point 5a: honest fold failures

- [ ] **Step 1: Write the failure-isolation test**

```python
async def test_failed_model_records_failure_and_does_not_score(monkeypatch) -> None:
    monkeypatch.setattr(backtest, "_forecast_one_model", _raise_on("lightgbm"))
    result = await run_walk_forward(models=["timesfm", "lightgbm"], folds=3, ...)
    assert result["failures"] == [
        {"model": "lightgbm", "fold": f, "reason": ANY} for f in (1, 2, 3)
    ]
    assert result["folds"]["lightgbm"] == []          # no laundered naive scores
    assert len(result["folds"]["timesfm"]) == 3       # healthy model unaffected
```

Watch this fail by reporting three fabricated MASE values for `lightgbm` instead of an empty list.
That failure message is the bug.

- [ ] **Step 2: Replace substitution with recorded failure**

Remove the `np.full(...)` fallback at `backtest.py:222-226`. Add a typed `FoldFailure(model, fold,
series_id, reason)`. A failure is a result row, never a metric row. The existing warning log at
`:223` stays.

Preserve the V1 Backtest response shape by adding `failures` as a new optional key. Existing
consumers (`BacktestPage`, `useBacktestStore`, `ComparisonPage.tsx:42-70`) must keep working.
Verify `ComparisonPage`'s `resolveRecommendation()` still behaves when a model has zero folds.

- [ ] **Commit:** `fix(backtest): record model failures instead of scoring a naive substitute`

#### Commit point 5b: multi-series folds and metrics

- [ ] **Step 3: Make walk-forward multi-series and expose fold predictions**

Replace the `values[0]` / `dates[0]` narrowing at `backtest.py:176-177` with iteration over every
extracted series. `FoldMetrics` at `:45-48` already carries `point_forecast`, `actuals`, `p10`,
and `p90`; `:291-309` simply drops them. Add `series_id` and serialize the arrays into a typed
`FoldPrediction(series_id, model, fold, horizon_step, actual, point, p10, p90)`.

Keep the V1 `/api/backtest` response single-series by default so `BacktestPage` and its cache
contract do not change. Multi-series output is additive and opt-in.

- [ ] **Step 4: Implement the metrics missing today**

`backtest.py` has MASE (`:74-81`), sMAPE (`:58-63`), pinball (`:84-86`), MAPE, RMSE, MAE. Add
`wape` and `signed_bias_pct`. Interval coverage exists at `calibration.py:77`; reuse it rather
than writing a second implementation.

```python
def wape(actual: NDArray[np.float64], predicted: NDArray[np.float64]) -> float: ...
def signed_bias_pct(actual: NDArray[np.float64], predicted: NDArray[np.float64]) -> float: ...
```

Test each against zeros, negatives, missing actuals, and constant series, returning `None` with a
structured reason rather than a fabricated zero (design §13.1).

- [ ] **Commit:** `feat(backtest): add multi-series folds, wape, and signed bias`

#### Commit point 5c: selection and ensemble policy

- [ ] **Step 5: Write selection and ensemble tests**

```python
def test_each_series_selects_its_own_policy() -> None:
    result = select_policies(validation_fixture_two_series())
    assert result.series_policies["egypt"].champion == "timesfm"
    assert result.series_policies["uae"].champion == "lightgbm"
    assert result.portfolio_metrics.mase == pytest.approx(0.65)


def test_model_with_any_failed_fold_is_ineligible_for_that_series_only() -> None:
    result = select_policies(fixture_where_lightgbm_fails_fold_2_for_egypt_only())
    assert result.series_policies["egypt"].champion != "lightgbm"
    assert result.series_policies["uae"].champion == "lightgbm"


def test_ensemble_requires_two_percent_gain_without_bias_regression() -> None:
    weights = fit_ensemble_weights(oof_predictions, actuals)
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.79, bias_pct=1.1, coverage=0.80),
        weights=weights,
    )
    assert decision.promoted is False
    assert decision.reason == "Ensemble improvement 1.25% is below the 2.00% threshold."


def test_ensemble_with_sufficient_gain_is_blocked_by_bias_regression() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.70, bias_pct=2.0, coverage=0.80),   # 12.5% gain, +1.0pp bias
        weights=equal_weights(),
    )
    assert decision.promoted is False
    assert "bias" in decision.reason
```

The last test is new. The prior plan quantified only the 2 percent gate, so design §6.4's "does
not materially worsen signed bias or interval coverage" had no number and no coverage. Amendment
A1 fixes the numbers; this test fixes the coverage.

- [ ] **Step 6: Implement selection**

```python
def select_series_policy(
    predictions: Sequence[FoldPrediction],
    failures: Sequence[FoldFailure],
    primary_metric: Literal["mase", "wape", "smape"],
) -> SeriesModelPolicy: ...
```

Eligibility requires every configured fold to have completed for that series. Fit non-negative
weights with `scipy.optimize.nnls`, normalize, and fall back to inverse-MASE only when NNLS fails
or sums to zero, recording the fallback. Compare ensemble and individual metrics on identical
out-of-fold rows. Per design §6.3, the portfolio primary score is the equal-weight mean of valid
per-series scores, with WAPE also shown at portfolio level.

Do not import `services/ensembles.py` (decision D2). Add a docstring to that module marking it the
V1 inverse-MAPE path serving `POST /api/ensemble/combine`.

- [ ] **Step 7: Add the Validate job and persisted result**

Stream series, fold, and model progress. Store raw out-of-fold rows as compressed Parquet under
the run directory and the summary in SQLite. A candidate failure is a result row, not a job
failure, unless no eligible policy exists for any series (design §10.1).

- [ ] **Step 8: Implement the Validate UI**

Configure two to ten folds and candidates. When history cannot support the request, propose the
largest valid fold count and require confirmation; never silently reduce it (design §6.3). Show
portfolio metrics plus a series-level leaderboard. Manual champion override requires a reason and
creates a new revision.

Test: zero-value MAPE warning, candidate failure visibility, ensemble promotion reason, per-series
selection, and the reduced-fold confirmation.

- [ ] **Step 9: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_validation_policy.py app/backend/tests/unit/test_ensemble_policy.py app/backend/tests/unit/test_backtest.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/ValidateStage.test.tsx; npm run typecheck`

Expected: all pass and V1 backtest tests remain green.

- [ ] **Commit:** `feat(projects): select models from rolling validation`

### Task 6: Per-series forecasts, required factor plans, and scenarios

**Files:**
- Create: `app/backend/foreko/services/factor_plan.py`
- Create: `app/backend/tests/unit/test_factor_plan.py`
- Modify: `app/backend/foreko/services/forecaster.py`
- Modify: `app/backend/foreko/services/scenarios.py`
- Modify: `app/backend/foreko/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/ForecastStage.tsx`
- Create: `app/frontend/src/components/project/PlanStage.tsx`
- Create: `app/frontend/src/components/project/FutureFactorGrid.tsx`
- Create: `app/frontend/src/components/project/__tests__/FutureFactorGrid.test.tsx`
- Create: `app/frontend/src/pages/ProjectScenariosPage.tsx`

#### Commit point 6a: factor plans

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


def test_explicit_forward_fill_records_affected_periods() -> None:
    result = materialize_factor_plan(plan_with_forward_fill())
    assert result.values["price"]["2026-09-01"] == 12.5
    assert result.applied_fills == [{
        "covariate": "price", "policy": "forward_fill", "periods": ["2026-09-01"]
    }]
```

- [ ] **Step 2: Implement plan models**

`CovariateRole` already exists from Task 1. Add:

```python
FillPolicy = Literal["none", "forward_fill", "zero"]

class BaselineFactorPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    values: dict[str, dict[str, float | int | str]]
    fill_policies: dict[str, FillPolicy]
```

Calendar generation is deterministic from project frequency and supports month, quarter, day of
week, and weekend. It does not call a holiday API (design §5.5).

- [ ] **Commit:** `feat(projects): require explicit known-future factor plans`

#### Commit point 6b: per-series execution and scenarios

- [ ] **Step 3: Implement per-series policy execution**

`run_project_forecast()` groups prepared data by series id, loads each selected policy, executes
the individual model or ensemble, inverts the preparation transform, and returns exceptions
separately. Never fall back to another model silently, matching the rule established in Task 5a.
A failed series is marked failed and stays visible; successful series complete.

- [ ] **Step 4: Implement scenario deltas**

A scenario copies the baseline factor plan, applies edits, and runs against the same revision and
policies. Store absolute, percentage, and cumulative deltas per series and portfolio. Scenario
edits must not invalidate the baseline (design §7.3), which Task 2's workflow test already pins.

- [ ] **Step 5: Implement Forecast and Plan UIs**

Forecast shows required baseline factor inputs before Run when the policy uses them, then
portfolio totals, calibrated bands, per-series exceptions, model policy, and run manifest. Plan
copies the baseline grid, supports flat, ramp, zero, percentage change, and manual values, then
compares named scenarios side by side.

- [ ] **Step 6: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_factor_plan.py app/backend/tests/unit/test_forecast_flow.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/FutureFactorGrid.test.tsx; npm run typecheck`

- [ ] **Commit:** `feat(projects): add baseline and scenario planning`

### Task 7: Issue immutable forecasts, import actuals, calculate post-issue accuracy

**Files:**
- Create: `app/backend/foreko/services/actuals.py`
- Create: `app/backend/tests/unit/test_actuals.py`
- Modify: `app/backend/foreko/services/project_store.py`
- Modify: `app/backend/foreko/routers/project_jobs.py`
- Create: `app/frontend/src/components/project/ReviewStage.tsx`
- Create: `app/frontend/src/components/project/IssuedForecastBanner.tsx`
- Create: `app/frontend/src/components/project/AccuracySummary.tsx`
- Create: `app/frontend/src/components/project/__tests__/ReviewStage.test.tsx`
- Create: `app/frontend/src/pages/ProjectAccuracyPage.tsx`

- [ ] **Step 1: Write immutability and scoring tests**

```python
def test_issued_forecast_remains_unchanged_after_new_revision(store: ProjectStore) -> None:
    issued = store.issue_run(completed_forecast_run.id, assumptions={"price": 12.5})
    store.create_revision(completed_forecast_run.project_id, changed_horizon_revision())
    reloaded = store.get_issued_forecast(issued.id)
    assert reloaded.run_id == completed_forecast_run.id
    assert reloaded.forecast == issued.forecast


def test_score_matches_series_and_period_only() -> None:
    result = score_issued_forecast(issued_fixture, [
        ActualRow(series_id="egypt", date="2026-08-01", value=103.0),
        ActualRow(series_id="uae", date="2026-08-01", value=81.0),
    ])
    assert result.matched_points == 2
    assert result.metrics.mase >= 0
    assert result.metrics.coverage == 1.0
```

- [ ] **Step 2: Implement issue and actual persistence**

Issuing copies the completed run's forecast values, quantiles, assumptions, manifest, and artifact
hashes into an immutable record. Reject issue when the run is incomplete, stale for the current
revision, or not a Forecast or Scenario run. Actual imports upsert on
`(project_id, series_id, date)` and record import time and source fingerprint. They never update
run or issued tables.

- [ ] **Step 3: Implement post-issue scoring**

```python
class AccuracyMetrics(BaseModel):
    mase: float | None
    wape: float | None
    smape: float | None
    rmse: float | None
    bias_pct: float | None
    pinball_loss: float | None
    coverage_p10_p90: float | None
```

Return `None` plus a structured reason in `metric_warnings` for anything uncomputable. Never
substitute zero.

- [ ] **Step 4: Add issue, actuals, and accuracy endpoints**

`POST /runs/{run_id}/issue`, multipart `POST /actuals`, `GET /accuracy`. Reuse the existing file
loader registry for CSV, Excel, Parquet, and JSON. Require mapping when column names do not match
the project mapping.

- [ ] **Step 5: Implement Review and Accuracy UIs**

Review renders `Backtest evidence` and `Post-issue accuracy` as separate headings, and the API
field names must differ too (design §14). Show issued time, run, revision, assumptions, matched
periods, remaining periods, MASE, WAPE, bias, and coverage. Importing actuals invalidates only the
accuracy query.

- [ ] **Step 6: Run tests**

Run: `uv run pytest app/backend/tests/unit/test_actuals.py app/backend/tests/unit/test_project_store.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/ReviewStage.test.tsx; npm run typecheck`

- [ ] **Commit:** `feat(projects): close the loop with actuals`

### Task 8: Run history, manifests, and export packages

**Files:**
- Create: `app/frontend/src/pages/ProjectRunsPage.tsx`
- Create: `app/frontend/src/components/project/RunManifestDrawer.tsx`
- Create: `app/frontend/src/components/project/__tests__/RunManifestDrawer.test.tsx`
- Modify: `app/backend/foreko/services/exports.py`
- Modify: `app/backend/foreko/routers/project_jobs.py`
- Modify: `app/backend/foreko/routers/system.py:64`
- Create: `app/backend/tests/unit/test_project_exports.py`

- [ ] **Step 1: Write the export package test**

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

- [ ] **Step 2: Implement manifest and package**

Manifest carries schema version, project and revision ids, dataset and recipe fingerprints,
package and model versions, candidate policies, seeds, fill policies, warnings, timestamps, and
artifact hashes. Built in process under the project's exports directory. Assert it contains no
database secrets, since SQL secrets live in the OS keyring (design §11).

- [ ] **Step 3: Implement Runs page and manifest drawer**

List stage, status, revision, start, duration, warnings, and a current or stale label. The drawer
renders the exact manifest and links artifacts. Cancelled and failed runs stay visible.

- [ ] **Step 4: Verify storage wipe covers projects**

Task 1 added `projects` to both `ensure_dirs()` and `_WIPEABLE_DIRS`. Assert here that a wipe
removes project artifacts and project-domain SQLite rows while preserving model weights
(`system.py:60-63`).

- [ ] **Step 5: Run tests and production build**

Run: `uv run pytest app/backend/tests/unit/test_project_exports.py app/backend/tests/unit/test_system_endpoints.py -q`

Run: `cd app/frontend; npm test -- src/components/project/__tests__/RunManifestDrawer.test.tsx; npm run typecheck; npm run build`

- [ ] **Commit:** `feat(projects): add run manifests and packages`

### Task 9: Navigation restructure and V1 reconciliation

Separated from Task 3 because it touches all eleven existing destinations and implements decision
D1. The prior plan handled this in a single step inside the project-library task.

**Files:**
- Modify: `app/frontend/src/App.tsx:145,209-231`
- Modify: `app/frontend/src/data/pageIntros.ts`
- Modify: `app/frontend/src/components/project/ProjectSwitcher.tsx`
- Modify: `app/frontend/e2e/foreko.spec.ts`

- [ ] **Step 1: Relabel `/compare` and resolve the two-Forecast collision**

`App.tsx:214` renders `/compare` with the label `"Forecast"` and `App.tsx:145` sets its document
title to `"Forecast"`. Shipping Forecast Studio without changing this gives the user two
destinations named Forecast that select champions by different methods and can disagree.

Per decision D1: relabel to "Model Comparison" in both places, move it under Advanced Analysis,
and leave the route and `comparison.py` untouched. Update `e2e/foreko.spec.ts:89`, which asserts
on that page. Add a `pageIntros.ts` line stating that Model Comparison uses a single holdout and
that Forecast Studio's rolling validation is the stronger evidence.

- [ ] **Step 2: Implement project-first navigation**

Top-level: Projects, Data Sources, Glossary, Privacy, About (design §5.1). The eleven current
destinations move into a compact Advanced Analysis group, preserving every route. Omit Schedules
entirely; Foreko does not show a disabled destination for an unimplemented subsystem.

- [ ] **Step 3: Verify V1 regression**

Run: `cd app/frontend; npx playwright test e2e/foreko.spec.ts --project=chromium`

Expected: the existing `DATASET_ROUTES` smoke loop (`:88-102`) still passes for all ten V1 routes.

- [ ] **Commit:** `feat(nav): make navigation project-first`

### Task 10: Deterministic browser journey and CI gates

The prior plan made the E2E flow a release gate on "Windows and CI Linux" while modifying a
`.github/workflows/ci.yml` that does not exist. The real file is `main.yml`, it has **no Playwright
job at all**, and `playwright.config.ts` has **no `webServer` block**, so it assumes a dev server
is already running. It also never runs `npm run lint`, though the script exists. This task builds
the gate that the prior plan assumed.

**Files:**
- Create: `app/frontend/e2e/foreko-v2-project.spec.ts`
- Create: `app/frontend/public/samples/multi_series_demand_demo.csv`
- Modify: `app/frontend/playwright.config.ts`
- Modify: `app/backend/tests/conftest.py`
- Modify: `.github/workflows/main.yml`

- [ ] **Step 1: Add deterministic fake candidates behind an env flag**

Extend test-only app configuration so TimesFM, LightGBM, ETS, and seasonal naive return
deterministic but distinct fold predictions, gated by `FOREKO_FAKE_MODELS=1`. The production
service registry stays unchanged and the flag must be inert when unset. Add a unit test asserting
the real registry is returned without the flag.

- [ ] **Step 2: Give Playwright a real server**

Add a `webServer` array to `playwright.config.ts` starting both processes, since the V2 flow needs
the backend:

```typescript
webServer: [
  {
    command: "uv run uvicorn foreko.main:app --port 8000 --app-dir ../../app/backend",
    port: 8000,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,   // torch import is slow on a cold start
    env: {
      FOREKO_FAKE_MODELS: "1",
      FOREKO_STORAGE_DIR: process.env.FOREKO_E2E_STORAGE_DIR!,
    },
  },
  { command: "npm run dev", port: 5173, reuseExistingServer: !process.env.CI },
],
```

`FOREKO_STORAGE_DIR` must point at a fresh empty directory per run, because the journey's first
step is "start from an empty storage directory" (design §13.4). The 180 second timeout is not
padding: a cold backend start on this machine took roughly 70 seconds to answer, dominated by the
torch import chain.

- [ ] **Step 3: Write the journey**

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

Fix only product defects or accessible selectors. Do not weaken an assertion to make it pass.

- [ ] **Step 4: Add the CI job and the missing lint gate**

Add an `e2e` job to `.github/workflows/main.yml` running on `ubuntu-latest` and `windows-latest`,
installing uv and Node, running `npx playwright install --with-deps chromium`, and executing the
suite with a temp `FOREKO_E2E_STORAGE_DIR`. Upload `e2e/artifacts` on failure.

**DECIDED 2026-07-16: installed.** `package.json:11` declared `"lint": "eslint ."` while eslint was
not a dependency and no config existed, so the script had never run. eslint 9 with a flat config is
now installed and `npm run lint` is in CI, making design 13.5's gate real.

The config is deliberately narrow, and that scoping was the actual decision. `eslint-plugin-react-hooks`
v7 ships React Compiler rules (`set-state-in-effect`, `refs`, `purity`, `globals`). Enabling them
produced 21 errors against working code: setting state from a fetched result, a module-level cache,
`Date.now` during render. This app does not use React Compiler, so those rules would have meant
rewriting sound code to satisfy a compiler that is not in the build. They are off, with a note to
revisit if Foreko adopts it. `rules-of-hooks` is an error, `exhaustive-deps` a warning, and tsc
remains the real gate on types.

That left 4 real errors, all dead code in `e2e/foreko.spec.ts`: an uncalled `seedDatasetInApp`, an
unused `request` fixture, a superseded `errorBanner` locator, and the `Page` import they orphaned.
Removed rather than suppressed. `ErrorBoundary.tsx:19` also carried a stale `eslint-disable` for a
rule nobody was running, which is its own evidence that someone once intended this gate to exist.

Result: `npm run lint` exits 0 with one `exhaustive-deps` warning against pre-existing code, which is
a real observation and correctly non-blocking.

Cache the model directory or rely on `FOREKO_FAKE_MODELS=1` so CI performs no model download.
Assert that the journey makes no new outbound network request (design §13.5).

- [ ] **Step 5: Run the full gate set**

Run: `uv run ruff check app/backend/foreko app/backend/tests`

Run: `uv run pytest app/backend/tests -q -m "not integration"`

Run: `cd app/frontend; npm test; npm run typecheck; npm run lint; npm run build`

Run: `cd app/frontend; npx playwright test --project=chromium`

Expected: every command exits zero. Record counts and durations for the release checklist.

- [ ] **Commit:** `test(v2): gate the complete forecast project journey`

### Task 11: Documentation and release review

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `UBIQUITOUS_LANGUAGE.md`
- Modify: `app/frontend/src/pages/PrivacyPage.tsx`, `AboutPage.tsx`
- Modify: `app/frontend/src/data/termDictionary.ts`, `pageIntros.ts`
- Modify: `docs/screenshots/`, `scripts/capture_screenshots.mjs`

- [ ] **Step 1: Update product and storage documentation**

Document Forecast Projects, Studio stages, per-series validation policies, preparation recipes,
baseline factor plans, issued forecasts, actuals, project artifact paths, migration behavior, and
export packages. State explicitly that hierarchy reconciliation, schedules, alerts, and automatic
champion replacement are not in V2.0.

CHANGELOG must record three user-visible fixes that are not V2 features:
the `get_store` singleton (Task 1 Step 4), backtest failure substitution (Task 5a), and the PATCH
CORS method (Task 2 Step 4).

- [ ] **Step 2: Update in-app language**

Add glossary entries to `termDictionary.ts` (which already has 10 categories and a
`shortDefinition` / `businessAngle` / `example` shape at `:13`) for Forecast Project, Project
Revision, Project Run, Issued Forecast, Post-issue Accuracy, MASE, WAPE, Signed Bias, and Coverage.
Update Privacy with every new SQLite table and `~/.foreko/projects/` subdirectory.

- [ ] **Step 3: Refresh screenshots within the D4 budget**

`docs/screenshots/` holds one file because `9827e06` removed ~11 MB on purpose. Capture Studio
screens only where README references them. Ensure no local paths, credentials, or temporary ids
appear.

- [ ] **Step 4: Run the prohibited-copy scan**

Run: `rg -n "—|T[B]D|T[O]DO|coming soon|paid tier|cloud sync|AI assistant" README.md CHANGELOG.md UBIQUITOUS_LANGUAGE.md app/frontend/src`

Expected: no em dashes or placeholder claims. Historical design documents may still describe
intentional non-goals.

- [ ] **Step 5: Re-run every release gate**

Run the full set from Task 10 Step 5.

- [ ] **Step 6: Review against every acceptance criterion**

Walk design §14 one by one. Add a release-note evidence line for project persistence, preparation
immutability, rolling selection, multi-series policies, explicit future factors, immutable
issuance, actual matching, local-only behavior, V1 compatibility, and reproducible reopen.

- [ ] **Commit:** `docs(v2): document forecast projects`

---

## Final completion evidence

V2.0 is complete only when every commit point above exists and the following is reported:

- Backend unit and non-model integration test count and duration.
- Frontend Vitest count and duration.
- TypeScript, ESLint, Ruff, and Vite build status.
- Full Playwright result including the V2 journey, on Windows and CI Linux.
- Evidence that a populated V1 database opens, migrates, and keeps its rows (Task 0).
- Evidence that V1 routes pass the existing `foreko.spec.ts` smoke loop after the Task 9 nav change.
- Git status proving no unintended user files were staged or modified.
- A manual local smoke test using the Windows desktop packaging path, or a documented reason it
  must run in the separate `foreko-desktop` repository.
- A list of deferred V2.1 and V2.2 features confirming none are represented as implemented.

## Known risks

**Task 5 dominates the schedule.** It carries a live bug fix, a multi-series refactor of a service
that V1 pages depend on, a new selection engine, a new ensemble policy, and three UI components.
If any task slips, it is this one. The three commit points exist so it can land incrementally
rather than as one unreviewable change.

**Ten tasks is still not ten commits.** This plan has sixteen commit points and each remains large.
Treat the checkbox list as the unit of work, not the task headings.

**The design's problem #2 is partly stale.** `ComparisonPage.tsx:42-70` already reconciles the
holdout winner against the backtest winner when a backtest exists, so the real V1 gap is the cold
path where no backtest has been run. The V2 workflow remains justified on the other five problems
in design §3, but nobody should cite problem #2 as written to justify scope.

---

## Release evidence (2026-07-16)

Design 14's acceptance criteria, each against the test that holds it.

### Project persistence

- Create, name, archive, reopen, delete: `test_projects_router.py`, `test_project_store.py`.
- Reopening restores the current revision, stage states, policy, scenarios, issued forecast, and accuracy without rerunning: the browser journey reloads and asserts every stage still reads complete.
- Every completed run stays linked to the revision that produced it: `test_project_store.py::test_revisions_are_sequential_and_immutable`, and the workflow marks an older run stale rather than deleting it.

### Preparation

- The original dataset is unchanged: `test_project_prepare_job.py::test_prepare_does_not_modify_the_source_dataset` compares its bytes before and after.
- Transformations are saved and reproducible: recipes live on the revision and the derived artifact is keyed by source fingerprint plus recipe hash.
- A non-invertible recipe cannot become forecast-ready: `test_preparation.py` refuses log on non-positive values and names the count.

### Validation and forecasting

- The headline champion comes from rolling validation, not a holdout: `test_project_validate_job.py`, and `/compare` is now labelled Model Comparison so the two cannot be confused.
- Fold, horizon, series, point-error, bias, and coverage evidence is inspectable: the leaderboard and `validation_policy.MetricSet`.
- Multi-series projects forecast every valid series and expose failures: `test_backtest_multi_series.py`, `test_project_forecast.py`.
- An ensemble is promoted only under the guardrails: `test_ensemble_policy.py`, including the case that clears the 2 percent gate and is still refused on bias.

### Planning

- Required future factors cannot be fabricated: `test_factor_plan.py`, `test_project_forecast_job.py`. Verified by mutation on both the gate and the executor.
- Every filled value is visible and stored: `applied_fills` in the run summary and the run manifest.
- Scenarios show deltas against a versioned baseline: `test_project_scenarios.py`, and a scenario cannot disturb the baseline.

### Review

- The issued forecast is immutable: `test_actuals.py::test_issuing_copies_the_values_rather_than_referencing_the_run`. Mutation-tested by making issuance read through to the live run.
- Actuals are matched by series and period: `test_actuals.py::test_score_matches_series_and_period_only`.
- Post-issue metrics cannot be confused with backtest metrics: separate schemas, separate field names, separate headings, and the journey asserts the Review page states the backtest section is not a measure of the issued forecast.

### Local-first behaviour

- No account, telemetry, hosted API, or narrative model added.
- The journey asserts zero outbound network requests. This is how the Google Fonts stylesheet was found: the README's claim that the only outbound request is the model download was false until it was removed.
- All new data lives under `FOREKO_STORAGE_DIR`, and deleting a project removes its artifacts as well as its rows.

### Gate results

| Gate | Result |
|---|---|
| Backend unit and non-model integration | 393 passed, 12 deselected |
| Frontend Vitest | 70 passed |
| Playwright, Chromium | 16 passed, including the V2 journey |
| Ruff | clean |
| eslint | 0 errors, 1 pre-existing warning |
| TypeScript | clean |
| Production build | succeeds |
| V1 regression | the 15 pre-existing e2e tests pass |

### Deferred, and not represented as implemented

V2.1 (hierarchies, reconciliation, intermittent demand) and V2.2 (schedules,
drift monitoring, alerts, automatic champion replacement) are absent. No control
for either is shown. Schedules do not appear in navigation.

Known gaps, stated rather than hidden:

- Only TimesFM consumes covariates. A project whose champion is a classical model is told plainly that its factors cannot be read, rather than being asked for input that does nothing.
- One `react-hooks/exhaustive-deps` warning in `ScenariosPage`, pre-existing.
- The desktop packaging smoke test belongs to the separate `foreko-desktop` repo and was not run here.
