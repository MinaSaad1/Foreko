export type ModelStatus = "loading" | "ready" | "error";

export interface DeviceInfo {
  kind: "cuda" | "cpu";
  name: string;
  memory_total_mb: number | null;
  memory_free_mb: number | null;
}

export interface HealthInfo {
  status: "ok";
  model_status: ModelStatus;
  device: DeviceInfo;
  version: string;
}

export interface ForecastConfigSummary {
  max_context: number;
  max_horizon: number;
  normalize_inputs: boolean;
  use_continuous_quantile_head: boolean;
  force_flip_invariance: boolean;
  infer_is_positive: boolean;
  fix_quantile_crossing: boolean;
  return_backcast: boolean;
}

export interface ModelInfo {
  model_id: string;
  model_status: ModelStatus;
  current_config: ForecastConfigSummary | null;
  compile_count: number;
  queue_depth: number;
  device: DeviceInfo;
  error: string | null;
}
