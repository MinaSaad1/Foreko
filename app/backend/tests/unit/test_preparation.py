"""Tests for preparation recipes.

Two properties carry the whole design: a recipe that cannot return forecasts to
the original scale is refused rather than warned about, and the source data is
never modified.
"""

from __future__ import annotations

import numpy as np
import pytest

from foreko.schemas.project import PreparationStep
from foreko.services.preparation import (
    PreparationError,
    prepare_series,
    validate_recipe_order,
    validate_step,
)


def monthly() -> np.ndarray:
    rng = np.random.default_rng(7)
    trend = np.linspace(100, 160, 48)
    season = 10 * np.sin(np.arange(48) * 2 * np.pi / 12)
    return trend + season + rng.normal(0, 1.5, 48)


def step(kind: str, **kwargs) -> PreparationStep:
    return PreparationStep(kind=kind, **kwargs)


@pytest.mark.unit
@pytest.mark.parametrize(
    ("kind", "period"),
    [("log", None), ("box_cox", None), ("diff", 1), ("seasonal_diff", 12)],
)
def test_recipe_roundtrip_preserves_original_scale(kind: str, period: int | None) -> None:
    values = monthly()
    prepared = prepare_series(values, [step(kind, period=period)])
    restored = prepared.inverse(
        prepared.values, context=values[: prepared.history_offset]
    )
    expected = values[prepared.history_offset :]
    assert np.allclose(restored, expected, atol=1e-3)


@pytest.mark.unit
def test_chained_log_then_diff_roundtrips() -> None:
    # The chained case is the one that catches refitting: pushing the context
    # through log with forward() would recompute its shift on a one-element
    # slice and invert with the wrong parameter.
    values = monthly()
    prepared = prepare_series(values, [step("log"), step("diff", period=1)])

    assert prepared.history_offset == 1
    restored = prepared.inverse(prepared.values, context=values[:1])
    assert np.allclose(restored, values[1:], atol=1e-3)


@pytest.mark.unit
def test_chained_box_cox_then_seasonal_diff_roundtrips() -> None:
    values = monthly()
    prepared = prepare_series(
        values, [step("box_cox"), step("seasonal_diff", period=12)]
    )
    assert prepared.history_offset == 12
    restored = prepared.inverse(prepared.values, context=values[:12])
    assert np.allclose(restored, values[12:], atol=1e-3)


@pytest.mark.unit
def test_prepare_does_not_modify_the_input_array() -> None:
    values = monthly()
    before = values.copy()
    prepare_series(values, [step("log"), step("diff", period=1)])
    # The source is immutable. Preparation derives; it never edits in place.
    assert np.array_equal(values, before)


@pytest.mark.unit
def test_log_refuses_non_positive_values_naming_the_reason() -> None:
    values = np.array([5.0, -2.0, 3.0, 4.0])
    with pytest.raises(PreparationError) as exc:
        prepare_series(values, [step("log")])
    message = str(exc.value)
    # The V1 transformer silently shifts the series to make log work, which
    # quietly changes what the user asked for.
    assert "log" in message
    assert "above zero" in message


@pytest.mark.unit
def test_box_cox_refuses_a_constant_series() -> None:
    with pytest.raises(PreparationError) as exc:
        prepare_series(np.full(24, 5.0), [step("box_cox")])
    assert "vary" in str(exc.value)


@pytest.mark.unit
def test_seasonal_diff_names_the_period_it_needs() -> None:
    with pytest.raises(PreparationError) as exc:
        prepare_series(np.arange(6, dtype=float) + 1, [step("seasonal_diff", period=12)])
    message = str(exc.value)
    assert "12" in message and "6" in message


@pytest.mark.unit
def test_winsorize_clips_and_reports_what_it_changed() -> None:
    values = np.concatenate([np.full(20, 10.0), np.array([500.0])])
    prepared = prepare_series(
        values, [step("winsorize", lower_quantile=0.05, upper_quantile=0.95)]
    )
    assert prepared.values.max() < 500.0
    assert any("Winsorized" in note for note in prepared.notes)


@pytest.mark.unit
def test_winsorize_requires_a_sane_quantile_range() -> None:
    with pytest.raises(PreparationError):
        validate_step(
            step("winsorize", lower_quantile=0.9, upper_quantile=0.1), monthly()
        )


@pytest.mark.unit
@pytest.mark.parametrize("method", ["forward_fill", "linear", "median", "seasonal"])
def test_impute_fills_every_gap(method: str) -> None:
    values = monthly()
    values[5] = np.nan
    values[17] = np.nan
    prepared = prepare_series(values, [step("impute", method=method, period=12)])
    assert not np.isnan(prepared.values).any()
    assert any("Imputed" in note for note in prepared.notes)


@pytest.mark.unit
def test_impute_rejects_an_unknown_method() -> None:
    with pytest.raises(PreparationError) as exc:
        prepare_series(monthly(), [step("impute", method="vibes")])
    assert "vibes" in str(exc.value)


@pytest.mark.unit
def test_cleaning_after_a_transform_is_rejected() -> None:
    with pytest.raises(PreparationError) as exc:
        validate_recipe_order(
            [step("log"), step("winsorize", lower_quantile=0.1, upper_quantile=0.9)]
        )
    assert "before" in str(exc.value)


@pytest.mark.unit
def test_cleaning_then_transform_is_allowed_and_roundtrips_against_cleaned_data() -> None:
    values = np.concatenate([np.full(20, 10.0), np.array([500.0])])
    prepared = prepare_series(
        values,
        [step("winsorize", lower_quantile=0.05, upper_quantile=0.95), step("log")],
    )
    # Round-trip is proven against the cleaned series, not the raw one. Checking
    # against the raw values would report every winsorize as non-invertible.
    restored = prepared.inverse(prepared.values, context=np.array([]))
    assert restored.max() < 500.0
    assert np.allclose(restored[:20], 10.0, atol=1e-3)


@pytest.mark.unit
def test_empty_recipe_passes_values_through() -> None:
    values = monthly()
    prepared = prepare_series(values, [])
    assert np.array_equal(prepared.values, values)
    assert prepared.history_offset == 0
