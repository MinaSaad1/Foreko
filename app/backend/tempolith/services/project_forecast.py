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

from ..schemas.forecast import ForecastConfigIn
from ..schemas.project import CovariateRole, ProjectRevisionCreate
from . import csv_loader, factor_plan
from .backtest import _forecast_one_model
from .ensemble_policy import combine
from .forecaster import _infer_future_dates
from .model_registry import ModelRegistry
from .preparation import PreparationError, prepare_series
from .validation_policy import ENSEMBLE_ID


# Only TimesFM can consume covariates, through forecast_with_covariates. The
# classical baselines and the LightGBM baseline take (dates, values) only, so a
# future factor provably cannot change what they produce.
COVARIATE_CAPABLE_MODELS: frozenset[str] = frozenset({"timesfm"})

_NUMERIC_ROLES = {"known_future_numerical", "scenario_controlled"}
_CATEGORICAL_ROLES = {"known_future_categorical"}


def champions_of(series_policies: dict[str, Any]) -> set[str]:
    """Every model that will actually run, expanding ensembles to their members."""
    champions: set[str] = set()
    for policy in series_policies.values():
        if not isinstance(policy, dict):
            continue
        champion = policy.get("champion")
        if champion == ENSEMBLE_ID:
            champions.update((policy.get("ensemble_weights") or {}).keys())
        elif champion:
            champions.add(champion)
    return champions


def policy_consumes_covariates(series_policies: dict[str, Any]) -> bool:
    """True when at least one model that will run can read a covariate.

    Design 6.5 gates the factor plan on the selected policy requiring
    covariates. Asking for a value that no selected model can read means asking
    the user to supply an input which provably does nothing.
    """
    return bool(champions_of(series_policies) & COVARIATE_CAPABLE_MODELS)


def required_future_factors(
    roles: dict[str, CovariateRole], series_policies: dict[str, Any]
) -> tuple[str, ...]:
    """Factors the user must supply: declared as known-future AND readable."""
    if not policy_consumes_covariates(series_policies):
        return ()
    return factor_plan.required_covariates(roles)


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


def _covariate_history_by_series(
    df: pd.DataFrame, config: ProjectRevisionCreate, ids: list[str]
) -> dict[str, dict[str, np.ndarray]]:
    """Observed values of every declared covariate, per series.

    A dynamic covariate must span history and horizon, so the planned future
    values alone are not enough; the model needs what actually happened too.
    """
    names = [
        name
        for name, role in config.covariate_roles.items()
        if role in _NUMERIC_ROLES | _CATEGORICAL_ROLES and name in df.columns
    ]
    if not names:
        return {}

    series_col = config.mapping.series_id_col
    out: dict[str, dict[str, np.ndarray]] = {}
    if series_col and series_col in df.columns:
        for series_id, group in df.groupby(series_col):
            out[str(series_id)] = {n: group[n].to_numpy() for n in names}
    else:
        out[ids[0]] = {n: df[n].to_numpy() for n in names}
    return out


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
    future_factors: dict[str, dict[str, Any]] | None = None,
    progress_cb: Any = None,
    stop_event: Any = None,
) -> ProjectForecastResult:
    """Forecast every mapped series using the policy validation selected for it."""
    df = csv_loader.load_dataset(dataset_id, datasets_dir)
    ids, values, dates = csv_loader.extract_series(df, config.mapping)
    if not ids:
        raise ValueError("The dataset has no series after mapping.")

    covariate_history = _covariate_history_by_series(df, config, ids)

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
                covariate_history=covariate_history.get(series_id, {}),
                future_factors=future_factors,
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


