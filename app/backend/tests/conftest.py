"""Shared pytest fixtures for Foreko tests."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from foreko.main import create_app
from foreko.schemas.system import DeviceInfo
from foreko.services.model_registry import ModelRegistry
from foreko.settings import Settings


class FakeTimesFMModel:
    """Deterministic stand-in for the real :class:`TimesFM_2p5`."""

    def __init__(self) -> None:
        self.forecast_config: Any = None
        self.compile_calls = 0

    def compile(self, forecast_config: Any) -> None:
        self.forecast_config = forecast_config
        self.compile_calls += 1

    def forecast(
        self, horizon: int, inputs: list[np.ndarray]
    ) -> tuple[np.ndarray, np.ndarray]:
        n = len(inputs)
        points = np.zeros((n, horizon), dtype=float)
        quantiles = np.zeros((n, horizon, 10), dtype=float)
        for i, series in enumerate(inputs):
            arr = np.asarray(series, dtype=float)
            mean_val = float(arr.mean()) if arr.size else 0.0
            points[i, :] = mean_val
            for q in range(10):
                # mean=0, p10..p90 spread symmetrically around mean_val
                offset = (q - 5) * 0.1 * (abs(mean_val) + 1.0)
                quantiles[i, :, q] = mean_val + offset
            quantiles[i, :, 0] = mean_val  # column 0 = mean
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
        """Deterministic stand-in that actually responds to its covariates.

        The real model's output changes when a covariate changes. A fake that
        ignored them would let a covariate be disconnected from the model while
        every test still passed, which is exactly how blocker B1 survived.
        """
        horizon = 0
        for values in (dynamic_numerical_covariates or {}).values():
            horizon = max(horizon, len(values[0]) - len(inputs[0]))
        horizon = horizon or 1

        points: list[list[float]] = []
        quantiles: list[np.ndarray] = []
        for i, series in enumerate(inputs):
            arr = np.asarray(series, dtype=float)
            base = float(arr.mean()) if arr.size else 0.0
            # Shift the level by the planned future covariate, so a different
            # assumption produces a different forecast.
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
    """Registry that installs a :class:`FakeTimesFMModel` without loading torch."""

    def __init__(self) -> None:
        super().__init__(
            model_id="fake/timesfm",
            device=DeviceInfo(kind="cpu", name="FakeCPU"),
        )
        self._model = FakeTimesFMModel()
        self._status = "ready"

    def load_blocking(self) -> None:  # type: ignore[override]
        return None

    async def load(self) -> None:  # type: ignore[override]
        return None

    def _ensure_compiled(self, config: Any) -> str:  # type: ignore[override]
        # Skip the real timesfm.ForecastConfig path — we don't need its fields.
        import dataclasses
        import hashlib

        try:
            tup = dataclasses.astuple(config) if dataclasses.is_dataclass(config) else tuple(
                sorted(config.model_dump().items())
            )
        except Exception:
            tup = tuple(sorted(config.__dict__.items()))
        cfg_hash = hashlib.sha1(
            str(tup).encode("utf-8"), usedforsecurity=False
        ).hexdigest()[:12]
        if self._current_config_hash != cfg_hash:
            assert self._model is not None
            self._model.compile(config)
            self._current_config_hash = cfg_hash
            self._current_config = config
            self._compile_count += 1
        return cfg_hash


@pytest.fixture
def tmp_storage(tmp_path: Path) -> Path:
    return tmp_path / "foreko"


@pytest.fixture
def settings(tmp_storage: Path) -> Settings:
    s = Settings(storage_dir=tmp_storage, preload_model=False)
    s.ensure_dirs()
    return s


@pytest.fixture
def client(settings: Settings):
    app = create_app(settings=settings)
    fake = FakeModelRegistry()

    from foreko.deps import get_registry

    app.dependency_overrides[get_registry] = lambda: fake
    with TestClient(app) as c:
        # Lifespan created a real registry in state; swap to the fake so that
        # services reading from ``app.state.registry`` see the fake too.
        c.app.state.registry = fake
        yield c
