import type { ColumnMapping } from"./dataset";

export interface ForecastConfigIn {
 max_context: number;
 max_horizon: number;
 normalize_inputs: boolean;
 use_continuous_quantile_head: boolean;
 force_flip_invariance: boolean;
 infer_is_positive: boolean;
 fix_quantile_crossing: boolean;
 return_backcast: boolean;
 window_size: number;
 per_core_batch_size: number;
}

export const defaultForecastConfig: ForecastConfigIn = {
 max_context: 1024,
 max_horizon: 256,
 normalize_inputs: true,
 use_continuous_quantile_head: true,
 force_flip_invariance: true,
 infer_is_positive: true,
 fix_quantile_crossing: true,
 return_backcast: false,
 window_size: 0,
 per_core_batch_size: 1,
};

export interface ForecastRequest {
 dataset_id: string;
 mapping: ColumnMapping;
 horizon: number;
 forecast_config?: ForecastConfigIn;
}

export interface SeriesForecast {
 id: string;
 history_dates: string[];
 history_values: number[];
 future_dates: string[];
 point: number[];
 q10: number[];
 q50: number[];
 q90: number[];
 all_quantiles: number[][];
}

export interface ForecastResponse {
 horizon: number;
 series: SeriesForecast[];
 compile_config_hash: string;
}
