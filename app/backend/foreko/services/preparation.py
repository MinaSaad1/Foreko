"""Preparation recipes: validate, execute, and invert.

A recipe is an ordered list of steps applied to a series before it is modelled.
Two rules make it safe to forecast from:

1. The source is never modified. Preparation produces a derived artifact keyed
   by source fingerprint plus recipe hash.
2. A recipe that cannot return forecast values to the original scale within
   tolerance cannot be used. Non-invertible is a refusal, not a warning.

Steps split into two kinds. Cleaning steps (aggregate duplicates, insert missing
periods, impute, winsorize) reshape history and need no inverse, because they do
not change the scale a forecast comes back to. Value transforms (log, box_cox,
diff, seasonal_diff) do change the scale and must invert exactly.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ..schemas.project import PreparationStep
from .transformations import TransformError, Transformer


ROUNDTRIP_TOLERANCE = 1e-3

CLEANING_KINDS = frozenset(
    {"aggregate_duplicates", "insert_missing_periods", "impute", "winsorize"}
)
VALUE_KINDS = frozenset({"log", "box_cox", "diff", "seasonal_diff"})

IMPUTE_METHODS = frozenset({"forward_fill", "linear", "seasonal", "median"})
AGGREGATE_METHODS = frozenset({"sum", "mean", "median", "min", "max", "last"})


class PreparationError(ValueError):
    """A recipe cannot be applied. The message names the step and the reason."""


@dataclass
class PreparedSeries:
    """A transformed series plus everything needed to undo the transform."""

    values: np.ndarray
    dates: pd.DatetimeIndex | None
    history_offset: int
    transformers: list[Transformer] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def inverse(self, values: np.ndarray, context: np.ndarray) -> np.ndarray:
        """Return *values* to the original scale.

        ``context`` is the original-scale history immediately preceding
        ``values``: the whole history when inverting a forecast, or the rows the
        recipe consumed when round-tripping training data.

        Transforms undo in reverse order. Each inverse needs its own context in
        its own scale, so the context is pushed forward through the earlier
        transforms before the later ones are undone.
        """
        if not self.transformers:
            return np.asarray(values, dtype=float)

        # Context as each transform saw it: contexts[i] is the input scale of
        # transformer i. Pushed forward with apply_fitted, never forward, so the
        # fitted Box-Cox lambda and log shift are reused rather than refitted on
        # this slice.
        contexts: list[np.ndarray] = []
        current = np.asarray(context, dtype=float)
        for transformer in self.transformers:
            contexts.append(current)
            if len(current):
                try:
                    current = transformer.apply_fitted(current.copy())
                except TransformError:
                    # A context too short for this transform cannot anchor it;
                    # the inverse below will surface a precise error.
                    current = np.asarray([], dtype=float)

        out = np.asarray(values, dtype=float)
        for transformer, ctx in zip(
            reversed(self.transformers), reversed(contexts)
        ):
            out = transformer.inverse(out, context=ctx)
        return out

    def roundtrip_error(self, chain_input: np.ndarray) -> float:
        """Max absolute error of inverting this series back to *chain_input*.

        ``chain_input`` is the series as the value transforms received it, after
        cleaning. Comparing against the pre-cleaning values instead would report
        every winsorize or impute as a round-trip failure, when what must invert
        is the scale change, not the cleaning.
        """
        restored = self.inverse(self.values, context=chain_input[: self.history_offset])
        expected = chain_input[self.history_offset :]
        if len(restored) != len(expected):
            return float("inf")
        if not np.isfinite(restored).all():
            return float("inf")
        return float(np.max(np.abs(restored - expected))) if len(expected) else 0.0


def validate_step(step: PreparationStep, values: np.ndarray) -> None:
    """Raise PreparationError when *step* cannot apply to *values*.

    Checked before anything runs, so a bad recipe fails naming the transform and
    the requirement rather than producing quiet nonsense.
    """
    if step.kind == "log":
        if (values <= 0).any():
            count = int((values <= 0).sum())
            raise PreparationError(
                f"log needs every value above zero, but {count} "
                f"{'value is' if count == 1 else 'values are'} zero or negative. "
                "Use Box-Cox, or treat the outliers first."
            )
    elif step.kind == "box_cox":
        if (values <= 0).any():
            count = int((values <= 0).sum())
            raise PreparationError(
                f"Box-Cox needs every value above zero, but {count} "
                f"{'value is' if count == 1 else 'values are'} zero or negative."
            )
        if np.allclose(values, values[0]):
            raise PreparationError(
                "Box-Cox needs the series to vary; every value is the same."
            )
    elif step.kind == "diff":
        if len(values) < 2:
            raise PreparationError("Differencing needs at least 2 points.")
    elif step.kind == "seasonal_diff":
        period = step.period or 1
        if len(values) <= period:
            raise PreparationError(
                f"Seasonal differencing at period {period} needs more than "
                f"{period} points, but the series has {len(values)}."
            )
    elif step.kind == "impute":
        if step.method not in IMPUTE_METHODS:
            raise PreparationError(
                f"Unknown imputation method {step.method!r}. "
                f"Use one of: {', '.join(sorted(IMPUTE_METHODS))}."
            )
    elif step.kind == "aggregate_duplicates":
        if step.method not in AGGREGATE_METHODS:
            raise PreparationError(
                f"Unknown aggregation {step.method!r}. "
                f"Use one of: {', '.join(sorted(AGGREGATE_METHODS))}."
            )
    elif step.kind == "winsorize":
        lower = step.lower_quantile
        upper = step.upper_quantile
        if lower is None or upper is None:
            raise PreparationError(
                "Winsorizing needs both a lower and an upper quantile."
            )
        if lower >= upper:
            raise PreparationError(
                f"Winsorize lower quantile ({lower}) must be below the upper "
                f"quantile ({upper})."
            )


def _impute(values: np.ndarray, method: str, period: int | None) -> np.ndarray:
    series = pd.Series(values, dtype=float)
    if not series.isna().any():
        return series.to_numpy(dtype=float)

    if method == "forward_fill":
        filled = series.ffill().bfill()
    elif method == "linear":
        filled = series.interpolate(method="linear", limit_direction="both")
    elif method == "median":
        filled = series.fillna(series.median())
    elif method == "seasonal":
        p = period or 1
        filled = series.copy()
        for offset in range(p):
            block = series.iloc[offset::p]
            filled.iloc[offset::p] = block.fillna(block.median())
        # A season with no observed value at all still needs a number.
        filled = filled.fillna(series.median())
    else:  # pragma: no cover - validate_step rejects this first
        raise PreparationError(f"Unknown imputation method {method!r}.")
    return filled.to_numpy(dtype=float)


def _winsorize(values: np.ndarray, lower: float, upper: float) -> np.ndarray:
    lo = float(np.nanquantile(values, lower))
    hi = float(np.nanquantile(values, upper))
    return np.clip(values, lo, hi)


def validate_recipe_order(recipe: list[PreparationStep]) -> None:
    """Cleaning steps must all precede value transforms.

    Cleaning after a scale change would mean the value transforms no longer have
    a single well-defined input, so there would be nothing to prove the inverse
    against. It is also what a user means: clean the history, then model it.
    """
    seen_transform: str | None = None
    for step in recipe:
        if step.kind in VALUE_KINDS:
            seen_transform = step.kind
        elif step.kind in CLEANING_KINDS and seen_transform is not None:
            raise PreparationError(
                f"{step.kind} must come before {seen_transform}. Clean the "
                "history first, then transform it."
            )


def prepare_series(
    values: np.ndarray,
    recipe: list[PreparationStep],
    *,
    dates: pd.DatetimeIndex | None = None,
    tolerance: float = ROUNDTRIP_TOLERANCE,
) -> PreparedSeries:
    """Apply *recipe* to *values*, refusing anything that cannot be undone."""
    validate_recipe_order(recipe)

    current = np.asarray(values, dtype=float).copy()
    transformers: list[Transformer] = []
    notes: list[str] = []
    offset = 0
    chain_input: np.ndarray | None = None

    for step in recipe:
        if step.kind == "aggregate_duplicates" or step.kind == "insert_missing_periods":
            # Frame-level steps are applied by prepare_frame, which has the
            # dates and the series id. Nothing to do on a bare value array.
            validate_step(step, current)
            continue

        validate_step(step, current)

        if step.kind == "impute":
            before = int(np.isnan(current).sum())
            current = _impute(current, step.method or "linear", step.period)
            if before:
                notes.append(f"Imputed {before} missing values using {step.method}.")
            continue

        if step.kind == "winsorize":
            lower = float(step.lower_quantile or 0.0)
            upper = float(step.upper_quantile or 1.0)
            clipped = _winsorize(current, lower, upper)
            changed = int((clipped != current).sum())
            current = clipped
            if changed:
                notes.append(
                    f"Winsorized {changed} values to the "
                    f"{lower:.0%} to {upper:.0%} range."
                )
            continue

        if chain_input is None:
            # The series as the value transforms receive it: what the inverse
            # must reproduce.
            chain_input = current.copy()

        transformer = Transformer(step.kind, period=step.period or 1)
        try:
            current = transformer.forward(current)
        except TransformError as exc:
            raise PreparationError(f"{step.kind} failed: {exc}") from exc
        offset += transformer.history_offset()
        transformers.append(transformer)

    prepared = PreparedSeries(
        values=current,
        dates=dates[offset:] if dates is not None else None,
        history_offset=offset,
        transformers=transformers,
        notes=notes,
    )

    if transformers and chain_input is not None:
        error = prepared.roundtrip_error(chain_input)
        if not np.isfinite(error) or error > tolerance:
            kinds = " then ".join(t.kind for t in transformers)
            raise PreparationError(
                f"This recipe ({kinds}) cannot return forecasts to the original "
                f"scale: round-trip error {error:.6g} exceeds the {tolerance:g} "
                "tolerance. It cannot be used for forecasting."
            )

    return prepared


__all__ = [
    "AGGREGATE_METHODS",
    "CLEANING_KINDS",
    "IMPUTE_METHODS",
    "PreparationError",
    "PreparedSeries",
    "ROUNDTRIP_TOLERANCE",
    "VALUE_KINDS",
    "prepare_series",
    "validate_step",
]
