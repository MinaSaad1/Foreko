import type { ColumnMapping } from "./dataset";

// -------- Backtest / Diagnostics (P1) --------

export interface FoldDetail {
  fold: number;
  train_end: number;
  test_start: number;
  test_end: number;
  mape: number;
  smape: number;
  rmse: number;
  mae: number;
  mase: number;
  pinball_10: number;
  pinball_50: number;
  pinball_90: number;
}

export interface BacktestAggregate {
  mape_mean: number;
  mape_std: number;
  smape_mean: number;
  rmse_mean: number;
  mae_mean: number;
  mase_mean: number;
  pinball_10_mean: number;
  pinball_50_mean: number;
  pinball_90_mean: number;
}

export interface BacktestResult {
  horizon: number;
  folds: number;
  models: string[];
  aggregate: Record<string, BacktestAggregate>;
  per_horizon_mape: Record<string, number[]>;
  fold_details: Record<string, FoldDetail[]>;
  winner: string | null;
}

export interface BacktestRequest {
  dataset_id: string;
  mapping: ColumnMapping;
  horizon: number;
  folds: number;
  models: string[];
}

export interface JobHandle {
  job_id: string;
  kind: string;
  status: string;
}

export interface JobStatus {
  job_id: string;
  kind: string;
  status: string;
  progress: { current: number; total: number; stage: string };
  result: BacktestResult | null;
  error: string | null;
}

export interface DiagnosticsResult {
  model: string;
  horizon: number;
  n_points: number;
  freq: string;
  period: number;
  forecast_dates: string[];
  forecast: number[];
  actual: number[];
  residuals: number[];
  residual_stats: { mean: number; std: number; skew: number; kurtosis: number };
  residual_histogram: { centers: number[]; counts: number[] };
  qq_points: [number, number][];
  acf: number[];
  ljung_box: { statistic: number; p_value: number };
  per_horizon_mape: number[];
  stl: { observed: number[]; trend: number[]; seasonal: number[]; residual: number[] };
  stl_dates: string[];
}

export interface CalibrationResult {
  reliability: { nominal: number; empirical: number; lo_quantile: number; hi_quantile: number }[];
  n_observations: number;
  folds: number;
  horizon: number;
}

export interface PreflightResult {
  n_points: number;
  freq: string;
  period: number;
  first_date: string | null;
  last_date: string | null;
  missing_count: number;
  missing_rate: number;
  outlier_count: number;
  range: { min: number; max: number; mean: number; std: number };
  skewness: number;
  kurtosis: number;
  adf: { statistic: number; p_value: number; stationary: boolean };
  seasonality: { seasonal_strength: number; trend_strength: number };
  recommended_transforms: { transform: string; reason: string }[];
  quality_score: number;
  warnings: string[];
}

// -------- P2 --------

export type MethodId = "z_score" | "iqr" | "stl_residual" | "isolation_forest" | "quantile_pi";

export interface AnomalyMethodRecord {
  index: number;
  date: string;
  value: number;
  votes: number;
  methods_detected: string[];
  severity: string;
  reason: string;
}

export interface AnomalyMethodsResult {
  series_length: number;
  methods: MethodId[];
  agreement_matrix: Record<string, Record<string, number>>;
  method_counts: Record<string, number>;
  records: AnomalyMethodRecord[];
  dates: string[];
  values: number[];
}

export interface RootCauseExplanation {
  factor: string;
  kind: "numeric" | "categorical";
  anomaly_mean?: number;
  baseline_mean?: number;
  z_score?: number;
  direction: string;
  strength: "strong" | "mild" | "weak";
  top_category?: string;
  anomaly_share?: number;
  baseline_share?: number;
  lift?: number;
}

export interface RootCauseResult {
  n_anomalies: number;
  explanations: RootCauseExplanation[];
}

export interface Changepoint {
  index: number;
  date: string;
  left_mean: number;
  right_mean: number;
  shift_absolute: number;
  shift_percent: number;
  direction: "up" | "down";
}

export interface ChangepointsResult {
  changepoints: Changepoint[];
  dates: string[];
  values: number[];
}

export interface LagPoint {
  lag: number;
  corr: number;
}

export interface LagResult {
  factor: string;
  lags: LagPoint[];
  peak_lag: number;
  peak_corr: number;
}

export interface GrangerRow {
  factor: string;
  direction: string;
  best_lag: number;
  p_value: number;
  causal: boolean;
}

// -------- P3 --------

export interface ScenarioSummary {
  id: string;
  label: string;
  created_at: string;
}

export interface ScenarioDetail extends ScenarioSummary {
  dataset_id: string;
  config: Record<string, unknown>;
}

export interface ScenarioRunResult {
  historical_dates: string[];
  historical_values: number[];
  forecast_dates: string[];
  forecast: number[];
  p10: number[];
  p90: number[];
  total: number;
}

export interface ScenarioCompareEntry {
  id: string;
  label: string;
  forecast_dates: string[];
  forecast: number[];
  p10: number[];
  p90: number[];
  total: number;
  delta_vs_first: number;
  delta_pct_vs_first: number;
}

export interface ScenarioCompareResult {
  historical_dates: string[];
  historical_values: number[];
  scenarios: ScenarioCompareEntry[];
}

// -------- P4 --------

export interface SegmentSummary {
  id: string;
  length: number;
  first_date: string | null;
  last_date: string | null;
  total: number;
  mean: number;
  std: number;
  growth_pct: number;
  volatility: number;
  dates: string[];
  values: number[];
}

export interface SegmentsResult {
  n_segments: number;
  segments: SegmentSummary[];
  rankings: {
    by_total: { id: string; value: number }[];
    by_growth: { id: string; value: number }[];
    by_volatility: { id: string; value: number }[];
  };
}

export interface EnsembleResult {
  weights: Record<string, number>;
  combined: number[];
  expected_mape: number;
}

export interface STLResult {
  observed: number[];
  trend: number[];
  seasonal: number[];
  residual: number[];
  dates: string[];
  period: number;
  freq: string;
}

// -------- P5 --------

export interface NarrativeResult {
  markdown: string;
  source: string;
}

export interface FactorSuggestion {
  name: string;
  kind: string;
  reason: string;
}

// -------- P6 --------

export interface Annotation {
  id: string;
  date: string;
  label: string;
  note: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  dataset_id: string;
  cron: string;
  action: Record<string, unknown>;
  last_run_at: string | null;
  active: boolean;
  created_at: string;
}

export interface AlertRule {
  id: string;
  dataset_id: string;
  kind: string;
  config: Record<string, unknown>;
  active: boolean;
  created_at: string;
}
