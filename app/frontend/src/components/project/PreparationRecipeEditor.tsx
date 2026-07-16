import type { PreparationKind, PreparationStep } from "@/types/project";

const CLEANING_KINDS: PreparationKind[] = [
 "aggregate_duplicates",
 "insert_missing_periods",
 "impute",
 "winsorize",
];

const STEP_LABELS: Record<PreparationKind, string> = {
 aggregate_duplicates: "Aggregate duplicate timestamps",
 insert_missing_periods: "Insert missing periods",
 impute: "Fill missing values",
 winsorize: "Cap outliers",
 log: "Log transform",
 box_cox: "Box-Cox transform",
 diff: "First differencing",
 seasonal_diff: "Seasonal differencing",
};

const ADDABLE: { kind: PreparationKind; defaults: Partial<PreparationStep> }[] = [
 { kind: "impute", defaults: { method: "linear" } },
 { kind: "winsorize", defaults: { lower_quantile: 0.05, upper_quantile: 0.95 } },
 { kind: "log", defaults: {} },
 { kind: "box_cox", defaults: {} },
 { kind: "diff", defaults: { period: 1 } },
 { kind: "seasonal_diff", defaults: { period: 12 } },
];

interface Props {
 steps: PreparationStep[];
 onChange: (steps: PreparationStep[]) => void;
 disabled?: boolean;
}

function isCleaning(kind: PreparationKind) {
 return CLEANING_KINDS.includes(kind);
}

// The backend refuses a recipe that cleans after transforming, because the
// transforms would no longer have one well-defined input to prove the inverse
// against. Surfacing it here means the user sees it before running.
export function orderError(steps: PreparationStep[]): string | null {
 let seenTransform: PreparationKind | null = null;
 for (const step of steps) {
 if (!isCleaning(step.kind)) seenTransform = step.kind;
 else if (seenTransform) {
 return `${STEP_LABELS[step.kind]} must come before ${STEP_LABELS[seenTransform]}. Clean the history first, then transform it.`;
 }
 }
 return null;
}

export function PreparationRecipeEditor({ steps, onChange, disabled }: Props) {
 const error = orderError(steps);

 return (
 <section className="grid gap-3">
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Recipe
 </h2>

 {steps.length === 0 ? (
 <p className="text-[13px] text-text-secondary">
 No steps yet. The series will be modelled as it is.
 </p>
 ) : (
 <ol className="grid gap-1">
 {steps.map((step, index) => (
 <li
 key={`${step.kind}-${index}`}
 className="flex items-center justify-between gap-3 border border-border-strong/70 bg-bg-surface/40 px-3 py-2"
 >
 <span className="flex items-center gap-3">
 <span className="font-mono text-[10px] text-text-faint">{index + 1}</span>
 <span className="text-[13px] text-text-primary">
 {STEP_LABELS[step.kind]}
 </span>
 {step.method ? (
 <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 {step.method}
 </span>
 ) : null}
 {step.period ? (
 <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 period {step.period}
 </span>
 ) : null}
 </span>
 <button
 type="button"
 disabled={disabled}
 onClick={() => onChange(steps.filter((_, i) => i !== index))}
 className="border border-border-strong/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint hover:border-danger hover:text-danger disabled:opacity-40"
 aria-label={`Remove ${STEP_LABELS[step.kind]}`}
 >
 Remove
 </button>
 </li>
 ))}
 </ol>
 )}

 {error ? (
 <p role="alert" className="text-[12px] text-danger">
 {error}
 </p>
 ) : null}

 <div className="flex flex-wrap gap-1">
 {ADDABLE.map(({ kind, defaults }) => (
 <button
 key={kind}
 type="button"
 disabled={disabled}
 onClick={() => onChange([...steps, { kind, ...defaults }])}
 className="border border-border-strong/70 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
 >
 Add {STEP_LABELS[kind].toLowerCase()}
 </button>
 ))}
 </div>
 </section>
 );
}
