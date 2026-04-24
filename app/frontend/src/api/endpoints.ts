import type { DatasetPreview, SeriesExtraction, ColumnMapping, DatasetSummary } from "@/types/dataset";
import type { ForecastRequest, ForecastResponse } from "@/types/forecast";
import type { HealthInfo, ModelInfo } from "@/types/system";
import type { CovariateForecastRequest } from "@/types/covariates";
import type { AnomalyRequest, AnomalyResponse } from "@/types/anomaly";
import type { ComparisonRequest, ComparisonResponse } from "@/types/comparison";
import type { FactorAnalysisRequest, FactorAnalysisResponse } from "@/types/factors";
import type {
  BacktestRequest,
  CalibrationResult,
  DiagnosticsResult,
  PreflightResult,
  JobHandle,
  JobStatus,
  AnomalyMethodsResult,
  RootCauseResult,
  ChangepointsResult,
  LagResult,
  GrangerRow,
  ScenarioSummary,
  ScenarioDetail,
  ScenarioRunResult,
  ScenarioCompareResult,
  SegmentsResult,
  EnsembleResult,
  STLResult,
  NarrativeResult,
  FactorSuggestion,
  Annotation,
  Schedule,
  AlertRule,
} from "@/types/phases";
import { apiGet, apiPost, apiUpload } from "./client";

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface ModelDownloadProgress {
  state: "idle" | "downloading" | "ready" | "error";
  total_bytes: number;
  downloaded_bytes: number;
  speed_bps: number;
  elapsed_seconds: number;
  eta_seconds: number;
  error: string | null;
  cache_path: string | null;
}

