# Codex Guide, Foreko

Foreko is a free, Apache-2.0-licensed time-series forecasting workbench that
runs locally. No hosted version, no paid tier. This repo is the source
of truth for the app, and all the forecasting code lives here.

For users who do not want to clone and run from source, a prebuilt
Windows installer (`.exe`) is published on GitHub Releases. It is a thin
packaging wrapper around this same local app, built from the separate
`foreko-desktop` repo (Tauri shell + PyInstaller backend bundle). The
installer adds no features, sends no data anywhere, and is not a paid or
hosted tier. Source and installer give you the identical local app.

## Mission

Forecasting first. Anything that does not enrich or enhance the
forecasting objective does not belong in this repo. That means:

- **Keep:** TimesFM + LightGBM forecasting, backtesting, diagnostics
  (residuals, ACF, STL, QQ), preflight data-quality checks, anomaly
  detection, factor / covariate analysis, what-if scenarios, segment
  comparison, schedules + exports + alerts that operate on forecasts.
- **Do not add:** chat-style local LLM features, executive briefing
  pages, AutoML for general regression/classification, recommender
  systems, text NLP on free-form columns, semantic-layer LLM enrichment,
  hardware-tier gating, paid features.

If you find yourself reaching for an LLM to generate a narrative or
answer a question about the data, stop. Foreko's only model is the
forecaster.

## Stack

- **Backend:** FastAPI + Uvicorn on port 8000. Entry:
  `app/backend/foreko/main.py`. Model code: `src/timesfm/`.
- **Frontend:** React 18, Vite, TanStack Query, Zustand, ECharts,
  Tailwind, Sonner. Dev port 5173 (proxies `/api` to `:8000`).
- **Tests:** pytest (markers: `unit`, `integration`), Vitest for the
  frontend.

## Dev commands

```bash
# First-time setup: detects NVIDIA GPU + driver and picks CUDA vs CPU torch.
./setup.ps1            # Windows
./setup.sh             # Linux/macOS

# Plain sync (CPU torch only):
uv sync --extra app --extra app-dev

# Sync with GPU torch (CUDA 12.8 wheel; needs NVIDIA driver >= 570):
uv sync --extra app --extra app-dev --extra cuda

uv run uvicorn foreko.main:app --port 8000 --reload --app-dir app/backend
cd app/frontend && npm ci && npm run dev
uv run pytest app/backend/tests -q -m "not integration"
```

## torch / CUDA selection

`pyproject.toml` declares a `cuda` extra bound to PyTorch's CUDA 12.8
wheel index via `[tool.uv.sources]`. The `app` extra alone always
installs the CPU build (PyPI default on Windows; PyPI bundled-CUDA on
Linux, which is still safe). Adding `--extra cuda` swaps in the
explicit CUDA wheel from `https://download.pytorch.org/whl/cu128`.
`setup.ps1` / `setup.sh` choose the right combination automatically
using `nvidia-smi`.

## Conventions

- All user data stays local. Never add telemetry or remote logging.
- No em dashes in user-facing copy (global preference).
- Backend CORS origins (`app/backend/foreko/settings.py`) must include
  `http://localhost:5173`.
- License is Apache 2.0. `NOTICE` documents upstream dependency licenses.
- No paywalls, tier gating, hardware-tier UI, or commercialization
  hooks. If a feature would only make sense in a paid product, it does
  not belong here.