async def _forecast_with_covariates(
    *,
    history: np.ndarray,
    horizon: int,
    registry: ModelRegistry,
    roles: dict[str, CovariateRole],
    covariate_history: dict[str, np.ndarray],
    future_factors: dict[str, dict[str, Any]],
    history_offset: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """TimesFM with external regressors.

    A dynamic covariate must span the history and the horizon, so each one is
    the observed history concatenated with the values the user planned.
    """
    dynamic_numeric: dict[str, list[Any]] = {}
    dynamic_categorical: dict[str, list[Any]] = {}

    for name, role in roles.items():
        if name not in future_factors:
            continue
        planned = future_factors[name]
        observed = covariate_history.get(name)
        if observed is None:
            raise ValueError(
                f"{name} is planned for the future but absent from the dataset, "
                "so it cannot be used as a covariate."
            )
        past = list(observed[history_offset:])
        future = [planned[period] for period in sorted(planned)]
        if len(future) < horizon:
            raise ValueError(f"{name} has fewer planned values than the horizon.")
        combined = past + future[:horizon]

        if role in _NUMERIC_ROLES:
            dynamic_numeric[name] = [[float(v) for v in combined]]
        elif role in _CATEGORICAL_ROLES:
            dynamic_categorical[name] = [[str(v) for v in combined]]

    point_all, quantiles_all, _hash = await registry.forecast_with_covariates(
        config=ForecastConfigIn(),
        inputs=[history.copy()],
        dynamic_numerical_covariates=dynamic_numeric or None,
        dynamic_categorical_covariates=dynamic_categorical or None,
    )
    point = np.asarray(point_all[0], dtype=float)[:horizon]
    quantiles = np.asarray(quantiles_all[0], dtype=float)
    return point, quantiles[:horizon, 1], quantiles[:horizon, 9]


async def _forecast_series(
    *,
    series_id: str,
    series_values: np.ndarray,
    series_dates: pd.DatetimeIndex,
    config: ProjectRevisionCreate,
    policy: dict[str, Any],
    champion: str,
    registry: ModelRegistry,
    covariate_history: dict[str, np.ndarray] | None = None,
    future_factors: dict[str, dict[str, Any]] | None = None,
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

    if champion in COVARIATE_CAPABLE_MODELS and future_factors:
        point, p10, p90 = await _forecast_with_covariates(
            history=history,
            horizon=horizon,
            registry=registry,
            roles=config.covariate_roles,
            covariate_history=covariate_history or {},
            future_factors=future_factors,
            history_offset=prepared.history_offset,
        )
    elif champion == ENSEMBLE_ID:
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


def scenario_deltas(
    baseline: dict[str, Any], scenario: dict[str, Any]
) -> dict[str, Any]:
    """Difference between a scenario and the baseline it was copied from.

    Absolute, percentage, and cumulative per series, plus a portfolio total.
    Percentage is None where the baseline is zero, because a change from nothing
    has no percentage, and reporting one would invent a number.

    A series present in one and not the other is reported rather than dropped:
    silently comparing different sets of series would make the totals lie.
    """
    baseline_series = {s["series_id"]: s for s in baseline.get("series", [])}
    scenario_series = {s["series_id"]: s for s in scenario.get("series", [])}
    shared = sorted(set(baseline_series) & set(scenario_series))

    per_series: list[dict[str, Any]] = []
    portfolio_baseline = 0.0
    portfolio_scenario = 0.0

    for series_id in shared:
        base_points = [float(v) for v in baseline_series[series_id]["point"]]
        scen_points = [float(v) for v in scenario_series[series_id]["point"]]
        length = min(len(base_points), len(scen_points))
        base_points, scen_points = base_points[:length], scen_points[:length]

        absolute = [s - b for b, s in zip(base_points, scen_points)]
        percent = [
            ((s - b) / b * 100.0) if abs(b) > 1e-9 else None
            for b, s in zip(base_points, scen_points)
        ]
        base_total = float(sum(base_points))
        scen_total = float(sum(scen_points))
        portfolio_baseline += base_total
        portfolio_scenario += scen_total

        per_series.append(
            {
                "series_id": series_id,
                "dates": baseline_series[series_id]["dates"][:length],
                "baseline": base_points,
                "scenario": scen_points,
                "absolute": absolute,
                "percent": percent,
                "cumulative_absolute": float(sum(absolute)),
                "baseline_total": base_total,
                "scenario_total": scen_total,
                "total_percent": (
                    (scen_total - base_total) / base_total * 100.0
                    if abs(base_total) > 1e-9
                    else None
                ),
            }
        )

    return {
        "series": per_series,
        "only_in_baseline": sorted(set(baseline_series) - set(scenario_series)),
        "only_in_scenario": sorted(set(scenario_series) - set(baseline_series)),
        "portfolio": {
            "baseline_total": portfolio_baseline,
            "scenario_total": portfolio_scenario,
            "absolute": portfolio_scenario - portfolio_baseline,
            "percent": (
                (portfolio_scenario - portfolio_baseline) / portfolio_baseline * 100.0
                if abs(portfolio_baseline) > 1e-9
                else None
            ),
        },
    }


__all__ = [
    "ProjectForecastResult",
    "SeriesException",
    "SeriesForecastResult",
    "run_project_forecast",
    "scenario_deltas",
]
