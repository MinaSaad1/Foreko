import type { CovariateRole } from "@/types/project";

// Hand-mirrored from GET /api/projects/{id}/factor-plan and the forecast job's
// serialized result in app/backend/foreko/routers/project_jobs.py.

export type FillPolicy = "none" | "forward_fill" | "zero";

export interface FactorPlanRequirements {
 periods: string[];
 required: string[];
 /** Declared known-future, but no selected model can read them. */
 ignored_by_policy?: string[];
 roles: Record<string, CovariateRole>;
 calendar: Record<string, Record<string, number>>;
}

export interface AppliedFill {
 covariate: string;
 policy: FillPolicy;
 periods: string[];
}

export interface SeriesForecast {
 series_id: string;
 model: string;
 dates: string[];
 point: number[];
 p10: number[];
 p90: number[];
 ensemble_weights: Record<string, number>;
}

export interface SeriesException {
 series_id: string;
 reason: string;
 model: string | null;
}

export interface ForecastRunResult {
 series: SeriesForecast[];
 exceptions: SeriesException[];
 series_count: number;
 exception_count: number;
 assumptions: Record<string, Record<string, number | string>>;
 applied_fills: AppliedFill[];
 periods: string[];
}

export interface SeriesDelta {
 series_id: string;
 dates: string[];
 baseline: number[];
 scenario: number[];
 absolute: number[];
 percent: (number | null)[];
 cumulative_absolute: number;
 baseline_total: number;
 scenario_total: number;
 total_percent: number | null;
}

export interface ScenarioDeltas {
 series: SeriesDelta[];
 only_in_baseline: string[];
 only_in_scenario: string[];
 portfolio: {
 baseline_total: number;
 scenario_total: number;
 absolute: number;
 percent: number | null;
 };
}

export interface ScenarioSummary {
 run_id: string;
 name: string;
 revision_no: number;
 created_at: string;
 status: string;
 deltas: ScenarioDeltas | null;
 assumptions: Record<string, Record<string, number | string>>;
 applied_fills: AppliedFill[];
}
