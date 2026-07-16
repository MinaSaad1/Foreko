// Hand-mirrored from app/backend/foreko/schemas/project.py.
//
// These field names deliberately differ from the validation types in
// types/validation.ts. Design 14: post-issue accuracy must not be confusable
// with backtest evidence, in labels or in API fields. They answer different
// questions and are scaled differently.

export interface AccuracyMetrics {
 mase: number | null;
 wape: number | null;
 smape: number | null;
 rmse: number | null;
 bias_pct: number | null;
 pinball_loss: number | null;
 coverage_p10_p90: number | null;
}

export interface SeriesAccuracy {
 series_id: string;
 matched_points: number;
 metrics: AccuracyMetrics;
 metric_warnings: string[];
}

export interface AccuracyResult {
 schema_version: 1;
 issued_id: string | null;
 issued_at: string | null;
 matched_points: number;
 unmatched_periods: number;
 series: SeriesAccuracy[];
 metrics: AccuracyMetrics;
 metric_warnings: string[];
}

export interface IssuedForecast {
 schema_version: 1;
 id: string;
 project_id: string;
 run_id: string;
 revision_no: number;
 issued_at: string;
 forecast: Record<string, unknown>;
 assumptions: Record<string, unknown>;
 manifest: Record<string, unknown>;
}
