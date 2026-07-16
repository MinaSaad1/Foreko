import type { CovariateRole } from "@/types/project";

// Hand-mirrored from GET /api/projects/{id}/factor-plan and the forecast job's
// serialized result in app/backend/foreko/routers/project_jobs.py.

export type FillPolicy = "none" | "forward_fill" | "zero";

export interface FactorPlanRequirements {
 periods: string[];
 required: string[];
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
