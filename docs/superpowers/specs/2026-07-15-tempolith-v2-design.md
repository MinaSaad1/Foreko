# Tempolith V2 Design

Date: 2026-07-15

Status: Approved concept, implementation specification pending user review

Scope: V2.0 Forecast Projects and Forecast Studio

## 1. Product decision

Tempolith V2 changes the product from a collection of analysis pages into a persistent forecasting workflow.

The primary outcome is:

> A business user can create a recurring forecast across one or many series, validate the model policy, enter future assumptions, issue the forecast, load actual results later, and reproduce the complete decision without rebuilding the analysis.

V2 preserves Tempolith's existing boundaries:

- Local-first, with all user data stored on the user's machine.
- Apache 2.0, with no paid tier or feature gating.
- Forecasting only. No chat, LLM narrative generation, generic AutoML, or dashboard builder.
- TimesFM and LightGBM remain the primary forecasting engines.
- Existing diagnostics, anomaly detection, factor analysis, scenarios, exports, and classical baselines remain available.

The approved visual companion is stored under `.superpowers/brainstorm/tempolith-v2-20260715/` and illustrates the intended information architecture.

## 2. Release decomposition

The full V2 proposal contains three independently testable releases. They must be implemented in order.

### V2.0: Forecast Projects

V2.0 delivers a complete manual forecasting cycle:

1. Create or reopen a Forecast Project.
2. Prepare the data through a saved, reversible recipe.
3. Validate candidate models through rolling-origin backtests.
4. Generate the baseline forecast using the approved model policy.
5. Enter known-future factors and compare scenarios.
6. Issue and export a versioned forecast.
7. Import actuals manually and score the forecast that was issued.

### V2.1: Portfolio Planning

V2.1 adds hierarchy definition, coherent reconciliation across levels, richer portfolio exceptions, scenario comparison by hierarchy level, and intermittent-demand methods.

### V2.2: Forecast Operations

V2.2 adds scheduled data refresh, automatic actual matching, drift monitoring, threshold alerts, recurring runs, and automated champion/challenger review. Fine-tuning remains an advanced lab feature and may only promote an adapter after it wins the same validation policy used by other candidates.

This specification covers V2.0 only. It defines stable extension points for V2.1 and V2.2 without implementing those later subsystems.

## 3. Current problems addressed

V2.0 addresses six connected product problems:

1. The current navigation is organized by analytical page. Users must carry context between Preflight, Forecast, Backtest, Factors, Scenarios, and Operations.
2. The main Forecast page selects between TimesFM and LightGBM using one holdout and MAPE, while stronger multi-fold evidence is isolated on Backtest.
3. Preflight recommends transformations but does not let the user apply and persist them as part of the forecast.
4. Future covariates are not modeled as an explicit business plan. Historical values may be extended into the future without a clear assumption record.
5. Forecast history foundations exist, but there is no durable object containing the data version, configuration, evidence, assumptions, result, and approval state.
6. Backtesting evaluates simulated historical forecasts, but users cannot score the exact forecast that was issued once actuals arrive.

## 4. Non-goals for V2.0

V2.0 will not add:

- Hierarchical reconciliation or top-down, bottom-up, or MinT methods.
- Automated schedules, background database refresh, or operating-system notifications.
- Automated model retraining or automatic champion replacement.
- Additional foundation models.
- A drag-and-drop dashboard builder.
- Cloud synchronization, accounts, sharing permissions, or team collaboration.
- Narrative generation or an assistant interface.
- Automatic TimesFM fine-tuning in the main workflow.

V1 specialist routes remain available during V2.0. They are not deleted or rewritten unless the V2 workflow directly depends on them.

## 5. Information architecture

### 5.1 Primary navigation

The application sidebar changes from analysis-first navigation to project-first navigation.

Top-level destinations:

- Projects
- Data Sources
- Glossary
- Privacy
- About

Schedules are omitted from V2.0. Tempolith does not show a disabled navigation destination for an unimplemented subsystem.

Within an open project:

- Overview
- Forecast Studio
- Run History
- Scenarios
- Actuals and Accuracy

The existing specialist analyses remain reachable from contextual drilldowns and a compact Advanced Analysis section. They do not compete with the primary workflow.

### 5.2 Forecast Studio stages

The Studio uses five persistent stages:

