"""Out-of-fold ensemble weights and promotion guardrails.

V2 only. ``services.ensembles`` is the V1 inverse-MAPE path behind
``POST /api/ensemble/combine``; the two answer different questions and are
deliberately not merged. This one learns weights from out-of-fold predictions
and refuses to promote unless the ensemble clears every guardrail.

An ensemble that wins by a hair is not worth the loss of a single, explainable
model, so the bar is deliberately not "lower error".
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import nnls


# Fixed in V2.0 to avoid configuration overload (design 6.4).
MIN_IMPROVEMENT_PCT = 2.0
# Design 6.4 says "does not materially worsen" without a number. Amendment A1
# fixes these, because an implementer would otherwise invent them.
MAX_BIAS_INCREASE_PP = 0.5
MAX_COVERAGE_DRIFT_PP = 5.0
TARGET_COVERAGE = 0.80


@dataclass(frozen=True)
class CandidateMetrics:
    """The three numbers a promotion decision reads."""

    mase: float
    bias_pct: float
    coverage: float


@dataclass(frozen=True)
class EnsembleWeights:
    weights: dict[str, float]
    fallback_used: bool = False
    reason: str = ""


@dataclass(frozen=True)
class PromotionDecision:
    promoted: bool
    reason: str
    weights: dict[str, float] = field(default_factory=dict)


def fit_ensemble_weights(
    oof_predictions: dict[str, np.ndarray],
    actuals: np.ndarray,
    *,
    mases: dict[str, float] | None = None,
) -> EnsembleWeights:
    """Fit non-negative weights that sum to one, from out-of-fold rows only.

    Weights learned on in-sample fits would be optimistic, which is the whole
    reason this takes out-of-fold predictions.

    Falls back to normalized inverse-MASE when NNLS fails or degenerates, and
    says so, because a silent fallback would look like a fitted result.
    """
    models = sorted(oof_predictions)
    if not models:
        return EnsembleWeights(weights={}, fallback_used=False, reason="No candidates.")
    if len(models) == 1:
        return EnsembleWeights(weights={models[0]: 1.0})

    matrix = np.column_stack([np.asarray(oof_predictions[m], dtype=float) for m in models])
    target = np.asarray(actuals, dtype=float)

    if matrix.shape[0] != target.shape[0] or not np.isfinite(matrix).all():
        return _inverse_mase_weights(models, mases, "Out-of-fold rows were unusable.")

    try:
        solution, _residual = nnls(matrix, target)
    except Exception as exc:  # pragma: no cover - scipy rarely raises here
        return _inverse_mase_weights(models, mases, f"NNLS failed: {exc}")

    total = float(solution.sum())
    if not np.isfinite(total) or total <= 1e-9:
        return _inverse_mase_weights(
            models, mases, "NNLS weights summed to zero."
        )

    return EnsembleWeights(
        weights={m: float(w / total) for m, w in zip(models, solution)}
    )


def _inverse_mase_weights(
    models: list[str], mases: dict[str, float] | None, reason: str
) -> EnsembleWeights:
    if not mases:
        equal = 1.0 / len(models)
        return EnsembleWeights(
            weights={m: equal for m in models},
            fallback_used=True,
            reason=f"{reason} Fell back to equal weights.",
        )
    inverse = {
        m: 1.0 / mases[m]
        for m in models
        if m in mases and np.isfinite(mases[m]) and mases[m] > 1e-9
    }
    if not inverse:
        equal = 1.0 / len(models)
        return EnsembleWeights(
            weights={m: equal for m in models},
            fallback_used=True,
            reason=f"{reason} Fell back to equal weights.",
        )
    total = sum(inverse.values())
    return EnsembleWeights(
        weights={m: w / total for m, w in inverse.items()},
        fallback_used=True,
        reason=f"{reason} Fell back to inverse-MASE weights.",
    )


def combine(
    oof_predictions: dict[str, np.ndarray], weights: dict[str, float]
) -> np.ndarray:
    """Weighted blend of candidate predictions."""
    models = [m for m in sorted(weights) if m in oof_predictions]
    if not models:
        return np.asarray([], dtype=float)
    stacked = np.column_stack(
        [np.asarray(oof_predictions[m], dtype=float) for m in models]
    )
    vector = np.asarray([weights[m] for m in models], dtype=float)
    return stacked @ vector


def promote_ensemble(
    *,
    best_individual: CandidateMetrics,
    ensemble: CandidateMetrics,
    weights: dict[str, float],
) -> PromotionDecision:
    """Decide whether the ensemble replaces the best individual model.

    All three guardrails must hold. Metrics must come from identical out-of-fold
    rows, or this is comparing different questions.
    """
    if not weights:
        return PromotionDecision(False, "No ensemble weights were fitted.")

    if not np.isfinite(best_individual.mase) or not np.isfinite(ensemble.mase):
        return PromotionDecision(
            False, "The primary metric is undefined for one of the candidates."
        )
    if best_individual.mase <= 1e-12:
        return PromotionDecision(
            False, "The best individual model has no measurable error to improve on."
        )

    improvement = (
        (best_individual.mase - ensemble.mase) / best_individual.mase
    ) * 100.0
    if improvement < MIN_IMPROVEMENT_PCT:
        return PromotionDecision(
            False,
            f"Ensemble improvement {improvement:.2f}% is below the "
            f"{MIN_IMPROVEMENT_PCT:.2f}% threshold.",
        )

    bias_increase = abs(ensemble.bias_pct) - abs(best_individual.bias_pct)
    if bias_increase > MAX_BIAS_INCREASE_PP:
        return PromotionDecision(
            False,
            f"Ensemble improves the primary metric by {improvement:.2f}% but "
            f"worsens signed bias by {bias_increase:.2f} points, beyond the "
            f"{MAX_BIAS_INCREASE_PP:.2f} point limit.",
        )

    drift = abs(ensemble.coverage - TARGET_COVERAGE) - abs(
        best_individual.coverage - TARGET_COVERAGE
    )
    if drift * 100.0 > MAX_COVERAGE_DRIFT_PP:
        return PromotionDecision(
            False,
            f"Ensemble improves the primary metric by {improvement:.2f}% but "
            f"moves P10 to P90 coverage {drift * 100:.2f} points further from "
            f"{TARGET_COVERAGE:.0%}, beyond the {MAX_COVERAGE_DRIFT_PP:.2f} "
            "point limit.",
        )

    return PromotionDecision(
        True,
        f"Ensemble improves the primary metric by {improvement:.2f}% without "
        "worsening bias or coverage beyond their limits.",
        weights=weights,
    )


__all__ = [
    "MAX_BIAS_INCREASE_PP",
    "MAX_COVERAGE_DRIFT_PP",
    "MIN_IMPROVEMENT_PCT",
    "TARGET_COVERAGE",
    "CandidateMetrics",
    "EnsembleWeights",
    "PromotionDecision",
    "combine",
    "fit_ensemble_weights",
    "promote_ensemble",
]
