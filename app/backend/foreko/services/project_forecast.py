"""Per-series forecast execution against a selected policy.

Each series runs the model that won its own validation, and its forecast is
returned to the original scale by inverting the recipe that prepared it.

Two rules carry this module:

- No silent substitution. A series whose champion fails is reported as an
  exception; it never quietly gets a different model's numbers.
- A series without an eligible champion is not forecast at all. Validation
  already said the evidence does not support one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..schemas.project import ProjectRevisionCreate
from . import csv_loader
from .backtest import _forecast_one_model
from .ensemble_policy import combine
from .forecaster import _infer_future_dates
from .model_registry import ModelRegistry
from .preparation import PreparationError, prepare_series
from .validation_policy import ENSEMBLE_ID


@dataclass
class SeriesForecastResult:
    series_id: str
    model: str
    dates: list[str]
    point: list[float]
    p10: list[float]
    p90: list[float]
    ensemble_weights: dict[str, float] = field(default_factory=dict)


@dataclass
class SeriesException:
    series_id: str
    reason: str
    model: str | None = None


@dataclass
class ProjectForecastResult:
    forecasts: list[SeriesForecastResult]
    exceptions: list[SeriesException]

    def as_dict(self) -> dict[str, Any]:
        return {
            "series": [
                {
                    "series_id": f.series_id,
                    "model": f.model,
                    "dates": f.dates,
                    "point": f.point,
                    "p10": f.p10,
                    "p90": f.p90,
                    "ensemble_weights": f.ensemble_weights,
                }
                for f in self.forecasts
            ],
            "exceptions": [
                {"series_id": e.series_id, "reason": e.reason, "model": e.model}
                for e in self.exceptions
            ],
            "series_count": len(self.forecasts),
            "exception_count": len(self.exceptions),
        }


def _policy_for(policies: dict[str, Any], series_id: str) -> dict[str, Any] | None:
    entry = policies.get(series_id)
    return entry if isinstance(entry, dict) else None


async def run_project_forecast(
    *,
    dataset_id: str,
    config: ProjectRevisionCreate,
    series_policies: dict[str, Any],
    datasets_dir: Path,
    registry: ModelRegistry,
    progress_cb: Any = None,
    stop_event: Any = None,
) -> ProjectForecastResult:
    """Forecast every mapped series using the policy validation selected for it."""
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, config.mapping)
    if not ids:
        raise ValueError("The dataset has no series after mapping.")

    forecasts: list[SeriesForecastResult] = []
    exceptions: list[SeriesException] = []
    total = len(ids)

    for index, (series_id, series_values, series_dates) in enumerate(
        zip(ids, values, dates), start=1
    ):
        if stop_event is not None and stop_event.is_set():
            break
        if progress_cb:
            await progress_cb(index, total, f"{series_id}: forecasting")

        policy = _policy_for(series_policies, series_id)
        if policy is None:
            exceptions.append(
                SeriesException(
                    series_id=series_id,
                    reason="This series was not validated, so it has no model policy.",
                )
            )
            continue

        champion = policy.get("champion")
        if not champion:
            exceptions.append(
                SeriesException(
                    series_id=series_id,
                    reason=policy.get("reason")
                    or "No candidate completed every fold, so there is no champion.",
                )
            )
            continue

        try:
            result = await _forecast_series(
                series_id=series_id,
                series_values=np.asarray(series_values, dtype=float),
                series_dates=series_dates,
                config=config,
                policy=policy,
                champion=champion,
                registry=registry,
            )
        except PreparationError as exc:
            exceptions.append(
                SeriesException(series_id=series_id, reason=str(exc), model=champion)
            )
            continue
        except Exception as exc:  # noqa: BLE001 - surfaced verbatim as an exception row
            # Never fall back to another model. A number from a model the
            # evidence did not select is worse than a stated gap.
            exceptions.append(
                SeriesException(
                    series_id=series_id,
                    reason=f"{champion} failed: {exc}",
                    model=champion,
                )
            )
            continue

        forecasts.append(result)

    return ProjectForecastResult(forecasts=forecasts, exceptions=exceptions)


async def _forecast_series(
    *,
    series_id: str,
    series_values: np.ndarray,
    series_dates: pd.DatetimeIndex,
    config: ProjectRevisionCreate,
    policy: dict[str, Any],
    champion: str,
    registry: ModelRegistry,
) -> SeriesForecastResult:
    prepared = prepare_series(
        series_values, list(config.preparation_steps), dates=series_dates
    )
    horizon = config.horizon
    freq = None
    try:
        freq = pd.infer_freq(series_dates)
    except Exception:
        pass

    history = prepared.values
    history_dates = series_dates[prepared.history_offset :]

    if champion == ENSEMBLE_ID:
        weights = dict(policy.get("ensemble_weights") or {})
        if not weights:
            raise ValueError("The ensemble policy has no weights.")
        members: dict[str, np.ndarray] = {}
        bands: dict[str, tuple[np.ndarray, np.ndarray]] = {}
        for model in sorted(weights):
            point, p10, p90 = await _forecast_one_model(
                model=model,
                history_values=history,
                history_dates=history_dates,
                horizon=horizon,
                registry=registry,
                freq=freq,
            )
            members[model] = point
            bands[model] = (p10, p90)
        point = combine(members, weights)
        # The blend has no interval of its own, so it inherits the band of its
        # heaviest member rather than inventing one.
        heaviest = max(weights, key=lambda m: weights[m])
        p10, p90 = bands[heaviest]
    else:
        point, p10, p90 = await _forecast_one_model(
            model=champion,
            history_values=history,
            history_dates=history_dates,
            horizon=horizon,
            registry=registry,
            freq=freq,
        )

    # Back to the scale the user reads. The context is the whole original-scale
    # history, so a differencing inverse anchors on its last known value.
    point_original = prepared.inverse(np.asarray(point, dtype=float), context=series_values)
    p10_original = prepared.inverse(np.asarray(p10, dtype=float), context=series_values)
    p90_original = prepared.inverse(np.asarray(p90, dtype=float), context=series_values)

    future_dates = _infer_future_dates(series_dates, horizon)

    return SeriesForecastResult(
        series_id=series_id,
        model=champion,
        dates=[str(pd.Timestamp(d).date()) for d in future_dates],
        point=[float(v) for v in point_original],
        p10=[float(v) for v in np.minimum(p10_original, p90_original)],
        p90=[float(v) for v in np.maximum(p10_original, p90_original)],
        ensemble_weights=dict(policy.get("ensemble_weights") or {})
        if champion == ENSEMBLE_ID
        else {},
    )


__all__ = [
    "ProjectForecastResult",
    "SeriesException",
    "SeriesForecastResult",
    "run_project_forecast",
]