1. **Prepare**: source, mapping, frequency, transformations, covariate roles, and data-quality result.
2. **Validate**: candidate models, folds, metrics, calibration, diagnostics, and selection evidence.
3. **Forecast**: approved model policy, required baseline future-factor values, baseline forecast, exceptions, and uncertainty.
4. **Plan**: alternative future-factor values, scenarios, decision deltas, and selected plan.
5. **Review**: issued forecast, imported actuals, accuracy, bias, and interval coverage.

Each stage displays one of four states:

- Not started
- Needs attention
- Ready
- Complete

Users may revisit earlier stages. Changing a material upstream configuration invalidates dependent downstream results and explains exactly which stages must be rerun.

### 5.3 Routes

New frontend routes:

```text
/projects
/projects/new
/projects/:projectId
/projects/:projectId/studio/prepare
/projects/:projectId/studio/validate
/projects/:projectId/studio/forecast
/projects/:projectId/studio/plan
/projects/:projectId/studio/review
/projects/:projectId/runs
/projects/:projectId/scenarios
/projects/:projectId/accuracy
```

Existing dataset-specific routes continue to work. Opening an existing analysis route does not silently create a project.

## 6. Domain model and persistence

### 6.1 Forecast Project

A Forecast Project is the durable root object. It has one current revision and an immutable history of prior revisions.

Project identity fields:

- `id`
- `name`
- `description`
- `dataset_id`
- `created_at`
- `updated_at`
- `archived_at`, nullable
- `current_revision`
- `status`

Archiving and permanent deletion are separate operations. Updating `archived_at` archives or reopens a project without removing its history. Permanent deletion uses the DELETE endpoint, requires explicit confirmation in the UI, and removes project metadata and artifacts without deleting the source dataset.

The revision configuration contains:

- Column mapping, including optional `series_id_col`.
- Explicit frequency and optional fiscal-calendar settings.
- Forecast horizon.
- Preparation recipe.
- Candidate models.
- Backtest fold count and evaluation policy.
- Primary selection metric.
- Covariate roles.
- Scenario defaults.
- Random seeds and deterministic runtime options where supported.

### 6.2 Preparation recipe

The original ingested dataset is immutable. Preparation produces a derived dataset view and a content fingerprint.

Supported V2.0 steps:

- Duplicate timestamp aggregation with an explicit aggregation function.
- Missing-period insertion.
- Target imputation using none, forward fill, linear interpolation, seasonal value, or median.
- Outlier treatment using none, winsorization, or replacement with a selected imputation method.
- Log transform.
- Box-Cox transform when values satisfy its requirements.
- First differencing.
- Seasonal differencing with an explicit period.

Every transform must define and test its inverse when forecast values need to return to the original scale. A recipe that cannot round-trip within the configured numerical tolerance cannot be selected for forecasting.

Derived data is cached under the project artifact directory and keyed by source fingerprint plus recipe hash. It never overwrites the source dataset.

### 6.3 Validation policy

V2.0 exposes four standard candidates:

- TimesFM
- LightGBM
- ETS
- Seasonal naive

ARIMA and Prophet remain backend-compatible advanced candidates but are not enabled by default.

The default primary selection metric is MASE. Supporting evidence includes:

- WAPE
- sMAPE
- RMSE
- Signed bias percentage
- Pinball loss
- P10 to P90 empirical coverage
- Metric by forecast horizon
- Metric by fold
- Metric by series when a series identifier is mapped

MAPE may be displayed for familiarity, but it is not the default selection metric and must show a warning for zero or near-zero actual values.

The default validation configuration is five rolling folds. The supported range is two to ten folds. If the available history cannot support the requested folds and horizon, Tempolith proposes the largest valid fold count and requires user confirmation before running. It does not silently change the validation policy.

For a single-series project, the primary score is the mean valid per-fold MASE. For a multi-series project, model selection runs independently per series and produces one selected policy per series. The portfolio summary is the equal-weight mean of valid per-series scores, so a high-volume series does not dominate selection. WAPE is also shown at portfolio level to represent magnitude-weighted business error.

The validation service stores out-of-fold predictions, actuals, quantiles, metrics, warnings, and failures for every fold and candidate.

### 6.4 Model selection and ensemble

The best individual candidate for a series is the model with the lowest aggregate primary metric among candidates that complete every configured fold for that series. A model with any failed fold is ineligible for that series but remains eligible for other series.

V2.0 also creates one candidate ensemble from out-of-fold point predictions:

