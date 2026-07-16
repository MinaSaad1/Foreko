import { apiDelete, apiGet, apiPatch, apiPost } from "@/api/client";
import type {
 ProjectCreate,
 ProjectDetail,
 ProjectPatch,
 ProjectRevision,
 ProjectRevisionCreate,
 ProjectRun,
 ProjectSummary,
 WorkflowState,
} from "@/types/project";

export const projectApi = {
 list: (includeArchived = false) =>
 apiGet<ProjectSummary[]>(`/projects?include_archived=${includeArchived}`),
 get: (id: string) => apiGet<ProjectDetail>(`/projects/${id}`),
 create: (body: ProjectCreate) => apiPost<ProjectDetail>("/projects", body),
 patch: (id: string, body: ProjectPatch) =>
 apiPatch<ProjectDetail>(`/projects/${id}`, body),
 remove: (id: string) => apiDelete<void>(`/projects/${id}?confirm=true`),
 listRevisions: (id: string) =>
 apiGet<ProjectRevision[]>(`/projects/${id}/revisions`),
 createRevision: (id: string, body: ProjectRevisionCreate) =>
 apiPost<ProjectRevision>(`/projects/${id}/revisions`, body),
 listRuns: (id: string) => apiGet<ProjectRun[]>(`/projects/${id}/runs`),
 workflow: (id: string) => apiGet<WorkflowState>(`/projects/${id}/workflow`),
};

export const projectKeys = {
 all: ["projects"] as const,
 list: (includeArchived: boolean) => ["projects", "list", includeArchived] as const,
 detail: (id: string) => ["projects", "detail", id] as const,
 revisions: (id: string) => ["projects", "revisions", id] as const,
 runs: (id: string) => ["projects", "runs", id] as const,
 workflow: (id: string) => ["projects", "workflow", id] as const,
};
