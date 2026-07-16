"""Known-future factor plans must never be fabricated.

The rule under test: a missing required future value blocks the forecast and
names what is missing. A value is only ever filled when the user explicitly
asked for that policy, and the fill is recorded so the assumption stays visible.
"""

from __future__ import annotations

import pytest

from foreko.services.factor_plan import (
    FactorPlanError,
    copy_for_scenario,
    generate_calendar_factors,
    materialize_factor_plan,
    required_covariates,
    validate_factor_plan,
)


PERIODS = ["2026-08-01", "2026-09-01"]


@pytest.mark.unit
def test_missing_known_future_values_block_forecast() -> None:
    result = validate_factor_plan(
        roles={"price": "known_future_numerical"},
        periods=PERIODS,
        values={"price": {"2026-08-01": 12.5}},
        fill_policies={},
    )
    assert result.valid is False
    assert result.missing == [{"covariate": "price", "period": "2026-09-01"}]
    assert "price" in result.message


@pytest.mark.unit
def test_a_complete_plan_is_valid() -> None:
    result = validate_factor_plan(
        roles={"price": "known_future_numerical"},
        periods=PERIODS,
        values={"price": {"2026-08-01": 12.5, "2026-09-01": 13.0}},
    )
    assert result.valid is True
    assert result.missing == []


@pytest.mark.unit
def test_only_future_roles_are_required() -> None:
    roles = {
        "price": "known_future_numerical",
        "promo": "scenario_controlled",
        "temperature": "historical_only",
        "month": "calendar_generated",
        "store_size": "static_numerical",
    }
    # Historical, generated, and static covariates are not the user's to enter.
    assert required_covariates(roles) == ("price", "promo")


@pytest.mark.unit
def test_explicit_forward_fill_records_affected_periods() -> None:
    result = materialize_factor_plan(
        roles={"price": "known_future_numerical"},
        periods=PERIODS,
        values={"price": {"2026-08-01": 12.5}},
        fill_policies={"price": "forward_fill"},
    )
    assert result.values["price"]["2026-09-01"] == 12.5
    assert result.applied_fills == [
        {"covariate": "price", "policy": "forward_fill", "periods": ["2026-09-01"]}
    ]


@pytest.mark.unit
def test_forward_fill_can_carry_the_last_history_value() -> None:
    result = materialize_factor_plan(
        roles={"price": "known_future_numerical"},
        periods=PERIODS,
        values={},
        fill_policies={"price": "forward_fill"},
        history_last={"price": 9.75},
    )
    assert result.values["price"] == {"2026-08-01": 9.75, "2026-09-01": 9.75}
    assert result.applied_fills[0]["periods"] == PERIODS


@pytest.mark.unit
def test_forward_fill_with_nothing_to_carry_is_refused() -> None:
    with pytest.raises(FactorPlanError) as exc:
        materialize_factor_plan(
            roles={"price": "known_future_numerical"},
            periods=PERIODS,
            values={},
            fill_policies={"price": "forward_fill"},
        )
    assert "no earlier value" in str(exc.value)


@pytest.mark.unit
def test_zero_fill_is_recorded_like_any_other_assumption() -> None:
    result = materialize_factor_plan(
        roles={"promo": "scenario_controlled"},
        periods=PERIODS,
        values={"promo": {"2026-08-01": 1}},
        fill_policies={"promo": "zero"},
    )
    assert result.values["promo"] == {"2026-08-01": 1, "2026-09-01": 0}
    assert result.applied_fills[0]["policy"] == "zero"


@pytest.mark.unit
def test_materialize_refuses_rather_than_inventing_a_value() -> None:
    # No fill policy means the user has not said what should happen, so there is
    # no honest number to use.
    with pytest.raises(FactorPlanError) as exc:
        materialize_factor_plan(
            roles={"price": "known_future_numerical"},
            periods=PERIODS,
            values={"price": {"2026-08-01": 12.5}},
            fill_policies={},
        )
    assert "missing" in str(exc.value)


@pytest.mark.unit
def test_a_supplied_value_is_never_overwritten_by_a_fill() -> None:
    result = materialize_factor_plan(
        roles={"price": "known_future_numerical"},
        periods=PERIODS,
        values={"price": {"2026-08-01": 12.5, "2026-09-01": 20.0}},
        fill_policies={"price": "forward_fill"},
    )
    assert result.values["price"]["2026-09-01"] == 20.0
    assert result.applied_fills == []


@pytest.mark.unit
def test_calendar_factors_are_deterministic_from_the_dates() -> None:
    factors = generate_calendar_factors(["2026-08-01", "2026-09-01"])
    assert factors["calendar_month"] == {"2026-08-01": 8, "2026-09-01": 9}
    assert factors["calendar_quarter"] == {"2026-08-01": 3, "2026-09-01": 3}
    # 2026-08-01 is a Saturday.
    assert factors["calendar_weekend"]["2026-08-01"] == 1
    assert "calendar_holiday" not in factors


@pytest.mark.unit
def test_user_supplied_holidays_become_a_flag() -> None:
    factors = generate_calendar_factors(PERIODS, holidays=["2026-09-01"])
    assert factors["calendar_holiday"] == {"2026-08-01": 0, "2026-09-01": 1}


@pytest.mark.unit
def test_a_scenario_copies_the_baseline_and_cannot_mutate_it() -> None:
    baseline = {"price": {"2026-08-01": 10.0, "2026-09-01": 10.0}}
    scenario = copy_for_scenario(baseline, {"price": {"2026-09-01": 12.0}})

    assert scenario["price"] == {"2026-08-01": 10.0, "2026-09-01": 12.0}
    # Editing a scenario must not disturb the baseline it is compared against.
    assert baseline["price"]["2026-09-01"] == 10.0
