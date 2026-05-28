import { useEffect, useRef } from"react";
import { useJobsStore } from"@/stores/jobsStore";

interface JobProgressProps {
 jobId: string;
 kind: string;
 eventStreamUrl: string;
 onDone?: (result: unknown) => void;
 onError?: (error: string) => void;
 onCancel?: () => void;
 onReset?: () => void;
}

export function JobProgress({ jobId, kind, eventStreamUrl, onDone, onError, onCancel, onReset }: JobProgressProps) {
 const updateJob = useJobsStore((s) => s.updateJob);
 const job = useJobsStore((s) => s.jobs[jobId]);

 // Stable refs so the SSE effect below depends only on jobId/url/kind.
 // Without this, parent re-renders (e.g. from React Query background refetches
 // of useHealth) recreated the inline onDone closure, retriggered the effect,
 // and tore down the EventSource right before the"done"event arrived,
 // leaving the UI stuck at 100%.
 const onDoneRef = useRef(onDone);
 const onErrorRef = useRef(onError);
 const onCancelRef = useRef(onCancel);
 useEffect(() => {
 onDoneRef.current = onDone;
 onErrorRef.current = onError;
 onCancelRef.current = onCancel;
 }, [onDone, onError, onCancel]);

 useEffect(() => {
 updateJob(jobId, {
 job_id: jobId,
 kind,
 status:"running",
 progress: { current: 0, total: 0, stage:"queued" },
 result: null,
 error: null,
 });

 const es = new EventSource(eventStreamUrl);
 let settled = false;

 es.onmessage = (evt) => {
 try {
 const data = JSON.parse(evt.data);
 if (data.type ==="heartbeat") return;
 if (data.type ==="progress") {
 updateJob(jobId, { progress: data.progress, status:"running" });
 } else if (data.type ==="state") {
 updateJob(jobId, { status: data.status, progress: data.progress });
 // Do NOT close or settle here — the backend now follows up a terminal
 // state event with the actual"done"/"error"event carrying the payload.
 } else if (data.type ==="done") {
 settled = true;
 updateJob(jobId, { status:"done", result: data.result });
 onDoneRef.current?.(data.result);
 es.close();
 } else if (data.type ==="error") {
 settled = true;
 updateJob(jobId, { status:"error", error: data.error });
 onErrorRef.current?.(data.error);
 es.close();
 } else if (data.type ==="cancelled") {
 settled = true;
 updateJob(jobId, { status:"cancelled" });
 onCancelRef.current?.();
 es.close();
 }
 } catch {
 // ignore malformed SSE messages
 }
 };
 es.onerror = () => {
 // Browser will retry automatically if readyState is CONNECTING.
 // Only close if the stream is fully dead and we haven't settled yet.
 if (es.readyState === EventSource.CLOSED && !settled) {
 updateJob(jobId, {
 status:"error",
 error:"Connection lost before the job finished. Try running again.",
 });
 onErrorRef.current?.("connection lost");
 }
 };

 return () => {
 es.close();
 };
 }, [jobId, eventStreamUrl, kind, updateJob]);

 if (!job) return null;

 const pct = job.progress.total > 0 ? Math.round((job.progress.current / job.progress.total) * 100) : 0;

 return (
 <div className="rounded-panel border border-border bg-bg-surface p-4 space-y-2">
 <div className="flex items-center justify-between">
 <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
 {kind} job · {job.status}
 </p>
 <p className="font-mono text-xs text-text-secondary">{job.progress.stage ||"…"}</p>
 </div>
 <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
 <div
 className="h-full bg-accent transition-[width] duration-300"style={{ width: `${pct}%` }}
 />
 </div>
 <p className="font-mono text-xs text-text-muted">
 {job.progress.current}/{job.progress.total} · {pct}%
 </p>
 {job.status === "error" && (
 <div className="flex items-start justify-between gap-3 border border-anomaly/30 bg-anomaly/10 px-3 py-2">
 <p className="text-xs text-anomaly">
 {job.error || "Job failed. Adjust settings and try again."}
 </p>
 {onReset && (
 <button
 onClick={onReset}
 className="shrink-0 font-mono text-xs text-anomaly/70 hover:text-anomaly underline underline-offset-2 whitespace-nowrap"
 >
 Try again
 </button>
 )}
 </div>
 )}
 </div>
 );
}
