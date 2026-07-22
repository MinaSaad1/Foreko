import { useState } from "react";
import { Link } from "react-router-dom";
import {
 orderError,
 PreparationRecipeEditor,
} from "@/components/project/PreparationRecipeEditor";
import { useCreateRevision } from "@/hooks/useProject";
import { useProjectJob } from "@/hooks/useProjectJob";
import type { PreparationStep, ProjectDetail, WorkflowState } from "@/types/project";

interface Props {
 project: ProjectDetail;
 workflow: WorkflowState;
}

export function PrepareStage({ project, workflow }: Props) {
 const initial = project.config?.preparation_steps ?? [];
 const [steps, setSteps] = useState<PreparationStep[]>(initial);
 const createRevision = useCreateRevision(project.id);
 const job = useProjectJob(project.id);

 const stage = workflow.stages.prepare;
 const invalid = orderError(steps);
 const dirty = JSON.stringify(steps) !== JSON.stringify(initial);
 const running = job.status === "running";
 const canRun = !invalid && !running && project.config !== null;

 async function run() {
 if (!project.config) return;
 // Saving a changed recipe creates a new revision before the job starts, so
 // the run is always linked to the exact configuration that produced it.
 if (dirty) {
 await createRevision.mutateAsync({
 ...project.config,
 preparation_steps: steps,
 });
 }
 const response = await fetch(`/api/projects/${project.id}/prepare`, {
 method: "POST",
 });
 const body = await response.json();
 if (!response.ok) {
 window.alert(body.detail ?? "Prepare could not start.");
 return;
 }
 job.track(body.job_id);
 }

 return (
 <div className="grid gap-6">
 <header className="grid gap-1">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 Prepare
 </h1>
 <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 Clean the history and put it on a scale the models can work with. Every step
 is saved with the project and must be reversible, so forecasts come back on
 the scale you started with.
 </p>
 <p className="text-[12px] text-text-muted">{stage?.reason}</p>
 </header>

 <PreparationRecipeEditor steps={steps} onChange={setSteps} disabled={running} />

 <div className="flex flex-wrap items-center gap-3 border-t border-border-strong/70 pt-4">
 <button
 type="button"
 onClick={run}
 disabled={!canRun}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
 >
 Run prepare
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
 {!project.config ? (
 <span className="text-[12px] text-text-muted">
 The project has no configuration yet.{" "}
 <Link to={`/projects/${project.id}/setup`} className="text-accent">
 Set it up
 </Link>{" "}
 before preparing.
 </span>
 ) : dirty ? (
 <span className="text-[12px] text-text-muted">
 Running saves this recipe as a new revision.
 </span>
 ) : null}
 </div>

 {job.progress && running ? (
 <p aria-live="polite" className="font-mono text-[11px] text-text-secondary">
 {job.progress.stage} ({job.progress.current}/{job.progress.total})
 </p>
 ) : null}

 {job.status === "error" ? (
 <p role="alert" className="text-[13px] text-anomaly">
 {job.error}
 </p>
 ) : null}

 {job.status === "done" ? (
 <div aria-live="polite" className="border border-accent/40 bg-bg-surface/40 p-4">
 <p className="text-[13px] text-accent">Prepare complete</p>
 <p className="mt-1 font-mono text-[11px] text-text-secondary">
 {String(job.result?.series_count ?? 0)} series ·{" "}
 {String(job.result?.row_count ?? 0)} rows
 </p>
 {Array.isArray(job.result?.notes) && (job.result?.notes as string[]).length ? (
 <ul className="mt-2 grid gap-1">
 {(job.result?.notes as string[]).map((note) => (
 <li key={note} className="text-[12px] text-text-secondary">
 {note}
 </li>
 ))}
 </ul>
 ) : null}
 </div>
 ) : null}
 </div>
 );
}
