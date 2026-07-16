import type { ColumnMapping } from "@/types/dataset";

// Hand-mirrored from app/backend/foreko/schemas/project.py. There is no codegen
// step, so a wire change is a two-sided edit.

export type StudioStage = "prepare" | "validate" | "forecast" | "plan" | "review";

export type StageStatus =
 | "not_started"
 | "needs_attention"
 | "ready"
 | "complete"
 | "blocked";

export type ProjectStatus = "draft" | "ready";

export type RunStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type ModelId =
 | "timesfm"
 | "lightgbm"
 | "ets"
 | "seasonal_naive"
 | "arima"
 | "prophet";

export type PrimaryMetric = "mase" | "wape" | "smape";

export type PreparationKind =
 | "aggregate_duplicates"
 | "insert_missing_periods"
 | "impute"
 | "winsorize"
 | "log"
 | "box_cox"
 | "diff"
 | "seasonal_diff";

export type CovariateRole =
 | "historical_only"
 | "known_future_numerical"
 | "known_future_categorical"
 | "calendar_generated"
 | "static_numerical"
 | "static_categorical"
 | "scenario_controlled";

export interface PreparationStep {
 kind: PreparationKind;
 method?: string | null;
 period?: number | null;
 lower_quantile?: number | null;
 upper_quantile?: number | null;
}

export interface ProjectRevisionCreate {
 mapping: ColumnMapping;
 frequency: string;
 horizon: number;
 preparation_steps: PreparationStep[];
 candidate_models: ModelId[];
 folds: number;
 primary_metric: PrimaryMetric;
 covariate_roles: Record<string, CovariateRole>;
 champion_override?: Record<string, string>;
}

export interface ProjectSummary {
 schema_version: 1;
 id: string;
 name: string;
 description: string;
 dataset_id: string;
 status: ProjectStatus;
 current_revision: number;
 created_at: string;
 updated_at: string;
 archived_at: string | null;
 is_archived: boolean;
}

export interface ProjectDetail extends ProjectSummary {
 config: ProjectRevisionCreate | null;
}

export interface ProjectRevision {
 schema_version: 1;
 id: string;
 project_id: string;
 revision_no: number;
 created_at: string;
 config: ProjectRevisionCreate;
}

export interface ProjectRun {
 schema_version: 1;
 id: string;
 project_id: string;
 revision_no: number;
 stage: StudioStage;
 status: RunStatus;
 job_id: string | null;
 started_at: string;
 completed_at: string | null;
 artifact_path: string | null;
 summary: Record<string, unknown>;
 error: string | null;
}

export interface ProjectCreate {
 name: string;
 dataset_id: string;
 description?: string;
}

export interface ProjectPatch {
 name?: string;
 description?: string;
 archived?: boolean;
}

export interface StageState {
 stage: StudioStage;
 status: StageStatus;
 reason: string;
 run_id: string | null;
}

export interface WorkflowState {
 project_id: string;
 revision: number;
 next_stage: StudioStage | null;
 stages: Record<StudioStage, StageState>;
}

export const STUDIO_STAGES: StudioStage[] = [
 "prepare",
 "validate",
 "forecast",
 "plan",
 "review",
];

export const STAGE_LABELS: Record<StudioStage, string> = {
 prepare: "Prepare",
 validate: "Validate",
 forecast: "Forecast",
 plan: "Plan",
 review: "Review",
};

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
 not_started: "not started",
 needs_attention: "needs attention",
 ready: "ready",
 complete: "complete",
 blocked: "blocked",
};