- Weights are non-negative and sum to one.
- Weights are learned only from out-of-fold predictions.
- A candidate with a failed fold is excluded from the ensemble for that series.
- If the optimizer fails, Tempolith falls back to normalized inverse-MASE weights and records that fallback.
- The ensemble becomes champion only if it improves the primary metric by at least 2 percent relative to the best individual model and does not materially worsen signed bias or interval coverage.

The 2 percent promotion threshold is fixed in V2.0 to prevent configuration overload. It may become configurable in a later release.

The selected policy stores the champion, challenger, ensemble weights when relevant, evaluation metric, fold definition, limitations, and selection reason for each series. Single-series projects store the same structure with one series entry. Project-level metrics summarize these policies but do not replace them with one global champion.

### 6.5 Known-future factors

Each covariate is assigned exactly one role:

- Historical only
- Known future numerical
- Known future categorical
- Calendar generated
- Static numerical
- Static categorical
- Scenario controlled

Known-future and scenario-controlled covariates use a period-by-period plan table. Covariate roles are assigned during Prepare. If the selected model policy requires future covariates, the Forecast stage collects the baseline values before execution. The Plan stage creates alternatives by copying and editing that baseline table. Missing future values block the forecast unless the user explicitly chooses a fill policy for that covariate. The fill policy and its affected periods are stored in the run manifest.

Calendar-generated factors may include month, quarter, day of week, weekend, and user-defined holiday flags. Tempolith does not download holiday data automatically in V2.0.

### 6.6 Runs, issued forecasts, and actuals

A Project Run is immutable after completion. It records:

- Project and revision identifiers.
- Dataset and derived-data fingerprints.
- Runtime and package versions.
- Model identifiers and compile configuration.
- Parameters and seeds.
- Stage and job state.
- Started and completed timestamps.
- Result artifact references.
- Warnings, partial failures, and cancellation reason.

The user may mark one completed baseline or scenario run as issued. Issuing creates an immutable issued-forecast record containing the forecast values, intervals, assumptions, and export metadata.

Actuals are stored by project, series, and timestamp. Importing actuals does not mutate the issued forecast. Review metrics always compare actuals with the values that were issued for matching periods.

### 6.7 SQLite schema

V2.0 adds the following tables through an explicit, versioned migration:

- `projects`
- `project_revisions`
- `project_runs`
- `issued_forecasts`
- `project_actuals`

Large prediction arrays and data snapshots remain filesystem artifacts. SQLite stores metadata, hashes, summaries, and artifact paths.

Project artifacts live under:

```text
~/.tempolith/projects/<project_id>/
  derived/
  runs/<run_id>/
  exports/
```

All project and run identifiers use the existing safe path-segment validation.

Existing V1 tables remain intact. The migration is additive and idempotent. An installation can open V1 data without creating projects until the user explicitly creates one.

## 7. Backend architecture

### 7.1 New bounded modules

New service modules:

- `project_store.py`: project, revision, run, issued forecast, and actual metadata persistence.
- `project_artifacts.py`: filesystem paths, fingerprints, atomic writes, and cleanup.
- `preparation.py`: recipe validation, transform execution, inverse transforms, and derived cache.
- `validation_policy.py`: fold generation, metric aggregation, candidate eligibility, and selection.
- `ensemble_policy.py`: out-of-fold weight fitting and promotion guardrails.
- `factor_plan.py`: covariate role validation, future-plan alignment, and fill-policy enforcement.
- `actuals.py`: actual import, matching, and issued-forecast scoring.
- `project_workflow.py`: stage readiness, invalidation rules, and orchestration only.

`project_workflow.py` may coordinate the modules but must not implement forecasting algorithms, persistence SQL, or transformation mathematics.

Existing services remain the execution engines:

- Dataset loaders and `dataset_store`
- TimesFM `ModelRegistry`
- LightGBM and classical baselines
- Backtest metric primitives
- Covariate forecasting
- Scenarios
- Diagnostics
- PDF export
- Job manager and SSE events

### 7.2 API surface

New API groups:

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/{project_id}
PATCH  /api/projects/{project_id}
DELETE /api/projects/{project_id}

POST   /api/projects/{project_id}/revisions
GET    /api/projects/{project_id}/revisions

POST   /api/projects/{project_id}/prepare
POST   /api/projects/{project_id}/validate
POST   /api/projects/{project_id}/forecast
POST   /api/projects/{project_id}/scenarios/run

