import { Link, useParams } from "react-router-dom";
import { ProjectHealthBadge } from "@/components/project/ProjectHealthBadge";
import { StudioStepper } from "@/components/project/StudioStepper";
import {
 useDeleteProject,
 usePatchProject,
 useProject,
 useProjectWorkflow,
} from "@/hooks/useProject";
import { STAGE_LABELS } from "@/types/project";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export function ProjectOverviewPage() {
 const { projectId } = useParams<{ projectId: string }>();
 const navigate = useNavigate();
 const { data: project, isPending, isError, error } = useProject(projectId);
 const { data: workflow } = useProjectWorkflow(projectId);
 const patch = usePatchProject();
 const remove = useDeleteProject();
 const [confirmingDelete, setConfirmingDelete] = useState(false);

 if (isPending) return <p className="text-[13px] text-text-muted">Loading project…</p>;
 if (isError || !project) {
 return (
 <p role="alert" className="text-[13px] text-anomaly">
 {(error as Error)?.message ?? "Project not found."}
 </p>
 );
 }

 const nextStage = workflow?.next_stage ?? null;

 return (
 <div className="flex flex-col gap-6">
 <header className="flex items-end justify-between gap-4 border-b border-border-strong/70 pb-4">
 <div className="min-w-0">
 <Link
 to="/projects"
 className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent"
 >
 Projects
 </Link>
 <h1 className="mt-2 truncate font-display text-[2rem] leading-[1.1] font-medium text-text-primary">
 {project.name}
 </h1>
 </div>
 <ProjectHealthBadge workflow={workflow} isArchived={project.is_archived} />
 </header>

 {workflow ? (
 <StudioStepper
 projectId={project.id}
 active={nextStage ?? "prepare"}
 workflow={workflow}
 />
 ) : null}

 <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border border-border-strong/70 bg-bg-surface/40 p-4 md:grid-cols-4">
 <Fact label="Dataset" value={project.dataset_id} />
 <Fact label="Revision" value={String(project.current_revision)} />
 <Fact label="Horizon" value={project.config ? String(project.config.horizon) : "not set"} />
 <Fact label="Frequency" value={project.config?.frequency ?? "not set"} />
 </dl>

 {!project.config ? (
 <div className="flex flex-wrap items-center gap-3">
 <Link
 to={`/projects/${project.id}/setup`}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10"
 >
 Set up project
 </Link>
 <span className="text-[12px] text-text-secondary">
 Pick the date and value columns, the horizon, and the models to compare.
 Nothing can run until this is set.
 </span>
 </div>
 ) : nextStage ? (
 <div className="flex items-center gap-3">
 <Link
 to={`/projects/${project.id}/studio/${nextStage}`}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10"
 >
 Continue: {STAGE_LABELS[nextStage]}
 </Link>
 <span className="text-[12px] text-text-secondary">
 {workflow?.stages[nextStage]?.reason}
 </span>
 </div>
 ) : null}

 <section className="flex flex-wrap gap-2 border-t border-border-strong/70 pt-4">
 {project.config ? (
 <Link
 to={`/projects/${project.id}/setup`}
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:border-accent hover:text-accent"
 >
 Edit setup
 </Link>
 ) : null}
 <Link
 to={`/projects/${project.id}/runs`}
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:border-accent hover:text-accent"
 >
 Run history
 </Link>
 <button
 type="button"
 onClick={() =>
 patch.mutate({ id: project.id, body: { archived: !project.is_archived } })
 }
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:border-accent hover:text-accent"
 >
 {project.is_archived ? "Reopen project" : "Archive project"}
 </button>

 {confirmingDelete ? (
 <span className="flex items-center gap-2">
 <span className="text-[12px] text-text-secondary">
 Delete permanently? The source dataset is kept.
 </span>
 <button
 type="button"
 onClick={() =>
 remove.mutate(project.id, { onSuccess: () => navigate("/projects") })
 }
 className="border border-anomaly/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-anomaly"
 >
 Confirm delete
 </button>
 <button
 type="button"
 onClick={() => setConfirmingDelete(false)}
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
 >
 Cancel
 </button>
 </span>
 ) : (
 <button
 type="button"
 onClick={() => setConfirmingDelete(true)}
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint hover:border-anomaly hover:text-anomaly"
 >
 Delete project
 </button>
 )}
 </section>
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
