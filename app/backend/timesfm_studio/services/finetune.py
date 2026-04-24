"""LoRA fine-tuning service for TimesFM 2.5.

Runs the training loop in a background thread and emits progress events via an
asyncio queue for Server-Sent Events streaming.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset

from ..schemas.finetune import AdapterMetadata, FinetuneConfig, FinetuneRequest
from . import csv_loader
from .device import DeviceInfo
from ..jobs.events import DoneEvent, EpochEvent, ErrorEvent, LogEvent, ProgressEvent

logger = logging.getLogger(__name__)

HF_FINETUNE_MODEL_ID = "google/timesfm-2.5-200m-transformers"


class TimeSeriesRandomWindowDataset(Dataset):
    """Pre-samples random (series, split-point) windows for training."""

    def __init__(
        self,
        series_list: list[np.ndarray],
        context_len: int,
        horizon_len: int,
        num_samples: int = 5000,
        seed: int = 42,
    ) -> None:
        self.series_list = series_list
        self.context_len = context_len
        self.horizon_len = horizon_len
        self.samples: list[tuple[int, int]] = []

        rng = np.random.default_rng(seed)
        min_len = context_len + horizon_len
        valid = [i for i, s in enumerate(series_list) if len(s) >= min_len]
        if not valid:
            raise ValueError(
                f"No series long enough for context_len={context_len} + horizon_len={horizon_len}"
            )
        for _ in range(num_samples):
            idx = int(rng.choice(valid))
            max_start = len(series_list[idx]) - min_len
            start = int(rng.integers(0, max_start + 1))
            self.samples.append((idx, start))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, i: int) -> tuple[torch.Tensor, torch.Tensor]:
        idx, start = self.samples[i]
        s = self.series_list[idx]
        ctx = torch.tensor(
            s[start : start + self.context_len], dtype=torch.float32
        )
        tgt = torch.tensor(
            s[start + self.context_len : start + self.context_len + self.horizon_len],
            dtype=torch.float32,
        )
        return ctx, tgt


def run_finetune(
    *,
    series_list: list[np.ndarray],
    config: FinetuneConfig,
    adapter_id: str,
    adapter_name: str,
    dataset_id: str,
    adapters_dir: Path,
    device_info: DeviceInfo,
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    stop_event: threading.Event,
) -> None:
    """Synchronous training loop; intended to run in a background thread.

    Emits events via ``loop.call_soon_threadsafe`` so the async event loop can
    forward them over SSE without blocking.
    """

    def emit(event: object) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, event)

    try:
        from peft import LoraConfig, get_peft_model
        from transformers import TimesFm2_5ModelForPrediction

        is_cpu = device_info.kind == "cpu"
        device = "cuda" if not is_cpu else "cpu"
        dtype = torch.float32 if is_cpu else torch.bfloat16

        # Clamp samples on CPU to avoid excessive training time.
        effective_num_samples = min(config.num_samples, 1000) if is_cpu else config.num_samples

        emit(LogEvent(message=f"Loading base model {HF_FINETUNE_MODEL_ID} on {device}..."))
        model = TimesFm2_5ModelForPrediction.from_pretrained(
            HF_FINETUNE_MODEL_ID, torch_dtype=dtype, device_map=device
        )
        context_len = min(config.context_len, model.config.context_length)
        horizon_len = config.horizon_len

        lora_cfg = LoraConfig(
            r=config.lora_r,
            lora_alpha=config.lora_alpha,
            target_modules="all-linear",
            lora_dropout=config.lora_dropout,
            bias="none",
        )
        model = get_peft_model(model, lora_cfg)
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        emit(LogEvent(message=f"LoRA applied. Trainable params: {trainable:,}"))

        train_ds = TimeSeriesRandomWindowDataset(
            series_list,
            context_len,
            horizon_len,
            num_samples=effective_num_samples,
            seed=config.seed,
        )
        val_series = series_list[-max(1, len(series_list) // 10):]
        val_ds = TimeSeriesRandomWindowDataset(
            val_series,
            context_len,
            horizon_len,
            num_samples=max(10, effective_num_samples // 10),
            seed=config.seed + 1,
        )
        train_loader = DataLoader(
            train_ds, batch_size=config.batch_size, shuffle=True, drop_last=True
        )
        val_loader = DataLoader(val_ds, batch_size=config.batch_size)

        optimizer = torch.optim.AdamW(
            model.parameters(), lr=config.lr, weight_decay=0.01
        )
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=config.epochs * len(train_loader)
        )

        best_val_loss = float("inf")
        adapter_out = adapters_dir / adapter_id

        for epoch in range(1, config.epochs + 1):
            if stop_event.is_set():
                emit(LogEvent(message="Training cancelled."))
                return

            model.train()
            epoch_loss, n_batches = 0.0, 0

            for batch_idx, (context, target_vals) in enumerate(train_loader):
                if stop_event.is_set():
                    emit(LogEvent(message="Training cancelled."))
                    return

                context = context.to(device)
                target_vals = target_vals.to(device)
                outputs = model(
                    past_values=context,
                    future_values=target_vals,
                    forecast_context_len=context_len,
                )
                loss = outputs.loss
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                optimizer.zero_grad()
                scheduler.step()

                epoch_loss += loss.item()
                n_batches += 1
                emit(
                    ProgressEvent(
                        epoch=epoch,
                        total_epochs=config.epochs,
                        batch=batch_idx + 1,
                        total_batches=len(train_loader),
                        train_loss=round(epoch_loss / n_batches, 4),
                    )
                )

            avg_train = epoch_loss / max(n_batches, 1)

            model.eval()
            val_loss, val_batches = 0.0, 0
            with torch.no_grad():
                for context, target_vals in val_loader:
                    context = context.to(device)
                    target_vals = target_vals.to(device)
                    outputs = model(
                        past_values=context,
                        future_values=target_vals,
                        forecast_context_len=context_len,
                    )
                    val_loss += outputs.loss.item()
                    val_batches += 1

            avg_val = val_loss / max(val_batches, 1)
            is_best = avg_val < best_val_loss
            if is_best:
                best_val_loss = avg_val
                model.save_pretrained(str(adapter_out))

            emit(
                EpochEvent(
                    epoch=epoch,
                    total_epochs=config.epochs,
                    train_loss=round(avg_train, 4),
                    val_loss=round(avg_val, 4),
                    best=is_best,
                )
            )

        meta = AdapterMetadata(
            adapter_id=adapter_id,
            name=adapter_name or adapter_id[:8],
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            dataset_id=dataset_id,
            best_val_loss=round(best_val_loss, 6),
            config=config,
        )
        adapter_out.mkdir(parents=True, exist_ok=True)
        (adapter_out / "meta.json").write_text(
            meta.model_dump_json(indent=2), encoding="utf-8"
        )
        emit(DoneEvent(adapter_id=adapter_id, best_val_loss=round(best_val_loss, 6)))
        emit(None)  # sentinel: close the SSE stream

    except Exception as exc:
        logger.exception("Fine-tuning failed: %s", exc)
        emit(ErrorEvent(message=str(exc)))
        emit(None)


async def start_finetune(
    *,
    request: FinetuneRequest,
    datasets_dir: Path,
    adapters_dir: Path,
    device_info: DeviceInfo,
    queue: asyncio.Queue,
    stop_event: threading.Event,
) -> str:
    """Load series from CSV and launch the training loop in a background thread.

    Returns the ``adapter_id`` immediately; training continues asynchronously.
    The caller should wrap this in ``asyncio.create_task`` to avoid blocking.
    """

    df = csv_loader.load_dataset(request.dataset_id, datasets_dir)
    _, values, _ = csv_loader.extract_series(df, request.mapping)
    series_list = [v.copy() for v in values]

    adapter_id = str(uuid.uuid4())
    loop = asyncio.get_running_loop()

    # run_finetune is synchronous; run it in the default thread executor so the
    # event loop stays free to serve other requests and stream SSE events.
    await asyncio.to_thread(
        run_finetune,
        series_list=series_list,
        config=request.config,
        adapter_id=adapter_id,
        adapter_name=request.adapter_name,
        dataset_id=request.dataset_id,
        adapters_dir=adapters_dir,
        device_info=device_info,
        queue=queue,
        loop=loop,
        stop_event=stop_event,
    )
    return adapter_id