GET    /api/projects/{project_id}/runs
GET    /api/projects/{project_id}/runs/{run_id}
POST   /api/projects/{project_id}/runs/{run_id}/issue

POST   /api/projects/{project_id}/actuals
GET    /api/projects/{project_id}/accuracy

GET    /api/project-jobs/{job_id}
GET    /api/project-jobs/{job_id}/events
POST   /api/project-jobs/{job_id}/cancel
```

Project creation and metadata updates are synchronous. Prepare, validate, forecast, and scenario execution use the existing async job model with SSE progress and cancellation.

All mutation schemas reject unknown fields. Project and revision responses include a schema version.

`PATCH /api/projects/{project_id}` handles metadata changes, archive, and reopen. `DELETE /api/projects/{project_id}` performs permanent deletion only after the frontend sends an explicit confirmation token returned by a preceding project-detail request.

### 7.3 Invalidation rules

Changes invalidate downstream results as follows:

- Source or mapping change invalidates Prepare, Validate, Forecast, Plan, and Review.
- Preparation recipe change invalidates Validate, Forecast, Plan, and Review.
- Validation configuration or candidate change invalidates Validate, Forecast, Plan, and Review.
- Champion override invalidates Forecast, Plan, and Review.
- Factor-role or future-plan change invalidates Forecast when required by the model policy, plus Plan and Review.
- Scenario-only change invalidates the affected scenario result, not the baseline forecast or Review. Review changes only when the issued run changes or new actuals arrive.
- New actuals invalidate only Review metrics.

Invalidation never deletes immutable completed runs. It marks them as based on an older revision and prevents them from appearing as the current result.

## 8. Frontend architecture

### 8.1 Pages and components

New pages:

- `ProjectsPage`
- `ProjectCreatePage`
- `ProjectOverviewPage`
- `ForecastStudioPage`
- `ProjectRunsPage`
- `ProjectScenariosPage`
- `ProjectAccuracyPage`

Forecast Studio is a shell with stage components:

- `PrepareStage`
- `ValidateStage`
- `ForecastStage`
- `PlanStage`
- `ReviewStage`

Shared project components:

- `ProjectSwitcher`
- `ProjectHealthBadge`
- `StudioStepper`
- `StageReadinessPanel`
- `RunManifestDrawer`
- `ValidationLeaderboard`
- `PortfolioExceptionsTable`
- `FutureFactorGrid`
- `IssuedForecastBanner`
- `AccuracySummary`

Large stage components must keep data orchestration in hooks and rendering in focused child components.

### 8.2 Client state

TanStack Query owns server state, caching, invalidation, and refetching.

Zustand stores only local interface state that should survive navigation, such as the active project id, selected Studio stage, table preferences, and unsaved factor-grid edits. The server is the source of truth for projects, revisions, runs, and issued forecasts.

New hooks:

- `useProject`
- `useProjectRevision`
- `useProjectWorkflow`
- `useProjectJobEvents`
- `useValidationRun`
- `useForecastRun`
- `useProjectActuals`

The existing per-page orchestrator hooks remain for V1 routes and may be reused internally where their contracts fit.

### 8.3 Interaction rules

- Creating a project starts with source selection and mapping. It does not run a model automatically.
- Every expensive action shows an estimate of what will run, then streams stage and model progress.
- The user may cancel a job without losing the last completed result.
- A stage cannot display Ready until its required artifacts exist for the current project revision.
- Manual champion override is allowed only after validation completes. The override and reason are stored in the revision.
- Issuing a forecast requires a complete baseline or scenario run and an explicit confirmation that assumptions have been reviewed.
- The Review stage distinguishes backtest evidence from post-issue accuracy.

## 9. Data flow

### 9.1 Create and prepare

1. User selects an existing dataset or ingests a new source.
2. Frontend creates a project with mapping and frequency.
3. Backend stores revision 1.
4. Prepare job loads the immutable source, validates the recipe, writes the derived artifact atomically, and stores its fingerprint.
5. Project workflow marks Prepare ready and Validate available.

### 9.2 Validate and select

1. User confirms candidates, folds, horizon, and primary metric.
2. Backend creates a validation run and starts a project job.
3. Each fold executes candidates through shared forecast adapters.
4. Out-of-fold predictions and metrics are written incrementally.
5. Ensemble policy fits weights from completed out-of-fold predictions.
6. Selection policy applies eligibility and promotion guardrails.
7. Backend finalizes the immutable run and stores the selected policy in a new project revision.

### 9.3 Forecast and plan

1. Forecast job loads the current derived artifact and selected policy.
2. Factor plan validation checks the baseline table for every required future period.
3. The selected per-series candidates or ensembles generate baseline forecasts for all mapped series.
4. Inverse transformations return values and intervals to the original scale.
5. User creates scenarios by changing future factor plans.
6. Scenario runs store deltas versus the baseline and remain linked to the same baseline revision.

### 9.4 Issue and review

1. User issues one completed baseline or scenario run.
2. Tempolith freezes its values, intervals, assumptions, manifest, and export artifacts.
3. User later imports actuals from a file or the existing data source.
4. Actuals service matches project, series, and date keys without altering the issued run.
5. Review calculates MASE, WAPE, sMAPE, bias, RMSE, pinball loss where quantiles exist, and empirical interval coverage for matched periods.

## 10. Error handling and recovery

### 10.1 Validation failures

Candidate failure is isolated by model, fold, and series. A failed candidate does not fail the complete validation job when enough eligible candidates remain. The result identifies failures and excludes invalid comparisons.

The complete validation job fails when:

- No candidate completes the minimum fold policy.
- The prepared data no longer matches its fingerprint.
- Required series are shorter than the minimum length.
- Metric calculation produces no valid comparison periods.

### 10.2 Preparation failures

Preparation writes to a temporary artifact and renames it only after validation succeeds. A failed recipe leaves the prior prepared artifact intact.

Transform errors name the transform, affected series, and requirement. Examples include non-positive values for log, invalid Box-Cox input, or an insufficient seasonal history.

### 10.3 Factor-plan failures

The forecast is blocked when required future values are missing. The response lists every covariate and period requiring input. Silent last-value extension is not allowed unless the saved fill policy explicitly requests it.

### 10.4 Cancellation and restart

Cancellation preserves completed fold artifacts but marks the run cancelled. V2.0 does not resume a cancelled validation in place. A retry creates a new run and may reuse safe cached candidate results with matching hashes.

### 10.5 Storage and migration failures

Database migrations run before the app serves project routes. Migration failure leaves the prior schema untouched where SQLite transaction support permits and prevents project mutations. Existing V1 routes remain readable when safe.

## 11. Security and privacy

- No telemetry, remote logging, or analytics are added.
- Model weight download remains the only default outbound request.
- SQL secrets continue to use the operating-system keyring.
- Project manifests never store database passwords.
- Logs contain ids, hashes, durations, and error summaries, not raw series values.
- Exported project packages include user data only after an explicit export action.
- Project, run, and artifact identifiers use safe path validation.
- File writes use atomic replacement and remain inside `TEMPOLITH_STORAGE_DIR`.

## 12. Accessibility and product language

- The complete workflow is keyboard accessible.
- The Studio stepper exposes stage state through text and ARIA attributes, not color alone.
- Charts retain accessible summaries and data-table alternatives for critical results.
- Progress events use live regions without announcing every minor percentage change.
- User-facing copy contains no em dashes.
- Statistical claims distinguish association, predictive evidence, backtest performance, and post-issue accuracy.
- Tempolith does not label confidence High solely because two models agree.

## 13. Testing strategy

### 13.1 Backend unit tests

Required unit coverage:

- Project CRUD, revisions, archiving, and safe identifiers.
- Additive migration from a populated V1 database.
- Dataset and recipe fingerprints.
- Every preparation transform and inverse round-trip.
- Fold generation for short, regular, and multi-series data.
- Metric behavior with zeros, negative values, missing actuals, and constant series.
- Candidate eligibility and partial failure.
- Ensemble constraints, optimizer fallback, and 2 percent promotion guardrail.
- Factor-role validation and future-value completeness.
- Stage invalidation rules.
- Issued-forecast immutability.
- Actual matching and post-issue metrics.
- Atomic artifact writes and cleanup.

### 13.2 API integration tests

Required API flows:

- Create, update, list, archive, and reopen a project.
- Run Prepare, Validate, Forecast, Plan, Issue, and Review using fake deterministic model adapters.
- Stream progress and cancel a project job.
- Reject stale revision mutations.
- Preserve the last completed result after job failure.
- Load V1 data after migration.

### 13.3 Frontend unit tests

Required component and hook coverage:

- Project list and empty state.
- Studio stage readiness and invalidation messaging.
- Validation leaderboard and candidate failures.
- Manual champion override confirmation.
- Future factor grid validation.
- Issued forecast state.
- Backtest versus post-issue accuracy labeling.
- Query invalidation after jobs complete.

### 13.4 Browser end-to-end test

One deterministic Playwright flow is a release gate:

1. Start from an empty storage directory.
2. Load a built-in multi-series sample.
3. Create a Forecast Project.
4. Map date, target, and series columns.
5. Apply one preparation step.
6. Run validation using fake deterministic adapters.
7. Confirm the selected champion and evidence.
8. Generate the baseline forecast.
9. Enter a known-future factor plan.
10. Create and compare one scenario.
11. Issue the chosen forecast.
12. Import matching actuals.
13. Verify accuracy, bias, and coverage.
14. Reload the application and reproduce the project state without rerunning.

A separate integration marker runs a small real TimesFM forecast when model weights are available. It is not required for every frontend test execution.

### 13.5 Quality gates

V2.0 is complete only when:

- Backend unit and non-model integration tests pass.
- Frontend unit tests and TypeScript checks pass.
- The deterministic browser flow passes on Windows and CI Linux.
- Ruff and frontend lint pass.
- A production frontend build succeeds.
- Existing V1 routes pass regression smoke tests.
- No new network request occurs during the browser flow after model assets are available locally.

## 14. Acceptance criteria

### Project persistence

- A user can create, name, archive, reopen, and delete a project.
- Reopening restores the current revision, stage states, selected policy, scenarios, issued forecast, and accuracy records.
- Every completed run remains linked to the exact project revision and dataset fingerprint that produced it.

### Preparation

- The original dataset remains unchanged.
- Selected transformations are saved and reproducible.
- Invalid or non-invertible recipes cannot become forecast-ready.

### Validation and forecasting

- The headline champion comes from rolling validation, not a separate single holdout.
- The user can inspect fold, horizon, series, point-error, bias, and coverage evidence.
- Multi-series projects forecast every valid mapped series and expose failed exceptions.
- An ensemble is promoted only under the documented guardrails.

### Planning

- Required future factors cannot be silently fabricated.
- Every filled or scenario-controlled value is visible and stored.
- Scenario results display absolute and percentage deltas against the versioned baseline.

### Review

- The issued forecast is immutable.
- Imported actuals are matched to the issued values by series and period.
- Post-issue metrics cannot be confused with backtest metrics in labels or API fields.

### Local-first behavior

- No account, telemetry, hosted API, remote log, or narrative model is introduced.
- All new persistent data resides under the configured Tempolith storage directory.

## 15. Documentation changes required with implementation

Implementation must update in the same release:

- README product description, screenshots, page map, architecture, storage layout, and configuration.
- CHANGELOG with migration and compatibility notes.
- UBIQUITOUS_LANGUAGE with Forecast Project, Project Revision, Project Run, Issued Forecast, Actuals, model policy, and post-issue accuracy.
- Privacy page with the new SQLite records and project artifact directories.
- Glossary with MASE, WAPE, bias, issued forecast, reconciliation placeholder language, and actual-vs-forecast coverage.
- About page feature list and version.
- End-user help for each Studio stage.

## 16. Implementation order

The implementation plan must sequence work through vertical slices:

1. Persistence foundation and migration.
2. Project library and Overview.
3. Prepare stage with one complete reversible recipe path, then all V2.0 transforms.
4. Validation policy and leaderboard.
5. Forecast stage and run manifests.
6. Known-future factor plan and scenarios.
7. Issue workflow, actuals import, and Review metrics.
8. Navigation integration, V1 compatibility, accessibility, exports, and documentation.
9. Full regression, deterministic E2E, production build, and release readiness review.

Each slice must include backend tests, frontend tests, and the relevant portion of the browser flow before the next slice begins.

## 17. Future extension contracts

V2.0 prepares for later releases through interfaces, not placeholder UI:

- Project mapping can store ordered hierarchy columns, but V2.0 does not reconcile them.
- Model policy has a strategy identifier so a future reconciled policy can be added without changing issued-run identity.
- Actuals import exposes a service boundary that V2.2 schedules can call.
- Stage invalidation is centralized so automated refresh can reuse the same rules.
- Project jobs use a common event contract so scheduled and interactive runs share progress and failure semantics.

No V2.1 or V2.2 control is shown as enabled until its backend behavior is implemented and tested.
