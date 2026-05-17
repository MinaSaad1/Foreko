# Foreko

Local web app that wraps the [TimesFM 2.5](../src/timesfm) forecasting model with
a friendly browser UI. Phase A ships zero-shot forecasting with quantile bands.

## Requirements

- Python 3.10+
- Node 18+
- (Optional) NVIDIA GPU with CUDA-capable PyTorch for faster inference

## One-time setup

```bash
# From the repo root:
pip install -e ".[app,app-dev]"

cd app/frontend
npm install
```

The first time the backend runs it downloads the TimesFM 2.5 200M checkpoint
(~1.2 GB) to `~/.cache/huggingface/hub/`.

## Run it

In two terminals (both from the repo root):

```bash
# Terminal 1 — backend
uvicorn foreko.main:app --port 8000 --reload

# Terminal 2 — frontend
cd app/frontend
npm run dev
```

Open http://localhost:5173. The device badge in the top right shows whether
the app is running on CPU or GPU and the current model status.

## Try it with the repo's sample data

1. Drop [`data.csv`](../data.csv) on the home page.
2. Pick **Year + Month columns**. The mapper should auto-select `Year` and `Month`.
3. Value column: `QTY`.
4. Horizon: `12`.
5. Click **Forecast**.

You should see history through December 2022 and a forecast line into 2023
with a shaded P10 - P90 band — the same shape as
[`forecast_2023.png`](../forecast_2023.png).

## Backend tests

```bash
pytest app/backend/tests/unit -v
```

Unit tests use a fake model (no download). Integration tests that load the
real model will be added in later phases.

## Configuration

All settings can be overridden via environment variables with the prefix
`FOREKO_`:

| Variable | Default | Description |
|---|---|---|
| `FOREKO_MODEL_ID` | `google/timesfm-2.5-200m-pytorch` | HF checkpoint to load |
| `FOREKO_STORAGE_DIR` | `~/.foreko` | Runtime data root |
| `FOREKO_DATASET_TTL_HOURS` | `24` | How long uploads live |
| `FOREKO_MAX_UPLOAD_BYTES` | `52428800` | CSV size cap |
| `FOREKO_PRELOAD_MODEL` | `true` | Load model at startup |

## Roadmap

- **Phase A (shipping now)** — zero-shot forecast + quantile bands
- **Phase B** — XReg covariates
- **Phase C** — two-phase anomaly detection
- **Phase D** — LoRA fine-tuning with live SSE progress

See [../../../.claude/plans/thinking-in-turning-this-merry-planet.md](../../../.claude/plans/thinking-in-turning-this-merry-planet.md)
for the full plan.
