import { Link, useParams } from "react-router-dom";
import { PrepareStage } from "@/components/project/PrepareStage";
import { StudioStepper } from "@/components/project/StudioStepper";
import { ValidateStage } from "@/components/project/ValidateStage";
import { ForecastStage } from "@/components/project/ForecastStage";
import { PlanStage } from "@/components/project/PlanStage";
import { ReviewStage } from "@/components/project/ReviewStage";
import { useProject, useProjectWorkflow } from "@/hooks/useProject";
import { STAGE_LABELS, STUDIO_STAGES } from "@/types/project";
import type { StudioStage } from "@/types/project";

function isStage(value: string | undefined): value is StudioStage {
 return Boolean(value) && STUDIO_STAGES.includes(value as StudioStage);
}

export function ForecastStudioPage() {
 const { projectId, stage } = useParams<{ projectId: string; stage: string }>();
 const { data: project, isPending, isError, error } = useProject(projectId);
 const { data: workflow } = useProjectWorkflow(projectId);

 if (isPending) return <p className="text-[13px] text-text-muted">Loading project…</p>;
 if (isError || !project) {
 return (
 <p role="alert" className="text-[13px] text-anomaly">
 {(error as Error)?.message ?? "Project not found."}
 </p>
 );
 }
 if (!isStage(stage)) {
 return (
 <p role="alert" className="text-[13px] text-anomaly">
 Unknown studio stage.
 </p>
 );
 }
 if (!workflow) return <p className="text-[13px] text-text-muted">Loading workflow…</p>;

 const state = workflow.stages[stage];

 return (
 <div className="flex flex-col gap-6">
 <header className="grid gap-3 border-b border-border-strong/70 pb-4">
 <Link
 to={`/projects/${project.id}`}
 className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent"
 >
 {project.name}
 </Link>
 <StudioStepper projectId={project.id} active={stage} workflow={workflow} />
 </header>

 {!project.config ? (
 <NeedsSetup projectId={project.id} />
 ) : state?.status === "blocked" ? (
 <BlockedStage stage={stage} reason={state.reason} projectId={project.id} />
 ) : stage === "prepare" ? (
 <PrepareStage project={project} workflow={workflow} />
 ) : stage === "validate" ? (
 <ValidateStage project={project} workflow={workflow} />
 ) : stage === "forecast" ? (
 <ForecastStage project={project} workflow={workflow} />
 ) : stage === "plan" ? (
 <PlanStage project={project} workflow={workflow} />
 ) : stage === "review" ? (
 <ReviewStage project={project} workflow={workflow} />
 ) : (
 <NotBuiltYet stage={stage} />
 )}
 </div>
 );
}

function NeedsSetup({ projectId }: { projectId: string }) {
 // No revision means no columns, no horizon, and no candidates, so every stage
 // would only be able to refuse. Say that once, here, with the way out.
 return (
 <div className="border border-border-strong/70 bg-bg-surface/40 p-6">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 Set up the project first
 </h1>
 <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 This project has no configuration yet, so no stage can run. Choose the date
 and value columns, the horizon, and the models to compare.
 </p>
 <Link
 to={`/projects/${projectId}/setup`}
 className="mt-4 inline-block border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:bg-accent/10"
 >
 Set up project
 </Link>
 </div>
 );
}

function BlockedStage({
 stage,
 reason,
 projectId,
}: {
 stage: StudioStage;
 reason: string;
 projectId: string;
}) {
 // A blocked stage is reachable on purpose, so it has to explain itself rather
 // than just refuse.
 const previous = STUDIO_STAGES[STUDIO_STAGES.indexOf(stage) - 1];
 return (
 <div className="border border-border-strong/70 bg-bg-surface/40 p-6">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 {STAGE_LABELS[stage]}
 </h1>
 <p className="mt-2 text-[13px] text-text-secondary">{reason}</p>
 {previous ? (
 <Link
 to={`/projects/${projectId}/studio/${previous}`}
 className="mt-4 inline-block border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:bg-accent/10"
 >
 Go to {STAGE_LABELS[previous]}
 </Link>
 ) : null}
 </div>
 );
}

function NotBuiltYet({ stage }: { stage: StudioStage }) {
 return (
 <div className="border border-border-strong/70 bg-bg-surface/40 p-6">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 {STAGE_LABELS[stage]}
 </h1>
 <p className="mt-2 text-[13px] text-text-secondary">
 This stage is not implemented yet.
 </p>
 </div>
 );
}
