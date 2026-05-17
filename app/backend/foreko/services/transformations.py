"""Reversible time-series transformations: log, diff, seasonal diff, Box-Cox."""

from __future__ import annotations

import numpy as np
from scipy import stats


class TransformError(Exception):
    pass


class Transformer:
    """Forward/inverse transformation pair with state captured for reversal."""

    def __init__(self, kind: str, period: int = 1):
        self.kind = kind
        self.period = period
        self._first_values: np.ndarray | None = None
        self._boxcox_lambda: float | None = None
        self._shift: float = 0.0

    def forward(self, values: np.ndarray) -> np.ndarray:
        if self.kind == "none":
            return values.astype(float)
        if self.kind == "log":
            if (values <= 0).any():
                self._shift = float(-values.min() + 1.0)
                return np.log(values + self._shift)
            return np.log(values)
        if self.kind == "diff":
            if len(values) < 2:
                raise TransformError("diff needs at least 2 points")
            self._first_values = np.array([values[0]])
            return np.diff(values, n=1)
        if self.kind == "seasonal_diff":
            if len(values) <= self.period:
                raise TransformError(f"seasonal_diff needs > {self.period} points")
            self._first_values = values[: self.period].copy()
            return values[self.period:] - values[:-self.period]
        if self.kind == "box_cox":
            if (values <= 0).any():
                self._shift = float(-values.min() + 1.0)
                shifted = values + self._shift
            else:
                shifted = values
            transformed, lam = stats.boxcox(shifted)
            self._boxcox_lambda = float(lam)
            return np.asarray(transformed, dtype=float)
        raise TransformError(f"unknown transform {self.kind!r}")

    def inverse(self, transformed: np.ndarray, context: np.ndarray | None = None) -> np.ndarray:
        """Inverse-transform a forecast. `context` is the last known value(s) of
        the original series (for diff/seasonal_diff).
        """
        if self.kind == "none":
            return transformed.astype(float)
        if self.kind == "log":
            return np.exp(transformed) - self._shift
        if self.kind == "diff":
            last = float(context[-1]) if context is not None and len(context) else 0.0
            return np.cumsum(transformed) + last
        if self.kind == "seasonal_diff":
            if context is None or len(context) < self.period:
                raise TransformError("seasonal_diff inverse needs context of length >= period")
            out = np.zeros(len(transformed), dtype=float)
            buf = list(context[-self.period:])
            for i, d in enumerate(transformed):
                out[i] = float(buf[-self.period]) + float(d)
                buf.append(out[i])
            return out
        if self.kind == "box_cox":
            lam = self._boxcox_lambda if self._boxcox_lambda is not None else 0.0
            if abs(lam) < 1e-9:
                inv = np.exp(transformed)
            else:
                inv = np.power(transformed * lam + 1.0, 1.0 / lam)
            return inv - self._shift
        raise TransformError(f"unknown transform {self.kind!r}")


def roundtrip_ok(values: np.ndarray, kind: str, period: int = 1, tol: float = 1e-3) -> bool:
    """Verify forward+inverse recovers the original (within tolerance)."""
    try:
        t = Transformer(kind, period=period)
        fwd = t.forward(values)
        if kind in ("diff", "seasonal_diff"):
            rec = t.inverse(fwd, context=values)
            orig = values[t.period if kind == "seasonal_diff" else 1:]
            return bool(np.allclose(rec, orig, atol=tol))
        rec = t.inverse(fwd)
        return bool(np.allclose(rec, values, atol=tol))
    except Exception:
        return False
