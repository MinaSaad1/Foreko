# Foreko setup script for Windows.
# Installs all Python dependencies and automatically selects the GPU-accelerated
# PyTorch build when an NVIDIA GPU with a modern driver is detected, falling
# back to CPU otherwise.

param(
  [switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "    WARN $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# 1. Detect NVIDIA GPU + driver up front. The driver version decides whether
#    we install the CUDA torch wheel via the `cuda` extra (modern driver) or
#    stay on the CPU wheel.
# ---------------------------------------------------------------------------
Write-Step "Detecting compute device"

$useCuda = $false
$gpuName = $null
$driverVer = 0.0

try {
  $smiOutput = & nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>$null
  if ($LASTEXITCODE -eq 0 -and $smiOutput) {
    $gpuName = $smiOutput.Split(",")[0].Trim()
    $driverVer = [double]($smiOutput.Split(",")[1].Trim().Split(".")[0])
    Write-Ok "Found $gpuName (driver $driverVer)"

    # CUDA 12.8 wheels (the only CUDA build we ship in pyproject.toml's
    # `cuda` extra) require NVIDIA driver >= 570 on Windows.
    if ($driverVer -ge 570) {
      $useCuda = $true
    } else {
      Write-Warn "Driver $driverVer is too old for CUDA 12.8 wheels (need >= 570). Installing CPU torch — update your NVIDIA driver to get GPU acceleration."
    }
  }
} catch {
  # nvidia-smi not on PATH — no NVIDIA GPU present
}

if (-not $gpuName) {
  Write-Ok "No NVIDIA GPU detected — using CPU PyTorch"
}

# ---------------------------------------------------------------------------
# 2. Python deps. One uv sync call installs the right torch build because
#    pyproject.toml binds the `cuda` extra to the CUDA wheel index.
# ---------------------------------------------------------------------------
$extras = @("--extra", "app", "--extra", "connectors", "--extra", "app-dev")
if ($useCuda) {
  $extras += @("--extra", "cuda")
  Write-Step "Installing Python dependencies with CUDA 12.8 torch (uv sync $($extras -join ' '))"
} else {
  Write-Step "Installing Python dependencies with CPU torch (uv sync $($extras -join ' '))"
}

& uv sync @extras
if ($LASTEXITCODE -ne 0) { throw "uv sync failed" }
Write-Ok "Dependencies installed"

# ---------------------------------------------------------------------------
# 3. Frontend
# ---------------------------------------------------------------------------
if (-not $SkipFrontend) {
  Write-Step "Installing frontend dependencies (npm ci)"
  Push-Location app/frontend
  try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  } finally {
    Pop-Location
  }
  Write-Ok "Frontend dependencies installed"
}

# ---------------------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
if ($useCuda) {
  Write-Host "  Device : $gpuName (GPU, CUDA 12.8)" -ForegroundColor Green
} elseif ($gpuName) {
  Write-Host "  Device : CPU (GPU present but driver too old)" -ForegroundColor Yellow
} else {
  Write-Host "  Device : CPU" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Start the app:"
Write-Host "  Backend  : uv run uvicorn foreko.main:app --port 8000 --reload --app-dir app/backend"
Write-Host "  Frontend : cd app/frontend && npm run dev"
