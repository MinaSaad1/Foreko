"""Singleton owner of the TimesFM model.

All inference calls go through this registry. It:
- loads the model exactly once (optionally lazily)
- serializes access via a single-thread executor
- caches the active compiled ``ForecastConfig`` and recompiles on change
"""

from __future__ import annotations

import asyncio
import dataclasses
import hashlib
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Protocol

from ..schemas.forecast import ForecastConfigIn
from ..schemas.system import DeviceInfo, ForecastConfigSummary, ModelStatus

logger = logging.getLogger(__name__)


class TimesFMModel(Protocol):
    """Structural protocol for the parts of TimesFM we call.

    Matches :class:`timesfm.timesfm_2p5.timesfm_2p5_base.TimesFM_2p5`.
    """

    forecast_config: Any

    def compile(self, forecast_config: Any) -> None: ...

    def forecast(
        self, horizon: int, inputs: list[Any]
    ) -> tuple[Any, Any]: ...

    def forecast_with_covariates(
        self,
        inputs: list[Any],
        dynamic_numerical_covariates: dict[str, list[Any]] | None,
        dynamic_categorical_covariates: dict[str, list[Any]] | None,
        static_numerical_covariates: dict[str, list[float]] | None,
        static_categorical_covariates: dict[str, list[int]] | None,
        freq: list[int] | None,
        horizon: int,
        xreg_mode: str,
    ) -> tuple[Any, Any]: ...


def _hash_config(cfg: Any) -> str:
    """Stable hash of a frozen ForecastConfig-like object."""

    try:
        tup = dataclasses.astuple(cfg)
    except TypeError:
        tup = tuple(sorted(cfg.__dict__.items()))
    return hashlib.sha1(str(tup).encode("utf-8"), usedforsecurity=False).hexdigest()[:12]


def _to_timesfm_config(cfg_in: ForecastConfigIn) -> Any:
    """Translate our Pydantic schema into a real :class:`timesfm.ForecastConfig`."""

    import timesfm

    return timesfm.ForecastConfig(
        max_context=cfg_in.max_context,
        max_horizon=cfg_in.max_horizon,
        normalize_inputs=cfg_in.normalize_inputs,
        window_size=cfg_in.window_size,
        per_core_batch_size=cfg_in.per_core_batch_size,
        use_continuous_quantile_head=cfg_in.use_continuous_quantile_head,
        force_flip_invariance=cfg_in.force_flip_invariance,
        infer_is_positive=cfg_in.infer_is_positive,
        fix_quantile_crossing=cfg_in.fix_quantile_crossing,
        return_backcast=cfg_in.return_backcast,
    )


