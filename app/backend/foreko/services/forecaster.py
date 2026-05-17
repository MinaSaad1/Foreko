"""High-level forecasting workflows that stitch CSV loader + model registry."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..schemas.covariates import CovariateForecastRequest
from ..schemas.dataset import ColumnMapping
from ..schemas.finetune import AdapterForecastRequest
from ..schemas.forecast import (
    ForecastConfigIn,
    ForecastRequest,
    ForecastResponse,
    SeriesForecast,
)
from . import csv_loader
from .device import DeviceInfo
from .model_registry import ModelRegistry

logger = logging.getLogger(__name__)


_FREQ_FALLBACKS = {
    "D": "D",
    "W": "W",
    "MS": "MS",
    "M": "MS",
    "H": "H",
}


def _infer_future_dates(history: pd.DatetimeIndex, horizon: int) -> pd.DatetimeIndex:
    """Build the x-axis for the forecast window based on the history frequency."""

    if len(history) < 2:
        # One-point history: default to monthly start to match data.csv flavour.
        return pd.date_range(start=history[-1], periods=horizon + 1, freq="MS")[1:]

    freq = pd.infer_freq(history) or _FREQ_FALLBACKS.get("MS", "MS")
    if freq == "M":
        freq = "MS"
    try:
        if freq in ("MS", "M"):
            start = history[-1] + pd.offsets.MonthBegin(1)
        elif freq in ("W", "W-SUN", "W-MON"):
            start = history[-1] + pd.Timedelta(weeks=1)
        elif freq == "D":
            start = history[-1] + pd.Timedelta(days=1)
        elif freq == "H":
            start = history[-1] + pd.Timedelta(hours=1)
        else:
            # Best effort: median delta between consecutive points.
            diffs = history[1:] - history[:-1]
            median = pd.Timedelta(np.median(diffs.astype("int64")), unit="ns")
            start = history[-1] + median
            return pd.date_range(start=start, periods=horizon, freq=median)
        return pd.date_range(start=start, periods=horizon, freq=freq)
    except Exception:
        diffs = history[1:] - history[:-1]
        median = pd.Timedelta(np.median(diffs.astype("int64")), unit="ns")
        return pd.date_range(start=history[-1] + median, periods=horizon, freq=median)


def _pack_series_forecast(
    *,
    series_id: str,
    history_dates: pd.DatetimeIndex,
    history_values: np.ndarray,
    future_dates: pd.DatetimeIndex,
    point: np.ndarray,
    quantiles: np.ndarray,
) -> SeriesForecast:
    """Shape raw model arrays into the wire format.

    ``quantiles`` has layout ``[mean, p10, p20, ..., p90]`` per
    timesfm_2p5_base.py:188, so p10 is column 1, p50 is column 5, p90 is column 9.
    """

    q10 = quantiles[:, 1].astype(float).tolist()
    q50 = quantiles[:, 5].astype(float).tolist()
    q90 = quantiles[:, 9].astype(float).tolist()
    all_q = quantiles.astype(float).tolist()

    return SeriesForecast(
        id=series_id,
        history_dates=[str(d.date()) for d in history_dates],
        history_values=[float(v) for v in history_values],
        future_dates=[str(d.date()) for d in future_dates],
        point=[float(v) for v in point],
        q10=q10,
        q50=q50,
        q90=q90,
        all_quantiles=all_q,
    )


async def zero_shot_forecast(
    *,
    df: pd.DataFrame,
    request: ForecastRequest,
    registry: ModelRegistry,
) -> ForecastResponse:
    """End-to-end forecast for a dataset + mapping + horizon."""

    ids, values, dates = csv_loader.extract_series(df, request.mapping)

    point_all, quantiles_all, cfg_hash = await registry.forecast(
        config=request.forecast_config,
        horizon=request.horizon,
        inputs=[v.copy() for v in values],
    )

    results: list[SeriesForecast] = []
    for idx, sid in enumerate(ids):
        hist_dates = dates[idx]
        hist_values = values[idx]
        future_dates = _infer_future_dates(hist_dates, request.horizon)
        results.append(
            _pack_series_forecast(
                series_id=sid,
                history_dates=hist_dates,
                history_values=hist_values,
                future_dates=future_dates,
                point=np.asarray(point_all[idx]),
                quantiles=np.asarray(quantiles_all[idx]),
            )
        )

    return ForecastResponse(
        horizon=request.horizon,
        series=results,
        compile_config_hash=cfg_hash,
    )


async def with_covariates_forecast(
    *,
    df: pd.DataFrame,
    request: CovariateForecastRequest,
    registry: ModelRegistry,
) -> ForecastResponse:
    """Forecast using external regressors (covariates)."""

    ids, values, dates = csv_loader.extract_series(df, request.mapping)

    cov = request.covariate_config

    # Build covariate dicts.  Each value must be a list-of-lists:
    # one inner list per series, length = context_len + horizon.
    def _pad_or_slice(arr: np.ndarray, target_len: int) -> list[float]:
        """Forward-fill *arr* to *target_len* or slice it down."""
        if len(arr) >= target_len:
            return arr[:target_len].tolist()
        pad = np.full(target_len - len(arr), arr[-1] if len(arr) else 0.0)
        return np.concatenate([arr, pad]).tolist()

    def _col_per_series(col: str) -> list[list[float]]:
        """Extract *col* values for each series, aligned with the target array."""
        result: list[list[float]] = []
        if request.mapping.series_id_col is None:
            raw = pd.to_numeric(df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
            for v in values:
                result.append(_pad_or_slice(raw, len(v) + request.horizon))
        else:
            for sid, group in df.groupby(request.mapping.series_id_col, sort=True):
                raw = (
                    pd.to_numeric(group[col], errors="coerce")
                    .fillna(0.0)
                    .to_numpy(dtype=float)
                )
                result.append(_pad_or_slice(raw, len(values[len(result)]) + request.horizon))
        return result

    def _static_mean_per_series(col: str) -> list[float]:
        """Return one scalar per series (mean of the column for that series)."""
        result: list[float] = []
        if request.mapping.series_id_col is None:
            raw = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
            for _ in values:
                result.append(float(raw.mean()))
        else:
            for _, group in df.groupby(request.mapping.series_id_col, sort=True):
                raw = pd.to_numeric(group[col], errors="coerce").fillna(0.0)
                result.append(float(raw.mean()))
        return result

    def _label_encode_col(col: str) -> list[list[int]]:
        """Integer-encode a categorical column, one list per series."""
        sorted_unique = sorted(df[col].dropna().unique().tolist(), key=str)
        label_map = {v: i for i, v in enumerate(sorted_unique)}
        result: list[list[int]] = []
        if request.mapping.series_id_col is None:
            raw = df[col].map(label_map).fillna(0).astype(int).to_numpy()
            for v in values:
                result.append(_pad_or_slice(raw.astype(float), len(v) + request.horizon))
        else:
            for _, group in df.groupby(request.mapping.series_id_col, sort=True):
                raw = group[col].map(label_map).fillna(0).astype(int).to_numpy()
                result.append(_pad_or_slice(raw.astype(float), len(values[len(result)]) + request.horizon))
        return result  # type: ignore[return-value]

    def _static_cat_per_series(col: str) -> list[int]:
        """Mode-encode a categorical column, returning one int per series."""
        sorted_unique = sorted(df[col].dropna().unique().tolist(), key=str)
        label_map = {v: i for i, v in enumerate(sorted_unique)}
        result: list[int] = []
        if request.mapping.series_id_col is None:
            mode_val = df[col].mode()
            val = label_map.get(mode_val.iloc[0] if len(mode_val) else 0, 0)
            for _ in values:
                result.append(val)
        else:
            for _, group in df.groupby(request.mapping.series_id_col, sort=True):
                mode_val = group[col].mode()
                val = label_map.get(mode_val.iloc[0] if len(mode_val) else 0, 0)
                result.append(val)
        return result

    dyn_num = {c: _col_per_series(c) for c in cov.dynamic_numerical} or None
    dyn_cat = {c: _label_encode_col(c) for c in cov.dynamic_categorical} or None
    stat_num = {c: _static_mean_per_series(c) for c in cov.static_numerical} or None
    stat_cat = {c: _static_cat_per_series(c) for c in cov.static_categorical} or None

    # TimesFM 2.5 xreg_mode takes "xreg + timesfm" or "timesfm + xreg".
    # Map our API-friendly names to the model's expected strings.
    xreg_mode_map = {
        "additive": "xreg + timesfm",
        "multiplicative": "timesfm + xreg",
    }
    model_xreg_mode = xreg_mode_map.get(cov.xreg_mode, "xreg + timesfm")

    point_all, quantiles_all, cfg_hash = await registry.forecast_with_covariates(
        config=request.forecast_config,
        inputs=[v.copy() for v in values],
        dynamic_numerical_covariates=dyn_num,
        dynamic_categorical_covariates=dyn_cat,
        static_numerical_covariates=stat_num,
        static_categorical_covariates=stat_cat,
        xreg_mode=model_xreg_mode,
    )

    results: list[SeriesForecast] = []
    for idx, sid in enumerate(ids):
        future_dates = _infer_future_dates(dates[idx], request.horizon)
        results.append(
            _pack_series_forecast(
                series_id=sid,
                history_dates=dates[idx],
                history_values=values[idx],
                future_dates=future_dates,
                point=np.asarray(point_all[idx]),
                quantiles=np.asarray(quantiles_all[idx]),
            )
        )

    return ForecastResponse(
        horizon=request.horizon,
        series=results,
        compile_config_hash=cfg_hash,
    )


async def with_adapter_forecast(
    *,
    request: AdapterForecastRequest,
    adapter_path: Path,
    datasets_dir: Path,
    device_info: DeviceInfo,
) -> ForecastResponse:
    """Run inference with a LoRA-adapted model.

    Quantiles are not available from the HF model in point-only mode, so
    q10/q50/q90 are all set equal to the point forecast.  The UI should
    surface this as "point-only" to the user.
    """

    df = csv_loader.load_dataset(request.dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, request.mapping)

    is_cpu = device_info.kind == "cpu"
    device = "cuda" if not is_cpu else "cpu"
    dtype = import_torch_dtype(is_cpu)

    def _run_adapter_inference() -> list[list[float]]:
        import torch
        from peft import PeftModel
        from transformers import TimesFm2_5ModelForPrediction

        base_model = TimesFm2_5ModelForPrediction.from_pretrained(
            str(adapter_path.parent.parent),  # adapters_dir parent is storage_dir
            torch_dtype=dtype,
            device_map=device,
        )
        # Load the adapter weights on top of the base model.
        model = PeftModel.from_pretrained(base_model, str(adapter_path))
        model.eval()

        results: list[list[float]] = []
        ctx_len = request.context_len

        with torch.no_grad():
            for v in values:
                ctx = v[-ctx_len:] if len(v) >= ctx_len else v
                past = torch.tensor(ctx, dtype=torch.float32).unsqueeze(0).to(device)
                out = model(past_values=past, forecast_context_len=len(ctx))
                # mean_predictions shape: (batch, horizon)
                preds = out.mean_predictions[0].cpu().float().tolist()
                results.append(preds)
        return results

    point_all: list[list[float]] = await asyncio.to_thread(_run_adapter_inference)

    results: list[SeriesForecast] = []
    for idx, sid in enumerate(ids):
        future_dates = _infer_future_dates(dates[idx], request.horizon)
        pt = point_all[idx][: request.horizon]
        # Pad if the model returned fewer steps than requested.
        if len(pt) < request.horizon:
            pt = pt + [pt[-1]] * (request.horizon - len(pt))
        results.append(
            SeriesForecast(
                id=sid,
                history_dates=[str(d.date()) for d in dates[idx]],
                history_values=[float(v) for v in values[idx]],
                future_dates=[str(d.date()) for d in future_dates],
                point=pt,
                q10=pt,   # point-only: bands equal the mean
                q50=pt,
                q90=pt,
                all_quantiles=[[v] * 10 for v in pt],
            )
        )

    return ForecastResponse(
        horizon=request.horizon,
        series=results,
        compile_config_hash="adapter:" + adapter_path.name,
    )


def import_torch_dtype(is_cpu: bool) -> Any:
    """Return the appropriate torch dtype for the given device."""
    import torch
    return torch.float32 if is_cpu else torch.bfloat16


__all__ = ["zero_shot_forecast", "with_covariates_forecast", "with_adapter_forecast"]
