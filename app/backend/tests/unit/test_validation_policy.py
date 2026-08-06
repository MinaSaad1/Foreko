"""Per-series eligibility, metrics, and model selection."""

from __future__ import annotations

import numpy as np
import pytest

from tempolith.services.backtest import FoldFailure, FoldPrediction
from tempolith.services.validation_policy import (
    metrics_for_rows,
    select_policies,
    select_series_policy,
    signed_bias_pct,
    wape,
)


def rows(
    series_id: str,
    model: str,
    *,
    folds: int = 2,
    steps: int = 3,
    error: float = 0.0,
    scale: float = 10.0,
    band: float = 50.0,
) -> list[FoldPrediction]:
    out: list[FoldPrediction] = []
    for fold in range(1, folds + 1):
        for step in range(1, steps + 1):
            actual = 100.0 + fold * 10 + step
            point = actual + error
            out.append(
                FoldPrediction(
                    series_id=series_id,
                    model=model,
                    fold=fold,
                    horizon_step=step,
                    actual=actual,
                    point=point,
                    # The band is around the forecast, as a real model emits it.
                    # Centring it on the actual would put the actual inside by
                    # construction and make coverage untestable.
                    p10=point - band,
                    p90=point + band,
                    train_end=12 * fold,
                    mase_scale=scale,
                )
            )
    return out


@pytest.mark.unit
def test_wape_is_none_when_actuals_sum_to_zero() -> None:
    # Zero is a real answer for "no error" and must never stand in for
    # "undefined".
    assert wape(np.zeros(4), np.ones(4)) is None
    assert wape(np.array([2.0, 2.0]), np.array([1.0, 1.0])) == pytest.approx(0.5)


@pytest.mark.unit
def test_signed_bias_keeps_its_direction() -> None:
    actual = np.array([100.0, 100.0])
    assert signed_bias_pct(actual, np.array([110.0, 110.0])) == pytest.approx(10.0)
    assert signed_bias_pct(actual, np.array([90.0, 90.0])) == pytest.approx(-10.0)


@pytest.mark.unit
def test_metrics_report_coverage_and_flag_an_unusable_mase_scale() -> None:
    clean = metrics_for_rows(rows("egypt", "a", error=1.0))
    assert clean.mase == pytest.approx(0.1)
    assert clean.coverage_p10_p90 == pytest.approx(1.0)
    assert clean.warnings == ()

    flat = metrics_for_rows(rows("egypt", "a", error=1.0, scale=float("nan")))
    assert flat.mase is None
    assert any("MASE scale" in w for w in flat.warnings)


@pytest.mark.unit
def test_coverage_counts_actuals_outside_a_real_band() -> None:
    missed = metrics_for_rows(rows("egypt", "a", error=100.0, band=1.0))
    # A real band that the actuals fall outside is genuinely 0% coverage.
    assert missed.coverage_p10_p90 == pytest.approx(0.0)


@pytest.mark.unit
def test_a_zero_width_band_has_undefined_coverage_not_zero() -> None:
    # A model whose residuals collapse emits p10 == p90. Every actual then falls
    # outside a zero-width band, which computes to 0% and reads as
    # catastrophically miscalibrated, when the model in fact expressed no
    # uncertainty at all.
    degenerate = metrics_for_rows(rows("egypt", "a", error=5.0, band=0.0))
    assert degenerate.coverage_p10_p90 is None
    assert any("no interval" in w for w in degenerate.warnings)


@pytest.mark.unit
def test_each_series_selects_its_own_policy() -> None:
    predictions = [
        *rows("egypt", "timesfm", error=1.0),
        *rows("egypt", "lightgbm", error=5.0),
        *rows("uae", "timesfm", error=5.0),
        *rows("uae", "lightgbm", error=1.0),
    ]
    result = select_policies(predictions, expected_folds=2)

    # Selection is per series, so a model that loses on one can win on another.
    assert result.series_policies["egypt"].champion == "timesfm"
    assert result.series_policies["uae"].champion == "lightgbm"


@pytest.mark.unit
def test_a_model_failing_one_fold_is_ineligible_for_that_series_only() -> None:
    predictions = [
        *rows("egypt", "timesfm", error=5.0),
        *rows("egypt", "lightgbm", folds=1, error=1.0),
        *rows("uae", "lightgbm", error=1.0),
        *rows("uae", "timesfm", error=5.0),
    ]
    failures = [
        FoldFailure(model="lightgbm", fold=2, reason="boom", series_id="egypt")
    ]
    result = select_policies(predictions, failures, expected_folds=2)

    egypt = result.series_policies["egypt"]
    # lightgbm has the lower error on its surviving fold, but that fold is a
    # biased sample, so it cannot win.
    assert egypt.champion == "timesfm"
    assert "lightgbm" in egypt.ineligible
    assert egypt.ineligible["lightgbm"] == "Failed at least one fold."

    # It remains eligible where it did complete every fold.
    assert result.series_policies["uae"].champion == "lightgbm"


