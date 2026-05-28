#!/usr/bin/env bash
# Foreko setup script for Linux / macOS.
# Installs all Python dependencies and automatically selects the GPU-accelerated
# PyTorch build when an NVIDIA GPU with a modern driver is detected, falling
# back to CPU otherwise.

set -euo pipefail

SKIP_FRONTEND=0
for arg in "$@"; do
  [[ "$arg" == "--skip-frontend" ]] && SKIP_FRONTEND=1
done

step() { echo -e "\n==> $1"; }
ok()   { echo "    OK  $1"; }
warn() { echo "    WARN $1"; }

# ---------------------------------------------------------------------------
# 1. Detect NVIDIA GPU + driver up front. The driver version decides whether
#    we install the CUDA torch wheel via the `cuda` extra (modern driver) or
#    stay on the CPU wheel.
# ---------------------------------------------------------------------------
step "Detecting compute device"

USE_CUDA=0
GPU_NAME=""
DRIVER_MAJOR=0

if command -v nvidia-smi &>/dev/null; then
  SMI_OUT=$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null || true)
  if [[ -n "$SMI_OUT" ]]; then
    GPU_NAME=$(echo "$SMI_OUT" | cut -d',' -f1 | xargs)
    DRIVER_MAJOR=$(echo "$SMI_OUT" | cut -d',' -f2 | xargs | cut -d'.' -f1)
    ok "Found $GPU_NAME (driver $DRIVER_MAJOR)"

    # CUDA 12.8 wheels (the only CUDA build we ship in pyproject.toml's
    # `cuda` extra) require NVIDIA driver >= 570.
    if [[ "$DRIVER_MAJOR" -ge 570 ]]; then
      USE_CUDA=1
    else
      warn "Driver $DRIVER_MAJOR is too old for CUDA 12.8 wheels (need >= 570). Installing CPU torch — update your NVIDIA driver to get GPU acceleration."
    fi
  fi
fi

if [[ -z "$GPU_NAME" ]]; then
  ok "No NVIDIA GPU detected — using CPU PyTorch"
fi

# ---------------------------------------------------------------------------
# 2. Python deps. One uv sync call installs the right torch build because
#    pyproject.toml binds the `cuda` extra to the CUDA wheel index.
# ---------------------------------------------------------------------------
# `llm-local` ships as a prebuilt CPU wheel; include it by default so the
# narrate_* paths run against llama.cpp out of the box. CUDA acceleration
# for llama-cpp-python still needs a manual rebuild with
# CMAKE_ARGS="-DGGML_CUDA=on".
EXTRAS=(--extra app --extra connectors --extra app-dev --extra llm-local)
if [[ "$USE_CUDA" -eq 1 ]]; then
  EXTRAS+=(--extra cuda)
  step "Installing Python dependencies with CUDA 12.8 torch (uv sync ${EXTRAS[*]})"
else
  step "Installing Python dependencies with CPU torch (uv sync ${EXTRAS[*]})"
fi

uv sync "${EXTRAS[@]}"
ok "Dependencies installed"

# ---------------------------------------------------------------------------
# 3. Frontend
# ---------------------------------------------------------------------------
if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
  step "Installing frontend dependencies (npm ci)"
  (cd app/frontend && npm ci)
  ok "Frontend dependencies installed"
fi

# ---------------------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------------------
echo ""
echo "Setup complete."
if [[ "$USE_CUDA" -eq 1 ]]; then
  echo "  Device : $GPU_NAME (GPU, CUDA 12.8)"
elif [[ -n "$GPU_NAME" ]]; then
  echo "  Device : CPU (GPU present but driver too old)"
else
  echo "  Device : CPU"
fi
echo ""
echo "Start the app:"
echo "  Backend  : uv run uvicorn foreko.main:app --port 8000 --reload --app-dir app/backend"
echo "  Frontend : cd app/frontend && npm run dev"
