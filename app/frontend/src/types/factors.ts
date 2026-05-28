import type { ColumnMapping } from"./dataset";

export type FactorKind = "numeric" | "categorical";
export type XregMode = "additive" | "multiplicative";
export type ImpactDirection = "up" | "down" | "flat";

export interface FactorStat {
 name: string;
 kind: FactorKind;
 mean: number | null;
 std: number | null;
 min_value: number | null;
 max_value: number | null;
 last_value: number | null;
 unique_count: number | null;
 top_category: string | null;
 correlation: number;
 elasticity: number | null;
 influence: number;
}

export interface FactorImpact {
 total_baseline: number;
 total_with_factors: number;
 delta_absolute: number;
 delta_percent: number;
 top_driver: string | null;
 direction: ImpactDirection;
}

export interface FactorAnalysisRequest {
 dataset_id: string;
 mapping: ColumnMapping;
 horizon: number;
 numeric_factors: string[];
 categorical_factors: string[];
 xreg_mode: XregMode;
}

export interface FactorAnalysisResponse {
 factors: FactorStat[];
 impact: FactorImpact;
 historical_dates: string[];
 historical_values: number[];
 forecast_dates: string[];
 baseline_forecast: number[];
 baseline_p10: number[];
 baseline_p90: number[];
 factors_forecast: number[];
 factors_p10: number[];
 factors_p90: number[];
}
