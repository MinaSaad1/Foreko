"""Walk-forward backtest service.

Implements expanding-window backtest across N folds, computing standard
regression and probabilistic forecasting metrics (MAPE, sMAPE, RMSE, MAE,
MASE, pinball at p10/p50/p90) per model per fold. Designed to be driven by
:class:`jobs.generic.GenericJobManager` for SSE progress streaming.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import csv_loader
from .classical_baselines import arima_forecast, ets_forecast, prophet_forecast, seasonal_naive
from .forecaster import _infer_future_dates
from .lightgbm_baseline import fit_and_forecast as lgb_fit_and_forecast
from .model_registry import ModelRegistry

logger = logging.getLogger(__name__)

MODEL_IDS = ["timesfm", "lightgbm", "seasonal_naive", "ets", "arima", "prophet"]


@dataclass
class FoldMetrics:
    fold: int
    train_end: int
    test_start: int
    test_end: int
    mape: float
    smape: float
    rmse: float
    mae: float
    mase: float
    pinball_10: float
    pinball_50: float
    pinball_90: float
    point_forecast: list[float]
    actuals: list[float]
    p10: list[float]
    p90: list[float]


def _mape(a: np.ndarray, f: np.ndarray) -> float:
    mask = np.abs(a) > 1e-9
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((a[mask] - f[mask]) / a[mask])))


def _smape(a: np.ndarray, f: np.ndarray) -> float:
    denom = (np.abs(a) + np.abs(f)) / 2.0
    mask = denom > 1e-9
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs(a[mask] - f[mask]) / denom[mask]))


def _rmse(a: np.ndarray, f: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - f) ** 2)))


def _mae(a: np.ndarray, f: np.ndarray) -> float:
    return float(np.mean(np.abs(a - f)))


def _mase(actual: np.ndarray, forecast: np.ndarray, history: np.ndarray, m: int = 1) -> float:
    """Mean Absolute Scaled Error, scale = in-sample seasonal naive MAE."""
    if len(history) <= m:
        return float("nan")
    scale = float(np.mean(np.abs(history[m:] - history[:-m])))
    if scale < 1e-9:
        return float("nan")
    return float(np.mean(np.abs(actual - forecast)) / scale)


def _pinball(actual: np.ndarray, quantile_forecast: np.ndarray, q: float) -> float:
    diff = actual - quantile_forecast
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def _split_plan(n: int, horizon: int, folds: int, min_train: int) -> list[tuple[int, int]]:
    """Produce (train_end, test_end) pairs for an expanding-window backtest."""
    if n < min_train + horizon * folds:
        folds = max(1, (n - min_train) // horizon)
    if folds < 1:
        return []
    step = (n - min_train - horizon) // max(folds - 1, 1) if folds > 1 else 0
    splits: list[tuple[int, int]] = []
    for k in range(folds):
        train_end = min_train + k * step
        test_end = train_end + horizon
        if test_end > n:
            break
        splits.append((train_end, test_end))
    return splits


async def _forecast_one_model(
    *,
    model: str,
    history_values: np.ndarray,
    history_dates: pd.DatetimeIndex,
    horizon: int,
    registry: ModelRegistry,
    freq: str | None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if model == "timesfm":
        from ..schemas.forecast import ForecastConfigIn
        point_all, q_all, _ = await registry.forecast(
            config=ForecastConfigIn(),
            horizon=horizon,
            inputs=[history_values.copy()],
        )
        point = np.asarray(point_all[0], dtype=float)
        q = np.asarray(q_all[0], dtype=float)
        p10 = q[:, 1]
        p90 = q[:, 9]
        return point, p10, p90
    if model == "lightgbm":
        future_dates = _infer_future_dates(history_dates, horizon)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: lgb_fit_and_forecast(
                dates=history_dates,
                values=history_values,
                future_dates=future_dates,
                horizon=horizon,
            ),
        )
        point = np.asarray(result.point_forecast, dtype=float)
        std = float(np.std(history_values)) if len(history_values) else 1.0
        return point, point - 1.28 * std, point + 1.28 * std
    if model == "seasonal_naive":
        return seasonal_naive(history_values, horizon, freq)
    if model == "ets":
        return ets_forecast(history_values, horizon, freq)
    if model == "arima":
        return arima_forecast(history_values, horizon, freq)
    if model == "prophet":
        return prophet_forecast(list(history_dates), history_values, horizon, freq)
    raise ValueError(f"unknown model {model!r}")


async def run_walk_forward(
    *,
    dataset_id: str,
    mapping: Any,
    horizon: int,
    folds: int,
    models: list[str],
    datasets_dir: Path,
    registry: ModelRegistry,
    progress_cb: Any = None,
    stop_event: Any = None,
) -> dict[str, Any]:
    """Run an expanding-window walk-forward backtest for the given models.

    ``progress_cb(current, total, stage)`` is awaited on each step.
    ``stop_event`` is a threading.Event checked between folds for cancellation.
    """

    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, mapping)
    if not ids:
        raise ValueError("Dataset has no series after mapping.")

    series_values = values[0]
    series_dates = dates[0]
    n = len(series_values)
    freq = None
    try:
        freq = pd.infer_freq(series_dates)
    except Exception:
        pass

    min_train = max(horizon, 12)
    plan = _split_plan(n, horizon, folds, min_train)
    if not plan:
        raise ValueError(
            f"Not enough data for {folds} folds at horizon {horizon}. "
            f"Need at least {min_train + horizon} points, have {n}. "
            f"Try reducing the horizon or using a larger dataset."
        )

    total_steps = len(plan) * len(models)
    step = 0

    results: dict[str, list[FoldMetrics]] = {m: [] for m in models}

    for fold_idx, (train_end, test_end) in enumerate(plan):
        if stop_event is not None and stop_event.is_set():
            break
        history = series_values[:train_end].astype(float)
        history_dates = series_dates[:train_end]
        actuals = series_values[train_end:test_end].astype(float)

        for model in models:
            if stop_event is not None and stop_event.is_set():
                break
            step += 1
            if progress_cb:
                await progress_cb(step, total_steps, f"fold {fold_idx + 1}/{len(plan)}: {model}")

            try:
                point, p10, p90 = await _forecast_one_model(
                    model=model,
                    history_values=history,
                    history_dates=history_dates,
                    horizon=len(actuals),
                    registry=registry,
                    freq=freq,
                )
            except Exception as exc:
                logger.warning("Model %s failed on fold %d: %s", model, fold_idx, exc)
                point = np.full(len(actuals), history[-1] if len(history) else 0.0)
                p10 = point
                p90 = point

            m = _detect_period(freq, len(history))
            metrics = FoldMetrics(
                fold=fold_idx + 1,
                train_end=train_end,
                test_start=train_end,
                test_end=test_end,
                mape=_mape(actuals, point),
                smape=_smape(actuals, point),
                rmse=_rmse(actuals, point),
                mae=_mae(actuals, point),
                mase=_mase(actuals, point, history, m=m),
                pinball_10=_pinball(actuals, p10, 0.1),
                pinball_50=_pinball(actuals, point, 0.5),
                pinball_90=_pinball(actuals, p90, 0.9),
                point_forecast=[float(v) for v in point],
                actuals=[float(v) for v in actuals],
                p10=[float(v) for v in p10],
                p90=[float(v) for v in p90],
            )
            results[model].append(metrics)

    # Aggregate
    aggregate: dict[str, dict[str, float]] = {}
    for model, folds_list in results.items():
        if not folds_list:
            continue
        aggregate[model] = {
            "mape_mean": float(np.mean([f.mape for f in folds_list])),
            "mape_std": float(np.std([f.mape for f in folds_list])),
            "smape_mean": float(np.mean([f.smape for f in folds_list])),
            "rmse_mean": float(np.mean([f.rmse for f in folds_list])),
            "mae_mean": float(np.mean([f.mae for f in folds_list])),
            "mase_mean": float(np.nanmean([f.mase for f in folds_list])),
            "pinball_10_mean": float(np.mean([f.pinball_10 for f in folds_list])),
            "pinball_50_mean": float(np.mean([f.pinball_50 for f in folds_list])),
            "pinball_90_mean": float(np.mean([f.pinball_90 for f in folds_list])),
        }

    # Per-horizon MAPE (averaged across folds, for the best-fold-aligned actuals)
    per_horizon: dict[str, list[float]] = {}
    for model, folds_list in results.items():
        if not folds_list:
            continue
        horizon_actual = len(folds_list[0].actuals)
        errs = []
        for h in range(horizon_actual):
            vals = []
            for f in folds_list:
                if h < len(f.actuals) and abs(f.actuals[h]) > 1e-9:
                    vals.append(abs((f.actuals[h] - f.point_forecast[h]) / f.actuals[h]))
            errs.append(float(np.mean(vals)) if vals else 0.0)
        per_horizon[model] = errs

    winner = None
    if aggregate:
        winner = min(aggregate.items(), key=lambda kv: kv[1]["mape_mean"])[0]

    return {
        "horizon": horizon,
        "folds": len(plan),
        "models": list(results.keys()),
        "aggregate": aggregate,
        "per_horizon_mape": per_horizon,
        "fold_details": {
            model: [
                {
                    "fold": f.fold,
                    "train_end": f.train_end,
                    "test_start": f.test_start,
                    "test_end": f.test_end,
                    "mape": f.mape,
                    "smape": f.smape,
                    "rmse": f.rmse,
                    "mae": f.mae,
                    "mase": f.mase,
                    "pinball_10": f.pinball_10,
                    "pinball_50": f.pinball_50,
                    "pinball_90": f.pinball_90,
                }
                for f in folds_list
            ]
            for model, folds_list in results.items()
        },
        "winner": winner,
    }


def _detect_period(freq: str | None, n: int) -> int:
    if freq in ("D", "B") and n >= 14:
        return 7
    if freq in ("MS", "M") and n >= 24:
        return 12
    if freq in ("W",) and n >= 104:
        return 52
    return 1


async def run_walk_forward_in_job(
    *,
    job_manager: Any,
    job: Any,
    dataset_id: str,
    mapping: Any,
    horizon: int,
    folds: int,
    models: list[str],
    datasets_dir: Path,
    registry: ModelRegistry,
) -> None:
    """Run the backtest inside a GenericJob, pushing progress to its SSE queue."""
    try:
        async def progress(current: int, total: int, stage: str) -> None:
            await job_manager.emit_progress(job, current=current, total=total, stage=stage)

        result = await run_walk_forward(
            dataset_id=dataset_id,
            mapping=mapping,
            horizon=horizon,
            folds=folds,
            models=models,
            datasets_dir=datasets_dir,
            registry=registry,
            progress_cb=progress,
            stop_event=job.stop_event,
        )
        if job.stop_event.is_set():
            return
        await job_manager.finish(job, result)
    except Exception as exc:
        logger.exception("Walk-forward failed")
        await job_manager.fail(job, str(exc))
