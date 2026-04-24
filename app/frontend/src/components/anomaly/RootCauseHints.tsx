import type { RootCauseExplanation, RootCauseResult } from "@/types/phases";

interface Props {
  data: RootCauseResult;
}

export function RootCauseHints({ data }: Props) {
  if (!data.explanations.length) {
    return (
      <div className="rounded-panel border border-border bg-bg-surface px-5 py-4 text-sm text-text-muted">
        No factors were associated with the detected anomalies.
      </div>
    );
  }
  return (
    <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
      <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
        Root-cause hints
      </h3>
      <p className="text-xs text-text-muted">
        Analyzed {data.n_anomalies} anomalies against the selected factors. Stronger signals appear first.
      </p>
      <div className="space-y-2">
        {data.explanations.map((e) => (
          <Hint key={e.factor + e.kind} e={e} />
        ))}
      </div>
    </div>
  );
}

function Hint({ e }: { e: RootCauseExplanation }) {
  const tone =
    e.strength === "strong" ? "border-accent/40 bg-accent-dim"
      : e.strength === "mild" ? "border-warning/30 bg-warning/5"
        : "border-border bg-bg-elevated";
  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm text-text-primary">{e.factor}</p>
        <span className="font-mono text-xs uppercase tracking-widest text-text-muted">{e.strength}</span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {e.kind === "numeric" ? (
          <>
            On anomaly days the mean was <span className="text-text-primary">{e.anomaly_mean}</span> vs baseline{" "}
            <span className="text-text-primary">{e.baseline_mean}</span> · z = {e.z_score}
          </>
        ) : (
          <>
            Category <span className="text-text-primary">{e.top_category}</span> was{" "}
            {e.direction} on anomaly days ({((e.anomaly_share ?? 0) * 100).toFixed(0)}% vs baseline{" "}
            {((e.baseline_share ?? 0) * 100).toFixed(0)}%, lift {((e.lift ?? 0) * 100).toFixed(0)}pp)
          </>
        )}
      </p>
    </div>
  );
}
