import type { ColumnMapping } from"./dataset";

export type Severity = "CRITICAL" | "WARNING" | "NORMAL";

export interface ContextAnomalyRecord {
 date: string;
 value: number;
 trend: number;
 residual: number;
 z_score: number;
 severity: Severity;
}

export interface ForecastAnomalyRecord {
 date: string;
 forecast: number;
 q10: number;
 q20: number;
 q80: number;
 q90: number;
 severity: Severity;
}

export interface AnomalySummary {
 total: number;
 critical: number;
 warning: number;
 normal: number;
}

export interface SeriesAnomalyResult {
 series_id: string;
 res_std: number;
 context_summary: AnomalySummary;
 forecast_summary: AnomalySummary;
 context_records: ContextAnomalyRecord[];
 forecast_records: ForecastAnomalyRecord[];
}

export interface AnomalyResponse {
 results: SeriesAnomalyResult[];
}

export interface AnomalyRequest {
 dataset_id: string;
 mapping: ColumnMapping;
 horizon: number;
 critical_z: number;
 warning_z: number;
}
