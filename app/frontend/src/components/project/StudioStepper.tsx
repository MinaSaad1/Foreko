import { Link } from "react-router-dom";
import {
 STAGE_LABELS,
 STAGE_STATUS_LABELS,
 STUDIO_STAGES,
} from "@/types/project";
import type { StageStatus, StudioStage, WorkflowState } from "@/types/project";

interface Props {
 projectId: string;
 active: StudioStage;
 workflow: WorkflowState;
}

// Status is carried by the accessible name and a text marker, never by colour
// alone. Colour is decoration on top of that.
const STATUS_MARK: Record<StageStatus, string> = {
 complete: "done",
 ready: "ready",
 needs_attention: "check",
 blocked: "locked",
 not_started: "todo",
};

const STATUS_CLASS: Record<StageStatus, string> = {
 complete: "border-accent/70 text-accent",
 ready: "border-accent/40 text-text-primary",
 needs_attention: "border-warn/60 text-warn",
 blocked: "border-border/40 text-text-faint",
 not_started: "border-border-strong/70 text-text-secondary",
};

export function StudioStepper({ projectId, active, workflow }: Props) {
 return (
 <nav aria-label="Forecast Studio stages">
 <ol className="flex flex-wrap gap-1">
 {STUDIO_STAGES.map((stage, index) => {
 const state = workflow.stages[stage];
 const status = state?.status ?? "not_started";
 const label = STAGE_LABELS[stage];
 const isActive = stage === active;

 const accessibleName = `${label} ${STAGE_STATUS_LABELS[status]}`;
 const body = (
 <>
 <span className="font-mono text-[10px] text-text-faint" aria-hidden>
 {index + 1}
 </span>
 <span className="text-[12px]">{label}</span>
 <span
 className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-80"
 aria-hidden
 >
 {STATUS_MARK[status]}
 </span>
 </>
 );

 const shared = `flex items-center gap-2 border px-3 py-2 transition-colors ${
 STATUS_CLASS[status]
 } ${isActive ? "bg-bg-surface" : "bg-transparent"}`;

 // Every stage stays a link, including a blocked one. The stage itself
 // explains what is missing, and a disabled element would be
 // unreachable by keyboard, so the reason would be unreadable to
 // exactly the users who need it stated rather than shown in colour.
 return (
 <li key={stage}>
 <Link
 to={`/projects/${projectId}/studio/${stage}`}
 className={`${shared} hover:border-accent`}
 aria-label={accessibleName}
 aria-current={isActive ? "step" : undefined}
 title={state?.reason}
 >
 {body}
 </Link>
 </li>
 );
 })}
 </ol>
 </nav>
 );
}
