"""Known-future factor plans.

A covariate the model needs for a future period is a business assumption, not a
number to guess. The rule this module enforces (design 6.5, 10.3): a missing
required future value blocks the forecast and names every covariate and period
that needs input. Extending the last known value is allowed only when the user
explicitly asked for that fill policy, and the fill is then recorded in the run
manifest so the assumption is visible rather than implied.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import pandas as pd

from ..schemas.project import CovariateRole


FillPolicy = Literal["none", "forward_fill", "zero"]

# Roles whose values must exist for every future period before a forecast runs.
REQUIRED_FUTURE_ROLES: frozenset[str] = frozenset(
    {"known_future_numerical", "known_future_categorical", "scenario_controlled"}
)

# Roles the project computes itself, so the user never enters them.
GENERATED_ROLES: frozenset[str] = frozenset({"calendar_generated"})


class FactorPlanError(ValueError):
    """A factor plan cannot be used as given."""


@dataclass(frozen=True)
class MissingValue:
    covariate: str
    period: str

    def as_dict(self) -> dict[str, str]:
        return {"covariate": self.covariate, "period": self.period}


@dataclass(frozen=True)
class AppliedFill:
    covariate: str
    policy: FillPolicy
    periods: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "covariate": self.covariate,
            "policy": self.policy,
            "periods": list(self.periods),
        }


@dataclass(frozen=True)
class FactorPlanValidation:
    valid: bool
    missing: list[dict[str, str]] = field(default_factory=list)
    required: tuple[str, ...] = ()

    @property
    def message(self) -> str:
        if self.valid:
            return "Every required future factor has a value."
        names = sorted({m["covariate"] for m in self.missing})
        return (
            f"{len(self.missing)} future values are missing for "
            f"{', '.join(names)}. Enter them, or choose a fill policy for each."
        )


@dataclass(frozen=True)
class MaterializedPlan:
    values: dict[str, dict[str, Any]]
    applied_fills: list[dict[str, Any]] = field(default_factory=list)


def required_covariates(roles: Mapping[str, CovariateRole]) -> tuple[str, ...]:
    return tuple(
        sorted(name for name, role in roles.items() if role in REQUIRED_FUTURE_ROLES)
    )


def validate_factor_plan(
    *,
    roles: Mapping[str, CovariateRole],
    periods: Sequence[str],
    values: Mapping[str, Mapping[str, Any]],
    fill_policies: Mapping[str, FillPolicy] | None = None,
) -> FactorPlanValidation:
    """Check that every required future factor has a value for every period.

    A covariate with an explicit fill policy is not missing: the user has said
    what should happen. A covariate without one is blocking.
    """
    policies = dict(fill_policies or {})
    required = required_covariates(roles)

    missing: list[dict[str, str]] = []
    for covariate in required:
        if policies.get(covariate, "none") != "none":
            continue
        supplied = values.get(covariate, {})
        for period in periods:
            value = supplied.get(period)
            if value is None or (isinstance(value, float) and pd.isna(value)):
                missing.append(MissingValue(covariate, period).as_dict())

    return FactorPlanValidation(
        valid=not missing, missing=missing, required=required
    )


def materialize_factor_plan(
    *,
    roles: Mapping[str, CovariateRole],
    periods: Sequence[str],
    values: Mapping[str, Mapping[str, Any]],
    fill_policies: Mapping[str, FillPolicy] | None = None,
    history_last: Mapping[str, Any] | None = None,
) -> MaterializedPlan:
    """Produce the complete future factor table, recording every filled value.

    Raises FactorPlanError when a required value is missing and no fill policy
    covers it, rather than inventing one.
    """
    policies = dict(fill_policies or {})
    last_known = dict(history_last or {})

    validation = validate_factor_plan(
        roles=roles, periods=periods, values=values, fill_policies=policies
    )
    if not validation.valid:
        raise FactorPlanError(validation.message)

    resolved: dict[str, dict[str, Any]] = {}
    applied: list[dict[str, Any]] = []

    for covariate in required_covariates(roles):
        supplied = dict(values.get(covariate, {}))
        policy = policies.get(covariate, "none")
        filled_periods: list[str] = []

        previous = last_known.get(covariate)
        for period in periods:
            value = supplied.get(period)
            if value is not None and not (isinstance(value, float) and pd.isna(value)):
                previous = value
                continue

            if policy == "forward_fill":
                if previous is None:
                    raise FactorPlanError(
                        f"{covariate} has no earlier value to carry forward into "
                        f"{period}. Enter a value for it."
                    )
                supplied[period] = previous
            elif policy == "zero":
                supplied[period] = 0
            else:  # pragma: no cover - validate_factor_plan rejects this first
                raise FactorPlanError(
                    f"{covariate} is missing a value for {period}."
                )
            filled_periods.append(period)

        resolved[covariate] = supplied
        if filled_periods:
            applied.append(
                AppliedFill(
                    covariate=covariate,
                    policy=policy,
                    periods=tuple(filled_periods),
                ).as_dict()
            )

    return MaterializedPlan(values=resolved, applied_fills=applied)


def generate_calendar_factors(
    periods: Sequence[str],
    *,
    holidays: Sequence[str] = (),
) -> dict[str, dict[str, Any]]:
    """Deterministic calendar features for each future period.

    Derived from the dates alone. Tempolith does not download holiday data in
    V2.0, so holidays are the user's own list (design 6.5).
    """
    holiday_set = {str(h) for h in holidays}
    month: dict[str, Any] = {}
    quarter: dict[str, Any] = {}
    day_of_week: dict[str, Any] = {}
    weekend: dict[str, Any] = {}
    holiday_flag: dict[str, Any] = {}

    for period in periods:
        stamp = pd.Timestamp(period)
        month[period] = int(stamp.month)
        quarter[period] = int(stamp.quarter)
        day_of_week[period] = int(stamp.dayofweek)
        weekend[period] = int(stamp.dayofweek >= 5)
        holiday_flag[period] = int(period in holiday_set)

    factors = {
        "calendar_month": month,
        "calendar_quarter": quarter,
        "calendar_day_of_week": day_of_week,
        "calendar_weekend": weekend,
    }
    if holiday_set:
        factors["calendar_holiday"] = holiday_flag
    return factors


def copy_for_scenario(
    baseline: Mapping[str, Mapping[str, Any]],
    edits: Mapping[str, Mapping[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Baseline plan with scenario edits layered on top.

    A copy, so editing a scenario cannot change the baseline it is compared
    against (design 7.3).
    """
    merged = {name: dict(periods) for name, periods in baseline.items()}
    for name, periods in edits.items():
        merged.setdefault(name, {}).update(periods)
    return merged


__all__ = [
    "GENERATED_ROLES",
    "REQUIRED_FUTURE_ROLES",
    "AppliedFill",
    "FactorPlanError",
    "FactorPlanValidation",
    "FillPolicy",
    "MaterializedPlan",
    "MissingValue",
    "copy_for_scenario",
    "generate_calendar_factors",
    "materialize_factor_plan",
    "required_covariates",
    "validate_factor_plan",
]
