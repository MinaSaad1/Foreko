import { STAGE_LABELS, STAGE_STATUS_LABELS } from "@/types/project";
import type { WorkflowState } from "@/types/project";

interface Props {
 workflow: WorkflowState | undefined;
 isArchived?: boolean;
}

// The badge states the next action in words. Two projects with different health
// must never be distinguishable by colour alone.
export function ProjectHealthBadge({ workflow, isArchived = false }: Props) {
 if (isArchived) {
 return <Badge tone="muted" text="Archived" />;
 }
 if (!workflow) {
 return <Badge tone="muted" text="Not configured" />;
 }

 const next = workflow.next_stage;
 if (next === null) {
 return <Badge tone="accent" text="Complete" />;
 }

 const state = workflow.stages[next];
 const label = STAGE_LABELS[next];
 if (state?.status === "needs_attention") {
 return <Badge tone="warn" text={`${label} ${STAGE_STATUS_LABELS.needs_attention}`} />;
 }
 return <Badge tone="plain" text={`Next: ${label}`} />;
}

function Badge({
 tone,
 text,
}: {
 tone: "accent" | "warn" | "muted" | "plain";
 text: string;
}) {
 const toneClass = {
 accent: "border-accent/60 text-accent",
 warn: "border-warning/60 text-warning",
 muted: "border-border/50 text-text-faint",
 plain: "border-border-strong/70 text-text-secondary",
 }[tone];

 return (
 <span
 className={`inline-block border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClass}`}
 >
 {text}
 </span>
 );
}
