<div align="center">

<img src="docs/header.png" alt="Foreko, local-first time-series forecasting workbench" width="100%"/>

<br/>

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-00B8C9.svg?style=flat-square)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react&logoColor=000)](https://react.dev/)
[![TimesFM](https://img.shields.io/badge/Model-TimesFM%202.5-FF6F00.svg?style=flat-square)](https://github.com/google-research/timesfm)
[![CUDA optional](https://img.shields.io/badge/CUDA-12.8%20optional-76B900.svg?style=flat-square&logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-zone)

<br/>

<a href="https://github.com/MinaSaad1/Foreko/releases/latest"><img src="https://img.shields.io/badge/Download_for_Windows-00B8C9?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows"/></a>
&nbsp;&nbsp;
<a href="#install"><img src="https://img.shields.io/badge/Run_from_source-0E1A26?style=for-the-badge&logo=gnubash&logoColor=00D4E8" alt="Run from source"/></a>

<br/>
<br/>

<a href="#install"><b>Install</b></a> &nbsp;·&nbsp; <a href="#the-pages"><b>Screenshots</b></a> &nbsp;·&nbsp; <a href="#the-models"><b>Models</b></a> &nbsp;·&nbsp; <a href="#architecture"><b>Architecture</b></a> &nbsp;·&nbsp; <a href="#faq"><b>FAQ</b></a>

<br/>

A free, local-first forecasting workbench. Point it at a CSV and get a trustworthy
forecast with uncertainty bands, a recommended model, and plain-English diagnostics.

<br/>
<br/>

<b>Built by Mina Saad</b>

<a href="https://www.linkedin.com/in/minasaad1/"><img src="https://img.shields.io/badge/LinkedIn-Mina_Saad-0A66C2?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMC40NDcgMjAuNDUyaC0zLjU1NHYtNS41NjljMC0xLjMyOC0uMDI3LTMuMDM3LTEuODUyLTMuMDM3LTEuODUzIDAtMi4xMzYgMS40NDUtMi4xMzYgMi45Mzl2NS42NjdIOS4zNTFWOWgzLjQxNHYxLjU2MWguMDQ2Yy40NzctLjkgMS42MzctMS44NSAzLjM3LTEuODUgMy42MDEgMCA0LjI2NyAyLjM3IDQuMjY3IDUuNDU1djYuMjg2ek01LjMzNyA3LjQzM2MtMS4xNDQgMC0yLjA2My0uOTI2LTIuMDYzLTIuMDY1IDAtMS4xMzguOTItMi4wNjMgMi4wNjMtMi4wNjMgMS4xNCAwIDIuMDY0LjkyNSAyLjA2NCAyLjA2MyAwIDEuMTM5LS45MjUgMi4wNjUtMi4wNjQgMi4wNjV6bTEuNzgyIDEzLjAxOUgzLjU1NVY5aDMuNTY0djExLjQ1MnpNMjIuMjI1IDBIMS43NzFDLjc5MiAwIDAgLjc3NCAwIDEuNzI5djIwLjU0MkMwIDIzLjIyNy43OTIgMjQgMS43NzEgMjRoMjAuNDUxQzIzLjIgMjQgMjQgMjMuMjI3IDI0IDIyLjI3MVYxLjcyOUMyNCAuNzc0IDIzLjIgMCAyMi4yMjUgMHoiLz48L3N2Zz4K&logoColor=white" alt="Mina Saad on LinkedIn"/></a>
&nbsp;&nbsp;
<a href="https://www.mina-saad.com/"><img src="https://img.shields.io/badge/Website-mina--saad.com-0E1A26?style=for-the-badge&logo=googlechrome&logoColor=00D4E8" alt="Mina Saad website"/></a>

</div>

<br/>

<p align="center">
  <img src="docs/screenshots/04b-forecast-result.png" alt="Foreko forecast result: TimesFM vs LightGBM with P10/P90 bands, accuracy stats, and next-step rail" width="100%"/>
</p>

<br/>

<table>
<tr>
<td width="50%" valign="top">

<img src="docs/img/feat-local.png" width="58" alt=""/>

### Local-first

Your data never leaves your machine. No accounts, no telemetry, no cloud.
The only outbound request is the one-time TimesFM weights download.

</td>
<td width="50%" valign="top">

<img src="docs/img/feat-models.png" width="58" alt=""/>

### Two models, one click

Google's TimesFM foundation model and a LightGBM baseline run side by
side, backtested on your data. Foreko shows the winner and the runner-up.

</td>
</tr>
<tr>
<td width="50%" valign="top">

<img src="docs/img/feat-uncertainty.png" width="58" alt=""/>

### Honest uncertainty

P10 / P50 / P90 bands, walk-forward backtests across multiple folds,
prediction-interval calibration. Every confidence claim is measurable.

</td>
<td width="50%" valign="top">

<img src="docs/img/feat-free.png" width="58" alt=""/>

### Apache 2.0, forever free

No paid tier, no upsell, no commercial gating. The whole app is in this
repo, under a permissive Apache 2.0 license.

</td>
</tr>
</table>

<br/>

---

## Install

Two ways to run Foreko. Both stay entirely on your machine.

### Windows installer (easiest)

Download the latest **`.exe`** installer from the
[**Releases page**](https://github.com/MinaSaad1/Foreko/releases/latest),
run it, then launch Foreko from the Start menu. No Python, no Node, no
command line. The installer bundles the backend and opens the app in
your browser.

### Run from source (any OS)

```bash
# 1. Clone
git clone https://github.com/MinaSaad1/Foreko.git && cd Foreko

# 2. Install (auto-detects NVIDIA GPU + CUDA driver)
./setup.ps1            # Windows
./setup.sh             # Linux / macOS

# 3. Run, two terminals
uv run uvicorn foreko.main:app --port 8000 --reload --app-dir app/backend
cd app/frontend && npm run dev
```

Then open **<http://localhost:5173>** and either upload a CSV or click
**Try demo dataset**.

> Whichever path you pick, the first forecast downloads TimesFM 2.5
> weights (~1.2 GB) into `~/.foreko/models/`. Cached after that.

---

## The pages

<table>
<tr>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/data.png" alt="Data" width="100%"/>

**Data**
<br/>
<sub>CSV, Excel, JSON, or a live DB. Browse your library, pick a sample.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/preflight.png" alt="Preflight" width="100%"/>

**Preflight**
<br/>
<sub>Pre-forecast health check. ADF, STL, outliers, missing data, transforms.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/forecast.png" alt="Forecast" width="100%"/>

**Forecast**
<br/>
<sub>TimesFM vs LightGBM side by side. Winner picked by holdout MAPE.</sub>

</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/backtest.png" alt="Backtest" width="100%"/>

**Backtest**
<br/>
<sub>Walk-forward across N folds. MAPE, RMSE, MASE, pinball, calibration.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/diagnostics.png" alt="Diagnostics" width="100%"/>

**Diagnostics**
<br/>
<sub>Residual histogram, Q-Q, ACF, STL, Ljung-Box. White noise or not.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/anomalies.png" alt="Anomalies" width="100%"/>

**Anomalies**
<br/>
<sub>z-score severity, monthly heatmap, drillable table of flagged points.</sub>

</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/explain.png" alt="Explain" width="100%"/>

**Explain**
<br/>
<sub>5-method anomaly vote, changepoints, lag analysis, Granger causality.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/factors.png" alt="Factors" width="100%"/>

**Factors**
<br/>
<sub>Price, promos, weather, holidays. Influence ranked, comparison charted.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/segments.png" alt="Segments" width="100%"/>

**Segments**
<br/>
<sub>Multi-series side by side, ranked by total, growth, or volatility.</sub>

</td>
</tr>
<tr>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/scenarios.png" alt="Scenarios" width="100%"/>

**Scenarios**
<br/>
<sub>Pin factors flat, ramp them, zero them. Save and compare runs.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/operations.png" alt="Operations" width="100%"/>

**Operations**
<br/>
<sub>Tag launches and incidents, revisit cached runs, export a PDF briefing.</sub>

</td>
<td width="33%" align="center" valign="top">

<img src="docs/img/pages/glossary.png" alt="Glossary" width="100%"/>

**Glossary**
<br/>
<sub>Every stats term in plain English. Hover any Term tag to peek inline.</sub>

</td>
</tr>
</table>

---

## Architecture

<img src="docs/img/architecture.png" width="100%" alt="Foreko architecture: Browser to FastAPI to forecasting and analysis services to local storage"/>

The React SPA talks to a local FastAPI server, which fans each request out to the
forecasting and analysis services. Everything is persisted under `~/.foreko/`.

| Layer | Pieces |
|---|---|
| Browser `:5173` | React single-page app |
| FastAPI `:8000` | HTTP API + async job manager (SSE progress) |
| Services | forecaster (TimesFM) · baselines (LightGBM, ETS, seasonal-naive) · diagnostics (residuals, ACF, STL) · anomaly methods · factor diagnostics · exports (ReportLab PDF) |
| `~/.foreko/` | `datasets/` · `models/` (TimesFM weights) · `foreko.db` (SQLite) · `exports/` |

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · Uvicorn · Python 3.10+ |
| Forecasting | TimesFM 2.5 (transformer) · LightGBM (with quantile regression) · ETS · seasonal-naive |
| Probabilistic | LightGBM `objective='quantile'` for P10/P90 · block-bootstrap residuals · prediction-interval calibration |
| Frontend | React 18 · Vite · TanStack Query · Zustand · Tailwind · Apache ECharts · Sonner |
| Storage | SQLite (annotations, saved analyses) · local filesystem (datasets, model cache, exports) |
| Connectors | SQLAlchemy · Postgres · MySQL · SQL Server · OS keyring for secrets |
| Reports | ReportLab in-process PDF |
| Tests | pytest (backend, ~160 tests) · Vitest + Testing Library (frontend) |

---

## Configuration

Every setting is overridable via `FOREKO_<FIELD>` environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `FOREKO_MODEL_ID` | `google/timesfm-2.5-200m-pytorch` | HuggingFace model id |
| `FOREKO_STORAGE_DIR` | `~/.foreko` | Datasets, model cache, analyses, exports |
| `FOREKO_PRELOAD_MODEL` | `true` | Load weights at startup so the first forecast is instant |
| `FOREKO_MAX_UPLOAD_BYTES` | `52428800` | Hard cap on CSV upload size (50 MB) |
| `FOREKO_DATASET_TTL_HOURS` | `720` | When the janitor sweeps old uploads (30 days) |
| `FOREKO_CORS_ORIGINS` | dev origins | Allowed origins, comma-separated |
| `FOREKO_MAX_SQL_ROWS` | `5000000` | Hard cap on rows from a SQL ingest |

```bash
FOREKO_STORAGE_DIR=/tmp/foreko FOREKO_PRELOAD_MODEL=false \
  uv run uvicorn foreko.main:app --port 8000 --app-dir app/backend
```

---

## Repo layout

```
src/timesfm/                  TimesFM 2.5 model code (Apache 2.0, vendored)
app/backend/foreko/
  routers/                    HTTP endpoints, one file per concern
  services/                   forecaster, baselines, diagnostics, store, ...
  schemas/                    Pydantic request / response models
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
docs/
  screenshots/                README screenshots, captured via Playwright
  img/                        README illustrations + diagrams
scripts/
  capture_screenshots.mjs     re-run to refresh the gallery
setup.ps1 / setup.sh          one-shot installers
.github/workflows/            CI
```

---

## Development

```bash
# Backend
uv run pytest app/backend/tests -q -m "not integration"   # fast unit pass
uv run pytest app/backend/tests -q -m integration         # runs with real model

# Frontend
cd app/frontend && npm test
cd app/frontend && npm run typecheck

# Production frontend (served by the backend at :8000)
cd app/frontend && npm run build

# Refresh README screenshots (with the dev servers running)
node scripts/capture_screenshots.mjs
```

---

## FAQ

<img src="docs/img/banner-faq.png" width="100%" alt=""/>

<details>
<summary><b>Does Foreko send my data anywhere?</b></summary>
<br/>

No. The backend runs on your machine, the SPA talks to it on `localhost`,
and the only outbound request is the one-time TimesFM weights download
from the HuggingFace Hub. There is no telemetry, no analytics, no account.

</details>

<details>
<summary><b>Is the Windows installer different from the source app?</b></summary>
<br/>

No. The `.exe` installer is the same app wrapped for one-click install
(a Tauri shell plus the bundled backend, built from the `foreko-desktop`
repo). It runs locally, sends no data anywhere, and has no extra or paid
features. Use whichever path you prefer.

</details>

<details>
<summary><b>Can I use Foreko commercially?</b></summary>
<br/>

Yes. Apache 2.0 license. Build whatever you want on top. Foreko itself
will never have a paid tier.

</details>

<details>
<summary><b>Do I need a GPU?</b></summary>
<br/>

No. CPU mode works for every feature. A modern NVIDIA GPU (CUDA 12.8 +
driver `>= 570`) makes TimesFM inference noticeably faster on long
histories, but it is optional.

</details>

<details>
<summary><b>Why TimesFM AND LightGBM?</b></summary>
<br/>

TimesFM is a pretrained foundation model with strong zero-shot
performance, no training step. LightGBM trains in seconds on your data
and often wins when the series has explicit features like lags or
calendar effects. Running both and picking the winner on a holdout gives
you an honest answer.

</details>

<details>
<summary><b>Where do my files live?</b></summary>
<br/>

Under `~/.foreko/` by default. Override with `FOREKO_STORAGE_DIR`.

</details>

<details>
<summary><b>How do I share a forecast?</b></summary>
<br/>

Use the **Export PDF** button on Forecast, Backtest, Anomalies, or
Operations. The PDF is generated in-process by ReportLab and contains
the charts, metrics, and a written takeaway.

</details>

<details>
<summary><b>How do I add a new model?</b></summary>
<br/>

Drop a class with a `fit_and_forecast(...)` method into
`app/backend/foreko/services/`, register it in `comparison.py`, and add
a frontend toggle in `pages/BacktestPage.tsx`. Both backtest and the
forecast comparison will pick it up.

</details>

---

## License & attribution

<p align="left">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-00B8C9.svg?style=for-the-badge"/></a>
</p>

Builds on:

- **TimesFM 2.5** (Google, Apache 2.0). See [`NOTICE`](NOTICE).
- PyTorch · Transformers · FastAPI · LightGBM · statsmodels · scikit-learn · React · Vite · Tailwind · ECharts.
- Full dependency attribution in [`NOTICE`](NOTICE).

---

<div align="center">

Built by [Mina Saad](https://github.com/MinaSaad1). No telemetry. No upsell.

<sub>Star the repo if you find it useful.</sub>

</div>
