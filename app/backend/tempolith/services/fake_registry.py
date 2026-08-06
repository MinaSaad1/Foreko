"""Deterministic model stand-ins for the browser journey.

Enabled only by ``TEMPOLITH_FAKE_MODELS=1``. The end-to-end test needs the same
numbers on every run and must not depend on a 1.2 GB download, but the forecasts
these produce are arithmetic, not predictions. Nothing here may run in a real
install, which is why the flag defaults to False and the factory is never called
unless it is set.

The stand-in still honours the real contract: its output responds to covariates.
A fake that ignored them would let a covariate be disconnected from the model
while every test stayed green, which is exactly how blocker B1 survived.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..schemas.system import DeviceInfo
from .model_registry import ModelRegistry


class _DeterministicModel:
    """Repeats the mean of the history, shifted by any planned covariate."""

    def __init__(self) -> None:
        self.forecast_config: Any = None

    def compile(self, forecast_config: Any) -> None:
        self.forecast_config = forecast_config

    def forecast(
        self, horizon: int, inputs: list[np.ndarray]
    ) -> tuple[np.ndarray, np.ndarray]:
        points = np.zeros((len(inputs), horizon), dtype=float)
        quantiles = np.zeros((len(inputs), horizon, 10), dtype=float)
        for i, series in enumerate(inputs):
            arr = np.asarray(series, dtype=float)
            mean = float(arr.mean()) if arr.size else 0.0
            points[i, :] = mean
            for q in range(10):
                quantiles[i, :, q] = mean + (q - 5) * 0.1 * (abs(mean) + 1.0)
            quantiles[i, :, 0] = mean
        return points, quantiles

    def forecast_with_covariates(
        self,
        *,
        inputs: list[np.ndarray],
        dynamic_numerical_covariates: dict | None = None,
        dynamic_categorical_covariates: dict | None = None,
        static_numerical_covariates: dict | None = None,
        static_categorical_covariates: dict | None = None,
        xreg_mode: str = "xreg + timesfm",
    ) -> tuple[list, list]:
        horizon = 0
        for values in (dynamic_numerical_covariates or {}).values():
            horizon = max(horizon, len(values[0]) - len(inputs[0]))
        horizon = horizon or 1

        points: list[list[float]] = []
        quantiles: list[np.ndarray] = []
        for i, series in enumerate(inputs):
            arr = np.asarray(series, dtype=float)
            base = float(arr.mean()) if arr.size else 0.0
            shift = 0.0
            for values in (dynamic_numerical_covariates or {}).values():
                future = np.asarray(values[i][len(arr) :], dtype=float)
                if future.size:
                    shift += float(future.mean())
            point = np.full(horizon, base + shift, dtype=float)
            q = np.zeros((horizon, 10), dtype=float)
            for col in range(10):
                q[:, col] = point + (col - 5) * 0.1 * (abs(base) + 1.0)
            q[:, 0] = point
            points.append(point.tolist())
            quantiles.append(q)
        return points, quantiles


class FakeModelRegistry(ModelRegistry):
    """A registry that is ready immediately and downloads nothing."""

    def __init__(self) -> None:
        super().__init__(
            model_id="fake/deterministic",
            device=DeviceInfo(kind="cpu", name="Deterministic stand-in"),
        )
        self._model = _DeterministicModel()
        self._status = "ready"

    def load_blocking(self) -> None:  # type: ignore[override]
        return None

    async def load(self) -> None:  # type: ignore[override]
        return None

    def _ensure_compiled(self, config: Any) -> str:  # type: ignore[override]
        import hashlib

        cfg_hash = hashlib.sha1(
            str(config).encode("utf-8"), usedforsecurity=False
        ).hexdigest()[:12]
        if self._current_config_hash != cfg_hash:
            assert self._model is not None
            self._model.compile(config)
            self._current_config_hash = cfg_hash
            self._current_config = config
            self._compile_count += 1
        return cfg_hash


__all__ = ["FakeModelRegistry"]
