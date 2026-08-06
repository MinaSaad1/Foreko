// Hand-mirrored from the validate job's serialized ValidationResult in
// app/backend/tempolith/routers/project_jobs.py.

export interface MetricSet {
 mase: number | null;
 wape: number | null;
 smape: number | null;
 rmse: number | null;
 bias_pct: number | null;
 coverage_p10_p90: number | null;
 warnings: string[];
}

export interface SeriesPolicy {
 series_id: string;
 champion: string | null;
 challenger: string | null;
 eligible: string[];
 ineligible: Record<string, string>;
 reason: string;
 ensemble_weights: Record<string, number>;
 metrics: Record<string, MetricSet>;
}

export interface ValidationFailure {
 model: string;
 fold: number;
 reason: string;
 series_id: string | null;
}

export interface ValidationResult {
 primary_metric: "mase" | "wape" | "smape";
 portfolio_metrics: MetricSet;
 series_policies: Record<string, SeriesPolicy>;
 failures: ValidationFailure[];
}
