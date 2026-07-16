# Changelog

All notable changes to Foreko are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to semantic versioning.

## [Unreleased]

### Added

- **Forecast Projects.** A project is now the unit of work: it holds the data recipe, the model evidence, the assumptions, the forecast you issued, and its accuracy. Reopening one restores all of it without rerunning anything. Five stages (Prepare, Validate, Forecast, Plan, Review) each report whether they are ready, need attention, or are blocked and why.
- Reversible preparation recipes. Aggregate duplicates, insert missing periods, impute, winsorize, log, Box-Cox, differencing, seasonal differencing. The source dataset is never modified, and a recipe that cannot return forecasts to the original scale within tolerance is refused rather than warned about.
- Rolling validation as the selection engine. Every candidate is scored across folds for every series, and selection runs independently per series, so a model that loses on one series can still win on another. The portfolio score weights each series equally, so one high-volume series cannot decide the headline number.
- MASE as the default selection metric, with WAPE, sMAPE, RMSE, signed bias, pinball loss, and P10-P90 coverage as supporting evidence. MAPE is informational only.
- Ensembles, promoted only when they beat the best individual model by at least 2 percent without worsening bias by more than 0.5 points or moving coverage more than 5 points from 0.80.
- Known-future factor plans. A factor the selected model reads must have a value for every future period, or an explicit fill policy; every filled value is recorded with the run. Foreko never invents one.
- Issued forecasts, immutable by construction, and post-issue accuracy scored against them rather than against a later rerun. Backtest evidence and post-issue accuracy are kept impossible to confuse.
- Forecast export packages: a zip with the manifest, machine-readable forecast, assumptions, validation summary, and accuracy, carrying no credentials.
- Run history with per-run manifests recording dataset fingerprint, recipe, policy, and assumptions.
- Versioned SQLite migrations. An existing database is adopted and migrated additively; V1 data opens untouched.
- An end-to-end browser journey covering the whole cycle, now running in CI on Windows and Linux.

### Changed

- Navigation is project-first. Projects and Data Sources are top-level; the specialist analyses moved into Advanced analysis, still fully available.
- **The home page shows your projects.** It previously opened on a marketing hero for a product you have already installed, with no mention of projects and no route to them. Projects now sit directly under the hero, with the copy corrected: the hero and the "How it works" steps described the V1 lens collection and the Model Comparison page rather than the actual workflow.
- **The three-rail page layout is gone.** Eleven pages put configuration in a left column, content in the middle, and interpretation in a right column, all at the same volume, so no column was primary. The left column was hidden below 1024px, which meant the horizon, folds, model choice, sort order, and the additive/multiplicative policy did not exist on a narrow window while the page header still reported their values back to you. Every page is now one column ordered by rank, with each control sitting on the thing it changes. One page had shipped a label reading "change in the left rail"; it is deleted along with the rail. The visual identity is unchanged.
- Explain no longer offers five equally weighted buttons with an unstated dependency between them. They are grouped by what they read, and a blocked analysis says why in plain words instead of only greying out.
- Scenarios showed five controls for every factor whether or not it was in play. An untouched factor is now one checkbox, and ticking it reveals the rest.
- Datasets no longer says "Fetching binary log format..." while loading a CSV preview, and a failed preview no longer reports `ERR_NO_TARGET_BUFFER_FOUND`, which was not a real code and named no cause or next step. It now names the file, gives the real error, and says the file is still stored. Deleting a dataset confirms inline rather than through a native browser dialog, matching the rest of the app.
- The page at `/compare` is now labelled **Model Comparison**, not Forecast. It selects a winner from one holdout using MAPE, while a Forecast Project uses rolling validation with MASE, and the two can disagree. Two destinations named Forecast would have given conflicting champions with no way to tell which to trust. The route and its behaviour are unchanged.
- Frontend lint now runs. `npm run lint` was declared but eslint was never installed and no config existed, so the script had never run once.

### Fixed

