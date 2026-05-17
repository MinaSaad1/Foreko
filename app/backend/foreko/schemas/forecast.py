"""Forecast request and response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping


class ForecastConfigIn(BaseModel):
    """Mirrors :class:`timesfm.ForecastConfig` one-for-one.

    Defaults match the recipe used in ``forecast_qty.py`` at the repo root.
    """

    model_config = ConfigDict(extra="forbid")

    max_context: int = 1024
    max_horizon: int = 256
    normalize_inputs: bool = True
    use_continuous_quantile_head: bool = True
    force_flip_invariance: bool = True
    infer_is_positive: bool = True
    fix_quantile_crossing: bool = True
    return_backcast: bool = False
    window_size: int = 0
    per_core_batch_size: int = 1


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    mapping: ColumnMapping
    horizon: int = Field(ge=1, le=512)
    forecast_config: ForecastConfigIn = Field(default_factory=ForecastConfigIn)


class SeriesForecast(BaseModel):
    """Single series forecast with quantile bands.

    Quantile layout mirrors the v2.5 output: ``all_quantiles`` shape is
    ``(horizon, 10)`` with columns ``[mean, p10, p20, p30, p40, p50, p60, p70,
    p80, p90]`` — see timesfm_2p5_base.py:188.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    history_dates: list[str]
    history_values: list[float]
    future_dates: list[str]
    point: list[float]
    q10: list[float]
    q50: list[float]
    q90: list[float]
    all_quantiles: list[list[float]]


class ForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    horizon: int
    series: list[SeriesForecast]
    compile_config_hash: str
