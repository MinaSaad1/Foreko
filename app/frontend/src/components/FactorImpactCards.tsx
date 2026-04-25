import type { FactorImpact } from"@/types/factors";

interface FactorImpactCardsProps {
  impact: FactorImpact;
  horizon: number;
}

function formatNumber(n: number, digits: number = 0): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(digits);
}

export function FactorImpactCards({ impact, horizon }: FactorImpactCardsProps) {
  const pct = (impact.delta_percent * 100).toFixed(1);
  const arrow = impact.direction ==="up" ?"▲" : impact.direction ==="down" ?"▼" :"·";

  const deltaValueColor =
    impact.direction ==="up"
      ?"text-positive"
      : impact.direction ==="down"
        ?"text-anomaly"
        :"text-text-primary";
  const deltaStripe =
    impact.direction ==="up"
      ?"bg-positive"
      : impact.direction ==="down"
        ?"bg-anomaly"
        :"bg-border-strong";

  const deltaSign = impact.delta_absolute >= 0 ?"+" :"";
  const pctSign = impact.delta_percent >= 0 ?"+" :"";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {/* Impact on total */}
      <div className="relative overflow-hidden rounded-panel border border-border bg-bg-surface p-5">
        <span className={`absolute left-0 top-0 h-full w-1 ${deltaStripe}`} aria-hidden />
        <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
          Impact on total · next {horizon} periods
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className={`font-display text-3xl font-semibold ${deltaValueColor}`}>
            {arrow}
          </span>
          <span className={`font-display text-3xl font-semibold ${deltaValueColor}`}>
            {deltaSign}
            {formatNumber(impact.delta_absolute)}
          </span>
        </div>
        <p className={`mt-2 font-mono text-xs ${deltaValueColor}`}>
          {pctSign}
          {pct}% <span className="text-text-muted">vs baseline</span>
        </p>
      </div>

      {/* Baseline reference */}
      <div className="relative overflow-hidden rounded-panel border border-border bg-bg-surface p-5">
        <span className="absolute left-0 top-0 h-full w-1 bg-neutral" aria-hidden />
        <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
          Baseline · no factors
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-text-primary">
            {formatNumber(impact.total_baseline)}
          </span>
        </div>
        <p className="mt-2 font-mono text-xs text-text-muted">
          pure time-series pattern
        </p>
      </div>

      {/* With factors */}
      <div className="relative overflow-hidden rounded-panel border border-accent/40 bg-bg-surface p-5">
        <span className="absolute left-0 top-0 h-full w-1 bg-accent" aria-hidden />
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          With factors
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-accent">
            {formatNumber(impact.total_with_factors)}
          </span>
        </div>
        <p className="mt-2 font-mono text-xs text-text-secondary">
          {impact.top_driver ? (
            <>
              <span className="text-text-muted">top driver:</span> {impact.top_driver}
            </>
          ) : ("forecast adjusted by factors"
          )}
        </p>
      </div>
    </div>
  );
}