- **The whole Forecast Projects surface had no semantic colour.** V2 used `danger` and `warn` in 36 places across 18 files, and neither token was ever defined, so Tailwind emitted nothing for them. Every error message rendered as ordinary body text, Confirm delete had no danger styling, and a stage needing attention looked identical to one not started. Renamed to the tokens the rest of the app already uses correctly.
- **The data quality score was scaled twice and always read green.** The backend returns 0 to 100; the rail multiplied by 100 again and banded against 0.8, so it displayed "8700 / 100" and called every real score healthy, including a catastrophic one, while the card beside it read the same number correctly. Both now share one reader.
- **Explain and Scenarios never reported a failed run.** Eight mutations between them had no error branch, so a failure left the previous chart on screen and read as success.
- Deleting a saved scenario also toggled it into the comparison, because the delete button sat inside the label wrapping the selection checkbox. Delete now confirms first, and destroys nothing on a stray click.
- Annotation and analysis deletes on Operations were fire-and-forget, so a failure removed nothing and said nothing. The PDF export was equally silent on failure.
- Em dashes in user-facing backend copy, which the frontend-only convention never covered.
- The column dropdown on every page carried a blur behind an opaque surface, a radius class contradicting the zero-radius identity, and a coloured side stripe on the selected option. It is also a proper listbox to assistive tech now.
- **ETS never worked.** It called `.fit(disp=False)`, which statsmodels' `ExponentialSmoothing` does not accept, so it raised on every call and silently returned seasonal naive's forecast under the ETS name. Every "ETS" number Foreko has shown was seasonal naive.
- **Backtest laundered model failures.** A candidate that raised had its forecast replaced with a flat last-value series, which was then scored like a real result, so a broken model looked merely mediocre. Failures are now recorded, and a model that failed any fold cannot be champion.
- **Fonts were fetched from Google on every page load**, sending your IP and user-agent to a third party, which contradicted this project's claim that the only outbound request is the model download. Fonts are now bundled.
- **Deleting a project left its data on disk.** The database rows cascaded but the derived data, run artifacts, and exports remained, so user data survived an explicit delete.
- `diff` and `seasonal_diff` were reported as not invertible by `POST /api/transforms/roundtrip`. Both invert exactly; the check anchored the inverse on the wrong rows.
- `get_store` ignored its `db_path` after the first call, so a caller pointing at a different database silently received the first one.
- The Backtest PDF export named a "Winner model" even when no candidate completed every fold, stating a champion the evidence did not support.
- `ensure_dirs()` and the storage-wipe list were maintained separately, so a new storage directory could be created but survive an explicit wipe.

## [1.0.0] - 2026-06-17

### Added
- Dataset TTL janitor: a startup-plus-hourly sweep deletes uploads older than `FOREKO_DATASET_TTL_HOURS` (default 720, 30 days). Set the value to `0` to keep datasets forever. Previously the setting was advertised but nothing swept, so `~/.foreko/datasets/` grew without bound.
- Build sha on the About page (`VITE_GIT_SHA`, resolved at build time) so a running build can be pinned to a commit.
- Landing-page quickstart animation: self-contained SVG + CSS loop showing the CSV to forecast flow, with a reduced-motion fallback to the final frame.
- CSV dialect robustness: delimiter sniffing on upload (comma / semicolon / tab / pipe) with a European decimal-comma fallback. Detected dialect is persisted to `meta.json` so reload and series extraction use the same parser.
- Inline "Retry upload" button on `CSVUpload` when the failure is network-level (status 0 / 502 / 503 / 504). Validation errors stay one-shot.
- Operations page empty-state copy for annotations, schedules, and alert rules (previously rendered blank lists).
- Offline-mode escape hatch on the model-load error splash and Privacy page: tells the user where to manually drop the HuggingFace snapshot when the Hub is unreachable.
- Backend now surfaces a path-based hint in the error message on `ConnectionError` / `TimeoutError` from HuggingFace, pointing at the expected cache directory.
- Guided 5-step tour that auto-opens on first visit to any non-landing page, replayable from the Privacy page.
- Stalled-download recovery: the loading splash detects when the download hasn't progressed for 45 seconds and surfaces a "Resume download" button. Also adds a "Try again" button on error. Backed by new endpoint `POST /api/model/retry`.
- Global first-run splash that blocks the app until the TimesFM model is loaded, with real bytes/speed/ETA progress and the local cache path.
- Samples picker with four built-in CSVs (retail sales, website traffic, energy consumption, monthly revenue) on the Upload and Datasets pages.
- "Next steps" callout on the Forecast page linking to Backtest, Anomalies, and Explain.
- Shared `EmptyDatasetState` component so every analysis page offers upload + samples when no dataset is loaded.
- `useSyncedDataset` hook: deep-linking `/scenarios/:id` (or any analysis URL) now hydrates the Zustand store so the dataset carries across pages.
- Backend endpoint `DELETE /api/system/storage` to wipe uploaded datasets, job state, cached results, logs, and exports.
- Backend endpoint `GET /api/system/log-bundle` that returns a zip of recent logs for troubleshooting.
- Version and build info footer on every non-landing page.
- 422 error humanization: unparseable dates, non-numeric values, duplicate timestamps, constant series, too-few rows, and missing numeric column each get a one-sentence explanation instead of a pandas traceback.
- Backend CSV upload validation: rejects files with fewer than two columns, fewer than ten rows, no numeric column, duplicate timestamps, or constant value columns. Orphan dataset directories are now cleaned up on failure.

