# Changelog

All notable changes to Foresee are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to semantic versioning.

## [Unreleased]

### Added
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
- `LoadingSplash` no longer re-blocks the app after the model has once been ready in the session. Mid-session reloads (via `/model/retry`) surface through the header `ModelStatusBar` instead of a full-screen takeover. Cold-start and error states still block.
- Default dataset retention raised from 24 hours to 30 days (`TIMESFM_STUDIO_DATASET_TTL_HOURS`, default 720). Surfaced on the Datasets and Privacy pages.
- Privacy page rewritten with a complete inventory of what Foresee writes to `~/.timesfm_studio/`.
- Forecast actions on Forecast, Backtest, Anomaly, Scenarios, Covariates, Diagnostics, and Segments pages are disabled while the model is still loading, with inline copy explaining why.
- Removed em dashes from all user-facing copy.
- README and Privacy page corrected to point at `~/.timesfm_studio/models/` (not `~/.cache/huggingface/hub/`).

### Fixed
- `LoadingSplash` is now rendered globally from `App.tsx`; previously it was imported nowhere, so first-run users saw no feedback while the 1.2 GB model downloaded.
- `POST /api/model/ensure` called `model_download.ensure_model()` with only the model id; the signature requires `(model_id, local_dir)`. Endpoint is now routed through a shared helper that reads both from the registry.

### Security
- Bumped Vite 5 to 6.3 and Vitest 2 to 3.2 (plus `@vitejs/plugin-react` 4.3.4 and `jsdom` 26). Closes all 5 of the previously-flagged moderate advisories (esbuild dev-server request spoofing + Vite `.map` path traversal). `npm audit` is clean.
