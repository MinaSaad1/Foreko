"""Tests for reversible transformations.

The property that matters: a forecast produced in transformed space must return
to the original scale exactly, or the numbers a user reads are wrong.
"""

from __future__ import annotations

import numpy as np
import pytest

from foreko.services.transformations import Transformer, TransformError, roundtrip_ok


SERIES = np.array([10.0, 12, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22], dtype=float)


@pytest.mark.unit
@pytest.mark.parametrize(
    ("kind", "period"),
    [("none", 1), ("log", 1), ("box_cox", 1), ("diff", 1), ("seasonal_diff", 4)],
)
def test_every_transform_roundtrips(kind: str, period: int) -> None:
    # diff and seasonal_diff previously reported False here: the check anchored
    # the inverse on the series' last value instead of the rows the transform
    # consumed, so an exactly invertible transform looked broken.
    assert roundtrip_ok(SERIES, kind, period=period) is True


@pytest.mark.unit
def test_diff_inverse_anchors_on_the_context_it_is_given() -> None:
    t = Transformer("diff")
    forward = t.forward(SERIES)

    # Round-trip: context is the row the transform consumed.
    restored = t.inverse(forward, context=SERIES[: t.history_offset()])
    assert np.allclose(restored, SERIES[1:])

    # Forecasting: context is the whole history, so the anchor is its last
    # value and the result continues the series rather than replaying it.
    future = np.array([1.0, 2.0])
    continued = t.inverse(future, context=SERIES)
    assert np.allclose(continued, [SERIES[-1] + 1.0, SERIES[-1] + 3.0])


@pytest.mark.unit
def test_seasonal_diff_inverse_roundtrips_against_consumed_rows() -> None:
    t = Transformer("seasonal_diff", period=4)
    forward = t.forward(SERIES)
    assert t.history_offset() == 4
    restored = t.inverse(forward, context=SERIES[:4])
    assert np.allclose(restored, SERIES[4:])


@pytest.mark.unit
def test_history_offset_reports_rows_consumed() -> None:
    assert Transformer("none").history_offset() == 0
    assert Transformer("log").history_offset() == 0
    assert Transformer("box_cox").history_offset() == 0
    assert Transformer("diff").history_offset() == 1
    assert Transformer("seasonal_diff", period=12).history_offset() == 12


@pytest.mark.unit
def test_diff_needs_two_points() -> None:
    with pytest.raises(TransformError):
        Transformer("diff").forward(np.array([1.0]))


@pytest.mark.unit
def test_seasonal_diff_needs_more_points_than_its_period() -> None:
    with pytest.raises(TransformError):
        Transformer("seasonal_diff", period=4).forward(np.array([1.0, 2.0, 3.0, 4.0]))


@pytest.mark.unit
def test_unknown_transform_is_rejected() -> None:
    with pytest.raises(TransformError):
        Transformer("wat").forward(SERIES)
