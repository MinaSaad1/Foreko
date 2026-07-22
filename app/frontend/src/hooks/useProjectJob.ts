import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/api/projects";

export interface JobProgress {
 current: number;
 total: number;
 stage: string;
}

export interface ProjectJobState {
 jobId: string | null;
 status: "idle" | "running" | "done" | "error" | "cancelled";
 progress: JobProgress | null;
 result: Record<string, unknown> | null;
 error: string | null;
}

const IDLE: ProjectJobState = {
 jobId: null,
 status: "idle",
 progress: null,
 result: null,
 error: null,
};

// The existing useJobEvents hardcodes the finetune SSE URL, so it cannot serve
// project stages. This one takes the job id and drives /api/project-jobs.
export function useProjectJob(projectId: string | undefined) {
 const [state, setState] = useState<ProjectJobState>(IDLE);
 const sourceRef = useRef<EventSource | null>(null);
 const retryRef = useRef<number | null>(null);
 const openRef = useRef<((jobId: string) => void) | null>(null);
 const statusRef = useRef(state.status);
 statusRef.current = state.status;
 const queryClient = useQueryClient();

 const close = useCallback(() => {
 sourceRef.current?.close();
 sourceRef.current = null;
 if (retryRef.current !== null) {
 window.clearTimeout(retryRef.current);
 retryRef.current = null;
 }
 }, []);

 const refreshProject = useCallback(() => {
 if (!projectId) return;
 // A finished stage changes readiness and run history, so both must refetch.
 queryClient.invalidateQueries({ queryKey: projectKeys.workflow(projectId) });
 queryClient.invalidateQueries({ queryKey: projectKeys.runs(projectId) });
 queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
 }, [projectId, queryClient]);

 // A run outlives its event stream. The job is backend state, so a dropped
 // stream is a question ("what happened?"), not an answer ("it failed").
 const reconcile = useCallback(
 async (jobId: string) => {
 try {
 const response = await fetch(`/api/project-jobs/${jobId}`);
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 const job = (await response.json()) as {
 status: string;
 progress: JobProgress | null;
 result: Record<string, unknown> | null;
 error: string | null;
 };
 if (job.status === "running") {
 setState((prev) => ({ ...prev, progress: job.progress ?? prev.progress }));
 // Reopen rather than give up. The delay keeps a backend that is busy
 // enough to drop streams from being hammered with reconnects.
 retryRef.current = window.setTimeout(() => openRef.current?.(jobId), 1000);
 return;
 }
 if (job.status === "done") {
 setState((prev) => ({ ...prev, status: "done", result: job.result }));
 } else if (job.status === "cancelled") {
 setState((prev) => ({ ...prev, status: "cancelled" }));
 } else {
 setState((prev) => ({
 ...prev,
 status: "error",
 error: job.error ?? "The run failed.",
 }));
 }
 refreshProject();
 } catch {
 // The backend itself is unreachable, so the run really is unobservable.
 setState((prev) =>
 prev.status === "running"
 ? { ...prev, status: "error", error: "Lost connection to the run." }
 : prev,
 );
 }
 },
 [refreshProject],
 );

 const open = useCallback(
 (jobId: string) => {
 close();

 const source = new EventSource(`/api/project-jobs/${jobId}/events`);
 sourceRef.current = source;

 source.onmessage = (event) => {
 let payload: Record<string, unknown>;
 try {
 payload = JSON.parse(event.data);
 } catch {
 return;
 }
 const type = payload.type as string;
 if (type === "heartbeat") return;
 if (type === "progress" || type === "state") {
 setState((prev) => ({
 ...prev,
 progress: (payload.progress as JobProgress) ?? prev.progress,
 }));
 return;
 }
 if (type === "done") {
 setState((prev) => ({
 ...prev,
 status: "done",
 result: (payload.result as Record<string, unknown>) ?? null,
 }));
 close();
 refreshProject();
 return;
 }
 if (type === "error") {
 setState((prev) => ({
 ...prev,
 status: "error",
 error: (payload.error as string) ?? "The run failed.",
 }));
 close();
 refreshProject();
 return;
 }
 if (type === "cancelled") {
 setState((prev) => ({ ...prev, status: "cancelled" }));
 close();
 refreshProject();
 }
 };

 source.onerror = () => {
 close();
 // The stream also ends normally when the job finishes, so only a run
 // still believed to be going is worth reconciling. Read through a ref
 // rather than a state updater: an updater can run twice, and asking the
 // backend about the same job twice is a side effect, not a reduction.
 if (statusRef.current === "running") void reconcile(jobId);
 };
 },
 [close, reconcile, refreshProject],
 );

 // Held in a ref because reconcile schedules a reopen and open closes over
 // reconcile, which would otherwise be a cycle between two callbacks.
 openRef.current = open;

 const track = useCallback(
 (jobId: string) => {
 // Set before the render that would set it, so a stream that fails
 // immediately is still recognised as belonging to a running job.
 statusRef.current = "running";
 setState({ ...IDLE, jobId, status: "running" });
 open(jobId);
 },
 [open],
 );

 const cancel = useCallback(async () => {
 if (!state.jobId) return;
 await fetch(`/api/project-jobs/${state.jobId}/cancel`, { method: "POST" });
 }, [state.jobId]);

 const reset = useCallback(() => {
 close();
 setState(IDLE);
 }, [close]);

 useEffect(() => close, [close]);

 return { ...state, track, cancel, reset };
}