### Changed
- Minimum-series-length guard: a series shorter than `2 x horizon` is now rejected with a clear message instead of being silently left-padded with zeros and returning a fabricated forecast. Applies to the forecast, comparison, and covariate paths.
- About page license corrected from MIT to Apache 2.0 to match `LICENSE` and `NOTICE`.
- `LoadingSplash` no longer re-blocks the app after the model has once been ready in the session. Mid-session reloads (via `/model/retry`) surface through the header `ModelStatusBar` instead of a full-screen takeover. Cold-start and error states still block.
- Default dataset retention raised from 24 hours to 30 days (`FOREKO_DATASET_TTL_HOURS`, default 720). Surfaced on the Datasets and Privacy pages.
- Privacy page rewritten with a complete inventory of what Foreko writes to `~/.foreko/`.
- Forecast actions on Forecast, Backtest, Anomaly, Scenarios, Covariates, Diagnostics, and Segments pages are disabled while the model is still loading, with inline copy explaining why.
- Removed em dashes from all user-facing copy.
- README and Privacy page corrected to point at `~/.foreko/models/` (not `~/.cache/huggingface/hub/`).

### Fixed
- CI ran on a `master` branch that does not exist, so it never executed. Repointed to `main` and expanded from a build-only job to a real matrix: ruff lint plus backend unit tests on Python 3.10/3.12 across Ubuntu and Windows, and frontend typecheck, Vitest, and production build on Node 20.
- Model registry is now marked failed when the snapshot download fails before load, so forecast requests fail fast with the offline instructions instead of waiting on a model that will never load.
- `LoadingSplash` is now rendered globally from `App.tsx`; previously it was imported nowhere, so first-run users saw no feedback while the 1.2 GB model downloaded.
- `POST /api/model/ensure` called `model_download.ensure_model()` with only the model id; the signature requires `(model_id, local_dir)`. Endpoint is now routed through a shared helper that reads both from the registry.

### Security
- Dataset and adapter ids from the URL are validated as single path segments before being joined onto the storage directory, closing a Windows directory-escape where a crafted id (`..%5C..%5C...`) could read or delete files outside `~/.foreko/`.
- Upload size is enforced before the body is buffered: the `Content-Length` header is checked up front and the body is read in capped chunks, so a client can no longer force the server to hold an oversized payload in memory.
- Per-request inference timeout (`FOREKO_INFERENCE_TIMEOUT_S`, default 600 seconds) so a pathological series cannot hang a request indefinitely; the request returns HTTP 504 with an actionable message.
- Bumped Vite 5 to 6.3 and Vitest 2 to 3.2 (plus `@vitejs/plugin-react` 4.3.4 and `jsdom` 26). Closes all 5 of the previously-flagged moderate advisories (esbuild dev-server request spoofing + Vite `.map` path traversal). `npm audit` is clean.
