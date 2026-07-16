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
 const queryClient = useQueryClient();

 const close = useCallback(() => {
 sourceRef.current?.close();
 sourceRef.current = null;
 }, []);

 const refreshProject = useCallback(() => {
 if (!projectId) return;
 // A finished stage changes readiness and run history, so both must refetch.
 queryClient.invalidateQueries({ queryKey: projectKeys.workflow(projectId) });
 queryClient.invalidateQueries({ queryKey: projectKeys.runs(projectId) });
 queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
 }, [projectId, queryClient]);

 const track = useCallback(
 (jobId: string) => {
 close();
 setState({ ...IDLE, jobId, status: "running" });

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
 // The stream ends when the job finishes; only report an error if the
 // job had not already reached a terminal state.
 setState((prev) =>
 prev.status === "running"
 ? { ...prev, status: "error", error: "Lost connection to the run." }
 : prev,
 );
 close();
 };
 },
 [close, refreshProject],
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