@pytest.mark.unit
def test_a_partial_candidate_without_a_failure_row_is_still_ineligible() -> None:
    predictions = [
        *rows("egypt", "timesfm", error=5.0),
        *rows("egypt", "lightgbm", folds=1, error=1.0),
    ]
    result = select_series_policy("egypt", predictions, [], expected_folds=2)
    assert result.champion == "timesfm"
    assert "1 of 2 folds" in result.ineligible["lightgbm"]


@pytest.mark.unit
def test_a_series_with_no_eligible_candidate_has_no_champion() -> None:
    predictions = rows("egypt", "timesfm", folds=1, error=1.0)
    failures = [
        FoldFailure(model="timesfm", fold=2, reason="boom", series_id="egypt")
    ]
    policy = select_series_policy("egypt", predictions, failures, expected_folds=2)

    assert policy.champion is None
    assert "no champion" in policy.reason


@pytest.mark.unit
def test_portfolio_score_weights_every_series_equally() -> None:
    # A high-volume series must not decide the portfolio's headline number.
    predictions = [
        *rows("small", "timesfm", error=1.0, scale=10.0),
        *rows("huge", "timesfm", error=4.0, scale=10.0),
    ]
    result = select_policies(predictions, expected_folds=2)
    assert result.portfolio_metrics.mase == pytest.approx((0.1 + 0.4) / 2)


@pytest.mark.unit
def test_portfolio_states_how_many_series_it_could_not_score() -> None:
    predictions = [
        *rows("ok", "timesfm", error=1.0),
        *rows("broken", "timesfm", folds=1, error=1.0),
    ]
    failures = [
        FoldFailure(model="timesfm", fold=2, reason="boom", series_id="broken")
    ]
    result = select_policies(predictions, failures, expected_folds=2)

    assert result.series_policies["broken"].champion is None
    assert any(
        "1 of 2 series have no eligible champion" in w
        for w in result.portfolio_metrics.warnings
    )


@pytest.mark.unit
def test_selection_reason_names_the_metric_and_the_field() -> None:
    predictions = [
        *rows("egypt", "timesfm", error=1.0),
        *rows("egypt", "lightgbm", error=5.0),
    ]
    policy = select_series_policy("egypt", predictions, [], expected_folds=2)
    assert "MASE" in policy.reason
    assert policy.challenger in ("lightgbm", "timesfm")


@pytest.mark.unit
def test_an_identical_ensemble_is_not_promoted() -> None:
    # Two candidates with the same predictions cannot beat either by 2 percent,
    # so the single explainable model must stand.
    predictions = [
        *rows("egypt", "timesfm", error=2.0),
        *rows("egypt", "lightgbm", error=2.0),
    ]
    policy = select_series_policy("egypt", predictions, [], expected_folds=2)
    assert policy.champion in ("timesfm", "lightgbm")
    assert policy.ensemble_weights == {}
    assert "below the 2.00% threshold" in policy.reason


@pytest.mark.unit
def test_an_ensemble_that_clears_every_guardrail_is_promoted() -> None:
    # Symmetric errors either side of the actual: the blend cancels them and
    # beats both by far more than 2 percent.
    predictions = [
        *rows("egypt", "timesfm", error=6.0),
        *rows("egypt", "lightgbm", error=-6.0),
    ]
    policy = select_series_policy("egypt", predictions, [], expected_folds=2)

    assert policy.champion == "ensemble"
    assert policy.challenger in ("timesfm", "lightgbm")
    assert sum(policy.ensemble_weights.values()) == pytest.approx(1.0)
    assert policy.metrics["ensemble"].mase < policy.metrics["timesfm"].mase


@pytest.mark.unit
def test_primary_metric_can_be_wape() -> None:
    predictions = [
        *rows("egypt", "timesfm", error=1.0),
        *rows("egypt", "lightgbm", error=5.0),
    ]
    policy = select_series_policy(
        "egypt", predictions, [], expected_folds=2, primary_metric="wape"
    )
    assert policy.champion == "timesfm"
    assert "WAPE" in policy.reason
