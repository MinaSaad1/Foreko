<div align="center">

<img src="app/frontend/public/foreko-logo.png" alt="Foreko" width="120" />

# Foreko

**Forecast your numbers. Stay on your machine.**

A free, MIT-licensed time-series forecasting workbench that runs locally.
TimesFM and LightGBM side by side, with backtesting, diagnostics, factor
analysis, anomaly detection, and what-if scenarios. All on your own data.

[![License: MIT](https://img.shields.io/badge/License-MIT-00B8C9.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-339933.svg)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![TimesFM](https://img.shields.io/badge/Model-TimesFM%202.5-FF6F00.svg)](https://github.com/google-research/timesfm)
[![CUDA](https://img.shields.io/badge/CUDA-12.8%20optional-76B900.svg)](https://developer.nvidia.com/cuda-zone)

</div>

---

## Why Foreko

- **Local-first.** Data never leaves your machine. No telemetry. No accounts.
- **Two models, one click.** Google's TimesFM foundation model and a LightGBM baseline run side by side, backtested on your data.
- **Honest uncertainty.** P10/P50/P90 bands, walk-forward backtests across multiple folds, prediction-interval calibration.
- **Plain English in, plain English out.** Upload a CSV with a date column and a number to predict. Foreko does the rest.
- **MIT licensed.** No upsell, no paid tier, no commercial gating. The whole app is in this repo.

---

## What's inside

| Page | What it does | Key signals |
|---|---|---|
| **Data** | Upload CSV / Excel / JSON, or connect to Postgres / MySQL / SQL Server. Picks samples to try without your data. | Row count, schema, dataset library |
| **Preflight** | Pre-forecast data-quality check. ADF stationarity, STL seasonality, outliers, missing data, recommended transforms. | Quality score, transform recommendations |
| **Forecast** | TimesFM (zero-shot foundation model) vs LightGBM (gradient-boosted baseline). Picks a winner by holdout MAPE. | Winner, alternative, confidence, P10/P50/P90 |
| **Backtest** | Walk-forward evaluation across N expanding-window folds. MAPE, RMSE, MASE, pinball loss, per-horizon decay, calibration. | Per-fold metrics, per-horizon curve, reliability plot |
| **Diagnostics** | Is the model honest? Residual histogram, Q-Q plot, ACF, STL, Ljung-Box. | White-noise residuals, leftover autocorrelation |
| **Anomalies** | Flag unusual points by severity. Critical (\|z\| >= 3) and Warning (\|z\| >= 2). | Anomaly chart, table, severity counts |
| **Explain** | Five-method anomaly vote, changepoint detection, lag analysis, Granger causality. | Method agreement, root-cause hints, leading factors |
| **Factors** | Quantify how price, weather, promos, holidays shift the forecast versus baseline. | Factor influence ranking, comparison chart |
| **Segments** | Forecast multiple series side by side. Rank by total, growth, or volatility. | Per-segment timelines, top-N ranking |
| **Scenarios** | What-if: pin factors flat, ramp them, or zero them out. Save and compare runs. | Scenario forecast, comparison overlay |
| **Operations** | Tag the timeline with annotations, revisit saved analyses without re-running, export a PDF briefing. | Annotations, saved analyses, PDF export |

---

## Quickstart

### 1. Install

```bash
git clone https://github.com/MinaSaad1/foreko-web.git
cd foreko-web

# Auto-detects NVIDIA GPU + driver and picks CUDA vs CPU torch
./setup.ps1            # Windows
./setup.sh             # Linux/macOS
```

Or run `uv` manually:

```bash
# CPU torch (works on any machine)
uv sync --extra app --extra app-dev

# GPU torch (CUDA 12.8 wheel; needs NVIDIA driver >= 570)
uv sync --extra app --extra app-dev --extra cuda

# Frontend deps
cd app/frontend && npm ci && cd ../..
```

### 2. Run

Two terminals:

```bash
# Backend  -> http://localhost:8000
uv run uvicorn foreko.main:app --port 8000 --reload --app-dir app/backend
```

```bash
# Frontend -> http://localhost:5173
cd app/frontend
npm run dev
```

### 3. Forecast

Open [http://localhost:5173](http://localhost:5173) and either upload a CSV
or try one of the bundled samples (daily sales, web traffic, hourly energy,
monthly revenue).

> The first forecast downloads TimesFM 2.5 weights (~1.2 GB) into
> `~/.foreko/models/`. Subsequent runs reuse the cached weights.

---

## Stack

| Layer | Tech |
|---|---|
| **Backend** | FastAPI + Uvicorn, Python 3.10+ |
| **Forecasting** | Google TimesFM 2.5 (transformer foundation model), LightGBM with lag + rolling features, classical baselines (ETS, seasonal naive) |
| **Probabilistic** | Per-step quantile regression (LightGBM `objective='quantile'`), block-bootstrap residuals for calibration |
| **Frontend** | React 18, Vite, TanStack Query, Zustand, Tailwind, Apache ECharts, Sonner |
| **Storage** | SQLite for annotations + cached analyses, local filesystem for datasets |
| **Connectors** | SQLAlchemy with Postgres, MySQL, SQL Server drivers; OS keyring for credentials |
| **Reports** | ReportLab for in-process PDF export |
| **Tests** | pytest (backend), Vitest + Testing Library (frontend) |

---

## Configuration

Every setting is overridable via `FOREKO_<FIELD>` environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `FOREKO_MODEL_ID` | `google/timesfm-2.5-200m-pytorch` | HuggingFace model id |
| `FOREKO_STORAGE_DIR` | `~/.foreko` | Where datasets, models, analyses live |
| `FOREKO_PRELOAD_MODEL` | `true` | Load weights at startup so the first forecast is instant |
| `FOREKO_MAX_UPLOAD_BYTES` | `52428800` (50 MB) | Hard cap on CSV upload size |
| `FOREKO_DATASET_TTL_HOURS` | `720` (30 days) | When the janitor sweeps old uploads |
| `FOREKO_CORS_ORIGINS` | `localhost:5173, 127.0.0.1:5173, localhost:8000` | Allowed dev origins |
| `FOREKO_MAX_SQL_ROWS` | `5000000` | Hard cap on rows from a SQL ingest |

Example:

```bash
FOREKO_STORAGE_DIR=/tmp/foreko FOREKO_PRELOAD_MODEL=false \
  uv run uvicorn foreko.main:app --port 8000 --app-dir app/backend
```

---

## Architecture

```
       Browser (Vite, :5173 in dev)
                  |
                  |  /api/*  (proxied in dev, served by FastAPI in prod)
                  v
   +-------------------------------+
   |  FastAPI (Uvicorn, :8000)     |
   |  +-------------------------+  |
   |  | Routers                 |  |   forecast, comparison, backtest,
   |  |                         |  |   diagnostics, anomaly, factors,
   |  |                         |  |   covariates, scenarios, segments,
   |  |                         |  |   preflight, datasets, connections,
   |  |                         |  |   annotations, export
   |  +-------------------------+  |
   |  | Services                |  |   forecaster (TimesFM),
   |  |                         |  |   lightgbm_baseline (quantile),
   |  |                         |  |   classical_baselines (ETS, naive),
   |  |                         |  |   diagnostics, anomaly_methods,
   |  |                         |  |   factor_diagnostics, ensembles,
   |  |                         |  |   transformations, calibration,
   |  |                         |  |   exports (PDF), store (SQLite)
   |  +-------------------------+  |
   |  | Job manager + SSE       |  |   long-running backtests stream
   |  +-------------------------+  |   progress to the UI
   +-------------------------------+
                  |
                  v
       ~/.foreko/
         datasets/        uploaded files + metadata
         models/          cached TimesFM weights (~1.2 GB)
         data/foreko.db   SQLite (annotations, analyses, scenarios)
         exports/         generated PDFs
         logs/            rotating logs
```

---

## Repo layout

```
src/timesfm/                  TimesFM 2.5 model code (Apache 2.0, vendored)
app/backend/foreko/
  routers/                    HTTP endpoints (one file per concern)
  services/                   forecaster, baselines, diagnostics, store, ...
  schemas/                    Pydantic request/response models
  jobs/                       async job manager + SSE
  main.py                     FastAPI app factory + lifespan
  settings.py                 env-driven config
app/backend/tests/            pytest suite (unit + integration markers)
app/frontend/
  src/pages/                  one file per UI page
  src/components/             chart components + shared primitives
  src/components/common/      Rails.tsx (3-rail layout), PageIntro, ...
  src/hooks/                  orchestrator hooks per page
  src/api/                    typed FastAPI client
  src/charts/theme.ts         centralised ECharts colours + tokens
.github/workflows/            CI
setup.ps1 / setup.sh          one-shot installers
```

---

## Development

```bash
# Backend tests (fast)
uv run pytest app/backend/tests -q -m "not integration"

# Backend tests including ones that load the real TimesFM model
uv run pytest app/backend/tests -q -m integration

# Frontend tests
cd app/frontend && npm test

# Frontend typecheck
cd app/frontend && npm run typecheck

# Production build (output in app/frontend/dist, served by the backend)
cd app/frontend && npm run build
```

---

## FAQ

**Does Foreko send my data anywhere?**
No. The backend runs on your machine, the SPA talks to it on `localhost`,
and the only outbound request is the one-time HuggingFace download of the
TimesFM weights. There is no telemetry, no analytics, no account.

**Can I use Foreko commercially?**
Yes. MIT license. Build whatever you want on top. Foreko itself will never
have a paid tier.

**Do I need a GPU?**
No. CPU mode works for most workloads. A modern NVIDIA GPU (CUDA 12.8 +
driver >= 570) makes TimesFM inference noticeably faster on long histories,
but every feature works without one.

**Why TimesFM AND LightGBM?**
TimesFM is a pretrained foundation model: strong zero-shot performance, no
training step. LightGBM trains in seconds on your data and often wins when
the series has explicit features (lags, calendar effects). Running both and
picking the winner on a holdout gives you an honest answer.

**Where are my files?**
Everything lives under `~/.foreko/` by default. Override with
`FOREKO_STORAGE_DIR`.

**How do I share a forecast?**
Use the **Export PDF** button on Forecast / Backtest / Anomalies / Operations.
The PDF is generated in-process by ReportLab and contains the charts,
metrics, and a written takeaway.

---

## License & attribution

Foreko is **MIT licensed**. See [`LICENSE`](LICENSE).

Builds on:

- **TimesFM 2.5** (Google, Apache 2.0). See [`NOTICE`](NOTICE) for the
  full dependency attribution.
- PyTorch, Transformers, FastAPI, LightGBM, statsmodels, scikit-learn,
  React, Vite, Tailwind, ECharts, and the rest of the open-source ecosystem
  Foreko stands on. Full list in [`NOTICE`](NOTICE).

---

<div align="center">

Built by [Mina Saad](https://github.com/MinaSaad1). No telemetry. No upsell.

</div>
