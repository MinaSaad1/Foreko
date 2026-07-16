"""Fold metrics, per-series eligibility, and model selection.

The selection rule, from design 6.3 and 6.4:

- A candidate is eligible for a series only if it completed every configured
  fold for that series. A partial candidate's surviving folds are a biased
  sample of the ones it happened to survive.
- Selection runs independently per series and produces one policy per series.
- The portfolio score is the equal-weight mean of valid per-series scores, so a
  high-volume series cannot decide the portfolio's champion on its own. WAPE is
  reported alongside to represent magnitude-weighted business error.

A metric that cannot be computed is None with a stated reason, never zero.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from .backtest import FoldFailure, FoldPrediction
from .ensemble_policy import (
    CandidateMetrics,
    combine,
    fit_ensemble_weights,
    promote_ensemble,
)


PrimaryMetric = Literal["mase", "wape", "smape"]

ENSEMBLE_ID = "ensemble"


@dataclass(frozen=True)
class MetricSet:
    mase: float | None = None
    wape: float | None = None
    smape: float | None = None
    rmse: float | None = None
    bias_pct: float | None = None
    coverage_p10_p90: float | None = None
    warnings: tuple[str, ...] = ()

    def primary(self, metric: PrimaryMetric) -> float | None:
        return getattr(self, metric)


@dataclass(frozen=True)
class SeriesModelPolicy:
    series_id: str
    champion: str | None
    challenger: str | None
    metrics: dict[str, MetricSet]
    eligible: tuple[str, ...]
    ineligible: dict[str, str]
    reason: str
    ensemble_weights: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class ValidationResult:
    series_policies: dict[str, SeriesModelPolicy]
    portfolio_metrics: MetricSet
    primary_metric: PrimaryMetric
    failures: tuple[FoldFailure, ...] = ()


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def wape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    """Weighted absolute percentage error: sum|a-p| / sum|a|."""
    denominator = float(np.sum(np.abs(actual)))
    if denominator < 1e-9:
        return None
    return float(np.sum(np.abs(actual - predicted)) / denominator)


def smape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    denominator = (np.abs(actual) + np.abs(predicted)) / 2.0
    mask = denominator > 1e-9
    if not mask.any():
        return None
    return float(np.mean(np.abs(actual[mask] - predicted[mask]) / denominator[mask]))


def rmse(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    if not len(actual):
        return None
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))


def signed_bias_pct(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    """Signed bias as a percentage of total actuals.

    Signed on purpose: over- and under-forecasting must not cancel into a
    flattering absolute number.
    """
    denominator = float(np.sum(np.abs(actual)))
    if denominator < 1e-9:
        return None
    return float(np.sum(predicted - actual) / denominator * 100.0)


def interval_coverage(
    actual: np.ndarray, p10: np.ndarray, p90: np.ndarray
) -> float | None:
    """Share of actuals that landed inside the P10 to P90 band."""
    if not len(actual):
        return None
    inside = (actual >= np.minimum(p10, p90)) & (actual <= np.maximum(p10, p90))
    return float(np.mean(inside))


def _mase_from_rows(rows: Sequence[FoldPrediction]) -> tuple[float | None, list[str]]:
    """Mean of per-fold MASE, per design 6.3.

    Each fold scales by its own training history, so MASE is computed per fold
    and then averaged. Pooling every row against one scale would silently weight
    folds by length.
    """
    warnings: list[str] = []
    by_fold: dict[int, list[FoldPrediction]] = {}
    for row in rows:
        by_fold.setdefault(row.fold, []).append(row)

    per_fold: list[float] = []
    for fold, fold_rows in sorted(by_fold.items()):
        scale = fold_rows[0].mase_scale
        if not np.isfinite(scale) or scale <= 1e-9:
            warnings.append(
                f"Fold {fold} has no usable MASE scale: its history is flat or too short."
            )
            continue
        actual = np.asarray([r.actual for r in fold_rows], dtype=float)
        point = np.asarray([r.point for r in fold_rows], dtype=float)
        per_fold.append(float(np.mean(np.abs(actual - point)) / scale))

    if not per_fold:
        return None, warnings
    return float(np.mean(per_fold)), warnings


def metrics_for_rows(rows: Sequence[FoldPrediction]) -> MetricSet:
    """Every metric for one candidate on one series, from its out-of-fold rows."""
    if not rows:
        return MetricSet(warnings=("No out-of-fold rows.",))

    actual = np.asarray([r.actual for r in rows], dtype=float)
    point = np.asarray([r.point for r in rows], dtype=float)
    p10 = np.asarray([r.p10 for r in rows], dtype=float)
    p90 = np.asarray([r.p90 for r in rows], dtype=float)

    mase_value, warnings = _mase_from_rows(rows)
    wape_value = wape(actual, point)
    if wape_value is None:
        warnings.append("WAPE is undefined: the actuals sum to zero.")

    return MetricSet(
        mase=mase_value,
        wape=wape_value,
        smape=smape(actual, point),
        rmse=rmse(actual, point),
        bias_pct=signed_bias_pct(actual, point),
        coverage_p10_p90=interval_coverage(actual, p10, p90),
        warnings=tuple(warnings),
    )


# ---------------------------------------------------------------------------
# Selection
# ---------------------------------------------------------------------------


def _aligned_rows(
    rows: Sequence[FoldPrediction], models: Sequence[str]
) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """Predictions per model on identical (fold, horizon_step) keys.

    Comparing an ensemble against an individual model on different rows would
    compare different questions, so the keys are intersected first.
    """
    by_model: dict[str, dict[tuple[int, int], FoldPrediction]] = {}
    for row in rows:
        if row.model in models:
            by_model.setdefault(row.model, {})[(row.fold, row.horizon_step)] = row

    if len(by_model) != len(models):
        return {}, np.asarray([], dtype=float)

    shared: set[tuple[int, int]] | None = None
    for keyed in by_model.values():
        shared = set(keyed) if shared is None else (shared & set(keyed))
    if not shared:
        return {}, np.asarray([], dtype=float)

    ordered = sorted(shared)
    predictions = {
        model: np.asarray([by_model[model][k].point for k in ordered], dtype=float)
        for model in models
    }
    first = next(iter(by_model.values()))
    actuals = np.asarray([first[k].actual for k in ordered], dtype=float)
    return predictions, actuals


def select_series_policy(
    series_id: str,
    rows: Sequence[FoldPrediction],
    failures: Sequence[FoldFailure],
    *,
    expected_folds: int,
    primary_metric: PrimaryMetric = "mase",
) -> SeriesModelPolicy:
    """Choose a champion for one series."""
    candidates = sorted({r.model for r in rows})
    failed = {f.model for f in failures if f.series_id == series_id}

    eligible: list[str] = []
    ineligible: dict[str, str] = {}
    metrics: dict[str, MetricSet] = {}

    for model in candidates:
        model_rows = [r for r in rows if r.model == model]
        metrics[model] = metrics_for_rows(model_rows)

        if model in failed:
            ineligible[model] = "Failed at least one fold."
            continue
        completed = len({r.fold for r in model_rows})
        if completed < expected_folds:
            ineligible[model] = (
                f"Completed {completed} of {expected_folds} folds."
            )
            continue
        if metrics[model].primary(primary_metric) is None:
            ineligible[model] = f"{primary_metric.upper()} could not be computed."
            continue
        eligible.append(model)

    for model in sorted(failed - set(candidates)):
        metrics.setdefault(model, MetricSet(warnings=("No out-of-fold rows.",)))
        ineligible[model] = "Failed at least one fold."

    if not eligible:
        return SeriesModelPolicy(
            series_id=series_id,
            champion=None,
            challenger=None,
            metrics=metrics,
            eligible=(),
            ineligible=ineligible,
            reason="No candidate completed every fold, so there is no champion.",
        )

    ranked = sorted(eligible, key=lambda m: metrics[m].primary(primary_metric))
    best = ranked[0]
    challenger = ranked[1] if len(ranked) > 1 else None
    reason = (
        f"{best} has the lowest {primary_metric.upper()} "
        f"({metrics[best].primary(primary_metric):.4g}) among "
        f"{len(eligible)} eligible candidates."
    )

    ensemble_weights: dict[str, float] = {}
    if len(eligible) > 1:
        policy = _consider_ensemble(
            rows, eligible, metrics, best, primary_metric
        )
        if policy is not None:
            metrics[ENSEMBLE_ID] = policy[0]
            if policy[1].promoted:
                ensemble_weights = policy[1].weights
                challenger = best
                best = ENSEMBLE_ID
            reason = f"{reason} {policy[1].reason}"

    return SeriesModelPolicy(
        series_id=series_id,
        champion=best,
        challenger=challenger,
        metrics=metrics,
        eligible=tuple(eligible),
        ineligible=ineligible,
        reason=reason,
        ensemble_weights=ensemble_weights,
    )


def _consider_ensemble(
    rows: Sequence[FoldPrediction],
    eligible: Sequence[str],
    metrics: dict[str, MetricSet],
    best: str,
    primary_metric: PrimaryMetric,
):
    predictions, actuals = _aligned_rows(rows, eligible)
    if not predictions or not len(actuals):
        return None

    mases = {
        m: metrics[m].mase
        for m in eligible
        if metrics[m].mase is not None
    }
    fitted = fit_ensemble_weights(predictions, actuals, mases=mases)
    if not fitted.weights:
        return None

    blended = combine(predictions, fitted.weights)
    keyed = sorted({(r.fold, r.horizon_step) for r in rows if r.model == best})
    scale_by_fold = {
        r.fold: r.mase_scale for r in rows if r.model == best
    }
    ensemble_rows = [
        FoldPrediction(
            series_id=rows[0].series_id,
            model=ENSEMBLE_ID,
            fold=fold,
            horizon_step=step,
            actual=float(actuals[i]),
            point=float(blended[i]),
            p10=float(blended[i]),
            p90=float(blended[i]),
            train_end=0,
            mase_scale=scale_by_fold.get(fold, float("nan")),
        )
        for i, (fold, step) in enumerate(keyed[: len(blended)])
    ]
    ensemble_metrics = metrics_for_rows(ensemble_rows)

    # The ensemble blends point forecasts only, so it has no interval of its
    # own. Reuse the champion's coverage rather than invent one, and let the
    # guardrail compare like with like.
    ensemble_metrics = MetricSet(
        mase=ensemble_metrics.mase,
        wape=ensemble_metrics.wape,
        smape=ensemble_metrics.smape,
        rmse=ensemble_metrics.rmse,
        bias_pct=ensemble_metrics.bias_pct,
        coverage_p10_p90=metrics[best].coverage_p10_p90,
        warnings=ensemble_metrics.warnings
        + ("Intervals are inherited from the champion; the blend is point-only.",),
    )

    decision = promote_ensemble(
        best_individual=CandidateMetrics(
            mase=metrics[best].primary(primary_metric) or float("nan"),
            bias_pct=metrics[best].bias_pct or 0.0,
            coverage=metrics[best].coverage_p10_p90 or 0.0,
        ),
        ensemble=CandidateMetrics(
            mase=ensemble_metrics.primary(primary_metric) or float("nan"),
            bias_pct=ensemble_metrics.bias_pct or 0.0,
            coverage=ensemble_metrics.coverage_p10_p90 or 0.0,
        ),
        weights=fitted.weights,
    )
    return ensemble_metrics, decision


def select_policies(
    predictions: Sequence[FoldPrediction],
    failures: Sequence[FoldFailure] = (),
    *,
    expected_folds: int,
    primary_metric: PrimaryMetric = "mase",
) -> ValidationResult:
    """Select one policy per series and summarize the portfolio."""
    series_ids = sorted(
        {r.series_id for r in predictions}
        | {f.series_id for f in failures if f.series_id}
    )

    policies: dict[str, SeriesModelPolicy] = {}
    for series_id in series_ids:
        policies[series_id] = select_series_policy(
            series_id,
            [r for r in predictions if r.series_id == series_id],
            [f for f in failures if f.series_id == series_id],
            expected_folds=expected_folds,
            primary_metric=primary_metric,
        )

    return ValidationResult(
        series_policies=policies,
        portfolio_metrics=_portfolio_metrics(policies, primary_metric),
        primary_metric=primary_metric,
        failures=tuple(failures),
    )


def _portfolio_metrics(
    policies: dict[str, SeriesModelPolicy], primary_metric: PrimaryMetric
) -> MetricSet:
    """Equal-weight mean of each series' champion metrics.

    Equal weight on purpose (design 6.3): weighting by volume would let one
    large series decide the portfolio's headline number.
    """
    champion_metrics = [
        policy.metrics[policy.champion]
        for policy in policies.values()
        if policy.champion and policy.champion in policy.metrics
    ]
    if not champion_metrics:
        return MetricSet(warnings=("No series has an eligible champion.",))

    def _mean(attr: str) -> float | None:
        values = [
            getattr(m, attr) for m in champion_metrics if getattr(m, attr) is not None
        ]
        return float(np.mean(values)) if values else None

    scored = len(champion_metrics)
    total = len(policies)
    warnings: list[str] = []
    if scored < total:
        warnings.append(
            f"{total - scored} of {total} series have no eligible champion and are "
            "excluded from the portfolio score."
        )

    return MetricSet(
        mase=_mean("mase"),
        wape=_mean("wape"),
        smape=_mean("smape"),
        rmse=_mean("rmse"),
        bias_pct=_mean("bias_pct"),
        coverage_p10_p90=_mean("coverage_p10_p90"),
        warnings=tuple(warnings),
    )


__all__ = [
    "ENSEMBLE_ID",
    "MetricSet",
    "PrimaryMetric",
    "SeriesModelPolicy",
    "ValidationResult",
    "interval_coverage",
    "metrics_for_rows",
    "rmse",
    "select_policies",
    "select_series_policy",
    "signed_bias_pct",
    "smape",
    "wape",
]