export const api = {
  health: () => apiGet<HealthInfo>("/health"),
  modelInfo: () => apiGet<ModelInfo>("/model-info"),
  modelDownloadProgress: () => apiGet<ModelDownloadProgress>("/model/download-progress"),
  ensureModel: () => apiPost<ModelDownloadProgress>("/model/ensure", {}),
  uploadDataset: (file: File) => apiUpload<DatasetPreview>("/datasets/upload", file),
  datasetPreview: (id: string) => apiGet<DatasetPreview>(`/datasets/${id}/preview`),
  listDatasets: () => apiGet<DatasetSummary[]>("/datasets"),
  deleteDataset: (id: string) => apiDelete<void>(`/datasets/${id}`),
  datasetSeries: (id: string, mapping: ColumnMapping) =>
    apiPost<SeriesExtraction>(`/datasets/${id}/series`, mapping),
  forecast: (req: ForecastRequest) => apiPost<ForecastResponse>("/forecast", req),

  runComparison: (req: ComparisonRequest) =>
    apiPost<ComparisonResponse>("/comparison/run", req),

  forecastCovariates: (req: CovariateForecastRequest) =>
    apiPost<ForecastResponse>("/forecast/covariates", req),

  detectAnomalies: (req: AnomalyRequest) =>
    apiPost<AnomalyResponse>("/anomaly/detect", req),

  analyzeFactors: (req: FactorAnalysisRequest) =>
    apiPost<FactorAnalysisResponse>("/factors/analyze", req),

  // Phase 1: backtest, diagnostics, calibration, preflight, analyses cache
  startBacktest: (req: BacktestRequest) =>
    apiPost<JobHandle>("/backtest/walk-forward", req),
  getBacktestJob: (jobId: string) =>
    apiGet<JobStatus>(`/backtest/jobs/${jobId}`),
  cancelBacktestJob: (jobId: string) =>
    apiPost<{ cancelled: boolean }>(`/backtest/jobs/${jobId}/cancel`, {}),
  backtestEventStreamUrl: (jobId: string) => `/api/backtest/jobs/${jobId}/events`,
  runCalibration: (req: { dataset_id: string; mapping: unknown; horizon: number; folds: number }) =>
    apiPost<CalibrationResult>("/backtest/calibration", req),
  runDiagnostics: (req: { dataset_id: string; mapping: unknown; horizon: number; model: string }) =>
    apiPost<DiagnosticsResult>("/diagnostics/run", req),
  runPreflight: (req: { dataset_id: string; mapping: unknown }) =>
    apiPost<PreflightResult>("/preflight/run", req),
  listAnalyses: (datasetId: string) =>
    apiGet<{ id: string; kind: string; created_at: string }[]>(`/analyses?dataset_id=${datasetId}`),
  getAnalysis: (id: string) =>
    apiGet<{ id: string; dataset_id: string; kind: string; result: unknown; created_at: string }>(`/analyses/${id}`),
  deleteAnalysis: (id: string) =>
    apiDelete<void>(`/analyses/${id}`),

  // Phase 2: anomaly methods, root cause, changepoints, factor diagnostics
  detectAnomalyMethods: (req: { dataset_id: string; mapping: unknown; critical_z?: number; warning_z?: number }) =>
    apiPost<AnomalyMethodsResult>("/anomaly-methods/detect", req),
  explainAnomalies: (req: {
    dataset_id: string;
    mapping: unknown;
    anomaly_dates: string[];
    numeric_factors: string[];
    categorical_factors: string[];
  }) => apiPost<RootCauseResult>("/anomaly-methods/root-cause", req),
  detectChangepoints: (req: { dataset_id: string; mapping: unknown; penalty?: number }) =>
    apiPost<ChangepointsResult>("/changepoints/detect", req),
  surrogateImportance: (req: {
    dataset_id: string;
    mapping: unknown;
    numeric_factors: string[];
    categorical_factors: string[];
    max_lag?: number;
  }) => apiPost<{ kind: string; factors: { name: string; gain: number; influence: number }[] }>("/factor-diagnostics/surrogate", req),
  lagAnalysis: (req: {
    dataset_id: string;
    mapping: unknown;
    numeric_factors: string[];
    categorical_factors?: string[];
    max_lag: number;
  }) => apiPost<{ results: LagResult[]; max_lag: number }>("/factor-diagnostics/lag", req),
  grangerTests: (req: {
    dataset_id: string;
    mapping: unknown;
    numeric_factors: string[];
    categorical_factors?: string[];
    max_lag: number;
  }) => apiPost<{ results: GrangerRow[] }>("/factor-diagnostics/granger", req),

  // Phase 3: scenarios
  runScenario: (config: Record<string, unknown>) =>
    apiPost<ScenarioRunResult>("/scenarios/run", config),
  saveScenario: (label: string, config: Record<string, unknown>) =>
    apiPost<{ id: string }>("/scenarios", { label, config }),
  listScenarios: (datasetId: string) =>
    apiGet<ScenarioSummary[]>(`/scenarios?dataset_id=${datasetId}`),
  getScenario: (id: string) =>
    apiGet<ScenarioDetail>(`/scenarios/${id}`),
  deleteScenario: (id: string) =>
    apiDelete<void>(`/scenarios/${id}`),
  compareScenarios: (scenarioIds: string[]) =>
    apiPost<ScenarioCompareResult>("/scenarios/compare", { scenario_ids: scenarioIds }),
  forecastHistory: (datasetId: string) =>
    apiGet<{ id: string; model: string; run_at: string; horizon: number; forecast: unknown }[]>(`/scenarios/history/${datasetId}`),

  // Phase 4: segments, stl, ensemble, transforms
  stlDecompose: (req: { dataset_id: string; mapping: unknown; period?: number | null }) =>
    apiPost<STLResult>("/stl/decompose", req),
  compareSegments: (req: { dataset_id: string; mapping: unknown; top_n?: number }) =>
    apiPost<SegmentsResult>("/segments/compare", req),
  combineEnsemble: (req: { forecasts: Record<string, number[]>; mapes: Record<string, number> }) =>
    apiPost<EnsembleResult>("/ensemble/combine", req),
  transformRoundtrip: (req: { dataset_id: string; mapping: unknown; kind: string; period?: number }) =>
    apiPost<{ kind: string; reversible: boolean; transformed_preview?: number[]; n_points_after?: number; error?: string }>("/transforms/roundtrip", req),

  // Phase 5: narrative, query, suggest
  narrateForecast: (payload: unknown) =>
    apiPost<NarrativeResult>("/narrative/forecast", { payload }),
  narrateAnomaly: (payload: unknown) =>
    apiPost<NarrativeResult>("/narrative/anomaly", { payload }),
  narrateFactors: (payload: unknown) =>
    apiPost<NarrativeResult>("/narrative/factors", { payload }),
  suggestFactors: (columns: unknown[]) =>
    apiPost<{ suggestions: FactorSuggestion[] }>("/narrative/suggest-factors", { columns }),
  runNlq: (req: { records: unknown[]; query: string; date_field?: string }) =>
    apiPost<{ results: Record<string, unknown>[]; count: number; filters: unknown[] }>("/query", req),

  // Phase 6: exports, schedules, alerts, annotations, share
  exportPdf: async (title: string, sections: unknown[]): Promise<Blob> => {
    const res = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, sections }),
    });
    if (!res.ok) throw new Error("PDF export failed");
    return res.blob();
  },
  createSchedule: (req: { dataset_id: string; cron: string; action: Record<string, unknown> }) =>
    apiPost<{ id: string }>("/schedules", req),
  listSchedules: () => apiGet<Schedule[]>("/schedules"),
  deleteSchedule: (id: string) => apiDelete<void>(`/schedules/${id}`),
  createAlertRule: (req: { dataset_id: string; kind: string; config: Record<string, unknown> }) =>
    apiPost<{ id: string }>("/alerts/rules", req),
  listAlertRules: (datasetId?: string) =>
    apiGet<AlertRule[]>(datasetId ? `/alerts/rules?dataset_id=${datasetId}` : "/alerts/rules"),
  deleteAlertRule: (id: string) => apiDelete<void>(`/alerts/rules/${id}`),
  testWebhook: (url: string, message?: string) =>
    apiPost<{ ok: boolean }>("/alerts/test-webhook", { url, message: message || "Foresee test alert" }),
  createAnnotation: (req: { dataset_id: string; date: string; label: string; note?: string }) =>
    apiPost<{ id: string }>("/annotations", req),
  listAnnotations: (datasetId: string) =>
    apiGet<Annotation[]>(`/annotations/${datasetId}`),
  deleteAnnotation: (id: string) => apiDelete<void>(`/annotations/${id}`),
  mintShare: (analysisId: string, expiresAt?: string) =>
    apiPost<{ token: string }>("/share/mint", { analysis_id: analysisId, expires_at: expiresAt }),
  resolveShare: (token: string) =>
    apiGet<{ id: string; kind: string; result: unknown; created_at: string }>(`/share/${token}`),
};
