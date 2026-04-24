# Foresee — Web App

Foresee is a local forecasting studio. Drop in a CSV, pick (or let Foresee pick) a model, and get a calibrated forecast with uncertainty ranges, a recommended configuration, and plain-English explanations. All processing stays on your machine.

This repo is the **web app** version — run it on your own machine via the FastAPI backend and Vite dev server. For the Windows desktop MSI, see [`MinaSaad1/foresee-desktop`](https://github.com/MinaSaad1/foresee-desktop). For the marketing site, see [`MinaSaad1/foresee-landing`](https://github.com/MinaSaad1/foresee-landing).

## Requirements

- Python 3.10+
- Node 20+
- [uv](https://docs.astral.sh/uv/) (recommended) or plain `pip`

## First-time setup

```bash
# Python deps
uv sync --extra app --extra app-dev

# Frontend deps
cd app/frontend
npm ci
cd ../..
```

## Run in dev

Two terminals:

```bash
# Terminal 1 — backend (http://localhost:8000)
uv run uvicorn timesfm_studio.main:app --port 8000 --reload --app-dir app/backend
```

```bash
# Terminal 2 — frontend (http://localhost:5173)
cd app/frontend
npm run dev
```

Open http://localhost:5173 and upload a CSV.

The first forecast downloads TimesFM 2.5 weights (~1.2 GB) into `~/.timesfm_studio/models/`. Subsequent runs reuse the cached weights.

Override any default via `TIMESFM_STUDIO_<FIELD>` environment variables (for example `TIMESFM_STUDIO_PRELOAD_MODEL=false` to skip model preload at startup, or `TIMESFM_STUDIO_STORAGE_DIR=/tmp/foresee` to move the storage root).

## Tests

```bash
uv run pytest app/backend/tests -q
```

The `integration` marker runs the tests that load the real model — skip with `-m "not integration"` for a fast unit pass.

## Build frontend for production

```bash
cd app/frontend
npm run build
# Output in app/frontend/dist/ — served by the backend at http://localhost:8000
```

## Docker

```bash
docker compose -f app/docker-compose.yml up --build
# http://localhost:8000
```

## License & attribution

Foresee builds on Google's [TimesFM](https://github.com/google-research/timesfm) (Apache 2.0). See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for full attribution.

## Repo layout

```
src/timesfm/             # TimesFM 2.5 model code (Apache 2.0)
app/backend/             # FastAPI server (timesfm_studio)
  timesfm_studio/        #   routers, services, jobs, settings
  tests/                 #   pytest suite
app/frontend/            # React 18 + Vite + Tailwind SPA
tests/                   # Core model tests
.github/workflows/       # CI — Python tests, PyPI publish
```
