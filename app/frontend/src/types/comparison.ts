export interface FeatureImportanceItem {
  category: string;
  weight: number;
}

export type ModelName = "global_model" | "your_model";
export type Confidence = "High" | "Medium" | "Low";

export interface ModelResult {
  name: ModelName;
  display_name: string;
  point_forecast: number[];
  p10: number[];
  p90: number[];
  mape: number;
  accuracy: number;
  confidence: Confidence;
  total_forecast: number;
  feature_importance: FeatureImportanceItem[] | null;
}

export interface ComparisonRequest {
  dataset_id: string;
  mapping: import("./dataset").ColumnMapping;
  horizon: number;
}

export interface ComparisonResponse {
  winner: ModelResult;
  alternative: ModelResult;
  winner_explanation: string;
  dates: string[];
  historical_dates: string[];
  historical_values: number[];
  backtest_holdout: number;
}