class ModelRegistry:
    """Owns the model, its compile state, and the inference executor."""

    def __init__(
        self,
        *,
        model_id: str,
        device: DeviceInfo,
        local_model_dir: Path | None = None,
    ) -> None:
        self._model_id = model_id
        self._local_model_dir = local_model_dir
        self._device = device
        self._model: TimesFMModel | None = None
        self._current_config_hash: str | None = None
        self._current_config: ForecastConfigIn | None = None
        self._compile_count = 0
        self._queue_depth = 0
        self._queue_lock = threading.Lock()
        self._load_lock = threading.Lock()
        self._status: ModelStatus = "loading"
        self._error: str | None = None
        # max_workers=1 is the whole point: the model is not thread-safe.
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="timesfm-inference"
        )

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def device(self) -> DeviceInfo:
        return self._device

    @property
    def status(self) -> ModelStatus:
        return self._status

    @property
    def error(self) -> str | None:
        return self._error

    @property
    def compile_count(self) -> int:
        return self._compile_count

    @property
    def queue_depth(self) -> int:
        return self._queue_depth

    @property
    def current_config_hash(self) -> str | None:
        return self._current_config_hash

    @property
    def current_config_summary(self) -> ForecastConfigSummary | None:
        if self._current_config is None:
            return None
        c = self._current_config
        return ForecastConfigSummary(
            max_context=c.max_context,
            max_horizon=c.max_horizon,
            normalize_inputs=c.normalize_inputs,
            use_continuous_quantile_head=c.use_continuous_quantile_head,
            force_flip_invariance=c.force_flip_invariance,
            infer_is_positive=c.infer_is_positive,
            fix_quantile_crossing=c.fix_quantile_crossing,
            return_backcast=c.return_backcast,
        )

    # ------------------------------------------------------------------
    # Loading & compilation
    # ------------------------------------------------------------------

    def load_blocking(self) -> None:
        """Load the model in the current thread. Idempotent."""

        with self._load_lock:
            if self._model is not None:
                return
            try:
                import timesfm

                # When a local directory was downloaded by ``ensure_model``,
                # load straight from it — real files, no HF-hub symlinks,
                # so no Windows ``OSError[Errno 22]`` on ``open()``.
                target = (
                    str(self._local_model_dir)
                    if self._local_model_dir is not None
                    else self._model_id
                )
                logger.info("Loading TimesFM model from %s ...", target)
                model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(target)
                self._model = model
                self._status = "ready"
                logger.info("TimesFM model ready.")
            except Exception as exc:
                logger.exception("Failed to load TimesFM model")
                self._status = "error"
                self._error = str(exc)
                raise

    async def load(self) -> None:
        """Load the model off the event loop."""

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self.load_blocking)

    def _ensure_compiled(self, config: ForecastConfigIn) -> str:
        """Compile if the hash differs from the current compiled config."""

        assert self._model is not None, "Model must be loaded before compile."
        timesfm_cfg = _to_timesfm_config(config)
        cfg_hash = _hash_config(timesfm_cfg)
        if self._current_config_hash == cfg_hash:
            return cfg_hash
        logger.info("Compiling TimesFM with config hash %s", cfg_hash)
        self._model.compile(timesfm_cfg)
        self._current_config_hash = cfg_hash
        self._current_config = config
        self._compile_count += 1
        return cfg_hash

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    async def forecast(
        self,
        *,
        config: ForecastConfigIn,
        horizon: int,
        inputs: list[Any],
    ) -> tuple[Any, Any, str]:
        """Run :meth:`TimesFMModel.forecast` asynchronously.

        Returns ``(point, quantiles, compile_config_hash)``.
        """

        if self._model is None:
            await self.load()

        def _run() -> tuple[Any, Any, str]:
            with self._queue_lock:
                self._queue_depth += 1
            try:
                cfg_hash = self._ensure_compiled(config)
                assert self._model is not None
                point, quantiles = self._model.forecast(horizon=horizon, inputs=inputs)
                return point, quantiles, cfg_hash
            finally:
                with self._queue_lock:
                    self._queue_depth -= 1

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, _run)

    async def forecast_with_covariates(
        self,
        *,
        config: ForecastConfigIn,
        inputs: list[Any],
        dynamic_numerical_covariates: dict[str, list[Any]] | None = None,
        dynamic_categorical_covariates: dict[str, list[Any]] | None = None,
        static_numerical_covariates: dict[str, list[float]] | None = None,
        static_categorical_covariates: dict[str, list[int]] | None = None,
        xreg_mode: str = "xreg + timesfm",
    ) -> tuple[Any, Any, str]:
        """Run :meth:`TimesFMModel.forecast_with_covariates` asynchronously.

        Forces ``return_backcast=True`` as required by the covariates pathway.
        Returns ``(point, quantiles, compile_config_hash)``.
        """

        # return_backcast=True is required for the covariates pathway (base.py:240).
        covariate_config = config.model_copy(update={"return_backcast": True})

        if self._model is None:
            await self.load()

        def _run() -> tuple[Any, Any, str]:
            with self._queue_lock:
                self._queue_depth += 1
            try:
                cfg_hash = self._ensure_compiled(covariate_config)
                assert self._model is not None
                point, quantiles = self._model.forecast_with_covariates(
                    inputs=inputs,
                    dynamic_numerical_covariates=dynamic_numerical_covariates,
                    dynamic_categorical_covariates=dynamic_categorical_covariates,
                    static_numerical_covariates=static_numerical_covariates,
                    static_categorical_covariates=static_categorical_covariates,
                    xreg_mode=xreg_mode,
                )
                return point, quantiles, cfg_hash
            finally:
                with self._queue_lock:
                    self._queue_depth -= 1

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, _run)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
