import type { ColumnMapping } from "./dataset";
import type { ForecastResponse } from "./forecast";

export interface FinetuneConfig {
  epochs: number;
  batch_size: number;
  lr: number;
  context_len: number;
  horizon_len: number;
  lora_r: number;
  lora_alpha: number;
  lora_dropout: number;
  num_samples: number;
  seed: number;
}

export interface FinetuneRequest {
  dataset_id: string;
  mapping: ColumnMapping;
  config: FinetuneConfig;
  adapter_name: string;
}

export interface JobCreated {
  job_id: string;
}

export interface JobStatus {
  job_id: string;
  status: "running" | "done" | "error" | "cancelled";
  error?: string | null;
  adapter_id?: string | null;
}

export interface AdapterMetadata {
  adapter_id: string;
  name: string;
  created_at: string;
  dataset_id: string;
  best_val_loss: number | null;
  config: FinetuneConfig;
}

export interface AdapterForecastRequest {
  adapter_id: string;
  dataset_id: string;
  mapping: ColumnMapping;
  horizon: number;
}

export type { ForecastResponse };

export interface ProgressEvent {
  type: "progress";
  epoch: number;
  total_epochs: number;
  batch: number;
  total_batches: number;
  train_loss: number;
  timestamp: number;
}

export interface EpochEvent {
  type: "epoch";
  epoch: number;
  total_epochs: number;
  train_loss: number;
  val_loss: number;
  best: boolean;
  timestamp: number;
}

export interface LogEvent {
  type: "log";
  message: string;
  timestamp: number;
}

export interface DoneEvent {
  type: "done";
  adapter_id: string;
  best_val_loss: number;
  timestamp: number;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  timestamp: number;
}

export type JobStatusEvent =
  | ProgressEvent
  | EpochEvent
  | LogEvent
  | DoneEvent
  | ErrorEvent;
