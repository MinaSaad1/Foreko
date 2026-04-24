import { useEffect } from "react";
import { useJobsStore } from "@/stores/jobsStore";

interface JobProgressProps {
  jobId: string;
  kind: string;
  eventStreamUrl: string;
  onDone?: (result: unknown) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export function JobProgress({ jobId, kind, eventStreamUrl, onDone, onError, onCancel }: JobProgressProps) {
  const updateJob = useJobsStore((s) => s.updateJob);
  const job = useJobsStore((s) => s.jobs[jobId]);

  useEffect(() => {
    updateJob(jobId, {
      job_id: jobId,
      kind,
      status: "running",
      progress: { current: 0, total: 0, stage: "queued" },
      result: null,
      error: null,
    });

    const es = new EventSource(eventStreamUrl);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "heartbeat") return;
        if (data.type === "progress") {
          updateJob(jobId, { progress: data.progress, status: "running" });
        } else if (data.type === "state") {
          updateJob(jobId, { status: data.status, progress: data.progress });
        } else if (data.type === "done") {
          updateJob(jobId, { status: "done", result: data.result });
          onDone?.(data.result);
          es.close();
        } else if (data.type === "error") {
          updateJob(jobId, { status: "error", error: data.error });
          onError?.(data.error);
          es.close();
        } else if (data.type === "cancelled") {
          updateJob(jobId, { status: "cancelled" });
          onCancel?.();
          es.close();
        }
      } catch (e) {
        // ignore malformed SSE messages
      }
    };
    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [jobId, eventStreamUrl, kind, updateJob, onDone, onError, onCancel]);

  if (!job) return null;

  const pct = job.progress.total > 0 ? Math.round((job.progress.current / job.progress.total) * 100) : 0;

  return (
    <div className="rounded-panel border border-border bg-bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
          {kind} job · {job.status}
        </p>
        <p className="font-mono text-xs text-text-secondary">{job.progress.stage || "…"}</p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="font-mono text-xs text-text-muted">
        {job.progress.current}/{job.progress.total} · {pct}%
      </p>
      {job.error && (
        <p className="rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-xs text-anomaly">
          {job.error}
        </p>
      )}
    </div>
  );
}
