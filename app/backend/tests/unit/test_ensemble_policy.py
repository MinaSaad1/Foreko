"""Ensemble weights and promotion guardrails.

Design 6.4 fixes a 2 percent improvement threshold and says the ensemble must
not "materially worsen" bias or coverage without giving a number. Amendment A1
fixes those, so these tests pin all three gates rather than only the one the
original plan covered.
"""

from __future__ import annotations

import numpy as np
import pytest

from tempolith.services.ensemble_policy import (
    MAX_BIAS_INCREASE_PP,
    CandidateMetrics,
    combine,
    fit_ensemble_weights,
    promote_ensemble,
)


def metrics(*, mase: float, bias_pct: float = 0.0, coverage: float = 0.80):
    return CandidateMetrics(mase=mase, bias_pct=bias_pct, coverage=coverage)


@pytest.mark.unit
def test_weights_are_non_negative_and_sum_to_one() -> None:
    actuals = np.arange(1, 21, dtype=float)
    predictions = {
        "a": actuals + 0.5,
        "b": actuals - 2.0,
        "c": actuals * 1.1,
    }
    fitted = fit_ensemble_weights(predictions, actuals)

    assert set(fitted.weights) == {"a", "b", "c"}
    assert all(w >= 0 for w in fitted.weights.values())
    assert sum(fitted.weights.values()) == pytest.approx(1.0)
    assert fitted.fallback_used is False


@pytest.mark.unit
def test_weights_favour_the_more_accurate_candidate() -> None:
    actuals = np.arange(1, 31, dtype=float)
    predictions = {"good": actuals + 0.1, "bad": actuals + 10.0}
    fitted = fit_ensemble_weights(predictions, actuals)
    assert fitted.weights["good"] > fitted.weights["bad"]


@pytest.mark.unit
def test_a_single_candidate_takes_all_the_weight() -> None:
    actuals = np.arange(1, 11, dtype=float)
    fitted = fit_ensemble_weights({"only": actuals}, actuals)
    assert fitted.weights == {"only": 1.0}


@pytest.mark.unit
def test_unusable_rows_fall_back_to_inverse_mase_and_say_so() -> None:
    actuals = np.arange(1, 11, dtype=float)
    predictions = {"a": np.full(10, np.nan), "b": actuals}
    fitted = fit_ensemble_weights(predictions, actuals, mases={"a": 2.0, "b": 1.0})

    # A silent fallback would look like a fitted result.
    assert fitted.fallback_used is True
    assert "inverse-MASE" in fitted.reason
    assert fitted.weights["b"] > fitted.weights["a"]
    assert sum(fitted.weights.values()) == pytest.approx(1.0)


@pytest.mark.unit
def test_combine_blends_by_weight() -> None:
    predictions = {"a": np.array([0.0, 0.0]), "b": np.array([10.0, 20.0])}
    blended = combine(predictions, {"a": 0.25, "b": 0.75})
    assert blended == pytest.approx([7.5, 15.0])


@pytest.mark.unit
def test_ensemble_requires_two_percent_gain_without_bias_regression() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.79, bias_pct=1.1, coverage=0.80),
        weights={"a": 0.5, "b": 0.5},
    )
    assert decision.promoted is False
    assert decision.reason == "Ensemble improvement 1.25% is below the 2.00% threshold."


@pytest.mark.unit
def test_a_clear_gain_with_stable_bias_and_coverage_is_promoted() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.70, bias_pct=1.0, coverage=0.80),
        weights={"a": 0.5, "b": 0.5},
    )
    assert decision.promoted is True
    assert "12.50%" in decision.reason
    assert decision.weights == {"a": 0.5, "b": 0.5}


@pytest.mark.unit
def test_a_sufficient_gain_is_blocked_by_a_bias_regression() -> None:
    # 12.5% better on the primary metric, but bias worsens by 1.0 point. The
    # original plan quantified only the 2% gate, so this case had no test and
    # an implementer would have had to invent the limit.
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.70, bias_pct=2.0, coverage=0.80),
        weights={"a": 0.5, "b": 0.5},
    )
    assert decision.promoted is False
    assert "bias" in decision.reason
    assert f"{MAX_BIAS_INCREASE_PP:.2f} point limit" in decision.reason


@pytest.mark.unit
def test_bias_is_judged_on_magnitude_not_direction() -> None:
    # Swinging from +1.0 to -2.0 is a worse forecast, not a better one.
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.70, bias_pct=-2.0, coverage=0.80),
        weights={"a": 0.5, "b": 0.5},
    )
    assert decision.promoted is False
    assert "bias" in decision.reason


@pytest.mark.unit
def test_a_sufficient_gain_is_blocked_by_coverage_drift() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.80),
        ensemble=metrics(mase=0.70, bias_pct=1.0, coverage=0.60),
        weights={"a": 0.5, "b": 0.5},
    )
    assert decision.promoted is False
    assert "coverage" in decision.reason


@pytest.mark.unit
def test_coverage_moving_toward_target_does_not_block() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80, bias_pct=1.0, coverage=0.60),
        ensemble=metrics(mase=0.70, bias_pct=1.0, coverage=0.79),
        weights={"a": 0.5, "b": 0.5},
    )
    assert decision.promoted is True


@pytest.mark.unit
def test_no_weights_means_no_promotion() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=0.80),
        ensemble=metrics(mase=0.10),
        weights={},
    )
    assert decision.promoted is False


@pytest.mark.unit
def test_an_undefined_primary_metric_blocks_promotion() -> None:
    decision = promote_ensemble(
        best_individual=metrics(mase=float("nan")),
        ensemble=metrics(mase=0.10),
        weights={"a": 1.0},
    )
    assert decision.promoted is False
    assert "undefined" in decision.reason
