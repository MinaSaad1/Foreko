"""SSE event dataclasses for fine-tuning job progress."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal, Union


@dataclass(frozen=True)
class ProgressEvent:
    type: Literal["progress"] = "progress"
    epoch: int = 0
    total_epochs: int = 0
    batch: int = 0
    total_batches: int = 0
    train_loss: float = 0.0
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True)
class EpochEvent:
    type: Literal["epoch"] = "epoch"
    epoch: int = 0
    total_epochs: int = 0
    train_loss: float = 0.0
    val_loss: float = 0.0
    best: bool = False
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True)
class LogEvent:
    type: Literal["log"] = "log"
    message: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True)
class DoneEvent:
    type: Literal["done"] = "done"
    adapter_id: str = ""
    best_val_loss: float = 0.0
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True)
class ErrorEvent:
    type: Literal["error"] = "error"
    message: str = ""
    timestamp: float = field(default_factory=time.time)


JobStatusEvent = Union[ProgressEvent, EpochEvent, LogEvent, DoneEvent, ErrorEvent]
