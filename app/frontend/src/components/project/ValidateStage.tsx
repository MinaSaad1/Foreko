import { useEffect, useState } from "react";
import { PortfolioExceptionsTable } from "@/components/project/PortfolioExceptionsTable";
import { ValidationLeaderboard } from "@/components/project/ValidationLeaderboard";
import { useProjectJob } from "@/hooks/useProjectJob";
import { useProjectRuns } from "@/hooks/useProject";
import type { ProjectDetail, WorkflowState } from "@/types/project";
import type { ValidationResult } from "@/types/validation";

interface Props {
 project: ProjectDetail;
 workflow: WorkflowState;
}

export function ValidateStage({ project, workflow }: Props) {
 const job = useProjectJob(project.id);
 const { data: runs } = useProjectRuns(project.id);
 const [result, setResult] = useState<ValidationResult | null>(null);

 const stage = workflow.stages.validate;
 const running = job.status === "running";

 // Reopening the project must show the evidence without rerunning it.
 useEffect(() => {
 if (job.result) {
 setResult(job.result as unknown as ValidationResult);
 return;
 }
 const done = runs?.find(
 (r) =>
 r.stage === "validate" &&
 r.status === "done" &&
 r.revision_no === project.current_revision,
 );
 if (done?.summary && "series_policies" in done.summary) {
 setResult(done.summary as unknown as ValidationResult);
 }
 }, [job.result, runs, project.current_revision]);

 async function run() {
 const response = await fetch(`/api/projects/${project.id}/validate`, {
 method: "POST",
 });
 const body = await response.json();
 if (!response.ok) {
 window.alert(body.detail ?? "Validation could not start.");
 return;
 }
 job.track(body.job_id);
 }

 const config = project.config;

 return (
 <div className="grid gap-6">
 <header className="grid gap-1">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 Validate
 </h1>
 <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 Score every candidate across rolling folds and pick a champion per series.
 This is the evidence the forecast rests on, not a single holdout.
 </p>
 <p className="text-[12px] text-text-muted">{stage?.reason}</p>
 </header>

 {config ? (
 <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border border-border-strong/70 bg-bg-surface/40 p-4 md:grid-cols-4">
 <Fact label="Candidates" value={config.candidate_models.join(", ")} />
 <Fact label="Folds" value={String(config.folds)} />
 <Fact label="Horizon" value={String(config.horizon)} />
 <Fact label="Primary metric" value={config.primary_metric.toUpperCase()} />
 </dl>
 ) : null}

 <div className="flex flex-wrap items-center gap-3 border-t border-border-strong/70 pt-4">
 <button
 type="button"
 onClick={run}
 disabled={running}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
 >
 Run validation
 </button>
 {running ? (
 <button
 type="button"
 onClick={job.cancel}
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
 >
 Cancel
 </button>
 ) : null}
 {config ? (
 <span className="text-[12px] text-text-muted">
 {config.candidate_models.length} candidates x {config.folds} folds per series.
 </span>
 ) : null}
 </div>

 {running && job.progress ? (
 <p aria-live="polite" className="font-mono text-[11px] text-text-secondary">
 {job.progress.stage} ({job.progress.current}/{job.progress.total})
 </p>
 ) : null}

 {job.status === "error" ? (
 <p role="alert" className="text-[13px] text-anomaly">
 {job.error}
 </p>
 ) : null}

 {result ? (
 <div className="grid gap-6" aria-live="polite">
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
 Selected policy
 </p>
 <ValidationLeaderboard result={result} />
 <PortfolioExceptionsTable result={result} />
 </div>
 ) : null}
 </div>
 );
}

function Fact({ label, value }: { label: string; value: string }) {
 return (
 <div className="min-w-0">
 <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 {label}
 </dt>
 <dd className="mt-1 truncate font-mono text-[12px] text-text-primary">{value}</dd>
 </div>
 );
}
