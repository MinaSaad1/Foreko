import type { FactorImpact } from "@/types/factors";

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

/**
 * What the factors are worth, next to what the forecast said without them.
 *
 * Previously three identical cards, each with a 4px coloured side stripe and
 * its own 3xl number. That was four bans in sixty lines: side-stripe accents,
 * an identical-card grid, the hero-metric template, and three numbers at the
 * same size so none of them led. The stripes were also aria-hidden, which made
 * colour the only channel carrying direction.
 *
 * Now: one seam grid, no stripes, and the delta is the only 3xl number, because
 * the delta is the answer. Baseline and with-factors are what it is measured
 * against, so they sit a step down.
 */
export function FactorImpactCards({ impact, horizon }: FactorImpactCardsProps) {
  const pct = (impact.delta_percent * 100).toFixed(1);
  const arrow = impact.direction === "up" ? "▲" : impact.direction === "down" ? "▼" : "·";

  const deltaValueColor =
    impact.direction === "up"
      ? "text-positive"
      : impact.direction === "down"
        ? "text-anomaly"
        : "text-text-primary";

  // Direction in words. The arrow is decoration on top of this, not instead of
  // it, so the reading survives colour being ignored or indistinguishable.
  const directionWord =
    impact.direction === "up"
      ? "higher than baseline"
      : impact.direction === "down"
        ? "lower than baseline"
        : "level with baseline";

  const deltaSign = impact.delta_absolute >= 0 ? "+" : "";
  const pctSign = impact.delta_percent >= 0 ? "+" : "";

  return (
    <div className="grid grid-cols-1 border-l border-t border-border-strong/70 md:grid-cols-3">
      {/* The answer. The only 3xl number here. */}
      <div className="border-r border-b border-border-strong/70 bg-bg-surface p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Impact on total, next {horizon} periods
        </p>
        <p className={`mt-3 font-display text-3xl font-semibold ${deltaValueColor}`}>
          <span aria-hidden>{arrow}</span> {deltaSign}
          {formatNumber(impact.delta_absolute)}
        </p>
        <p className="mt-2 text-[13px] text-text-secondary">
          <span className={deltaValueColor}>
            {pctSign}
            {pct}%
          </span>{" "}
          {directionWord}
        </p>
      </div>

      {/* What it is measured against. */}
      <div className="border-r border-b border-border-strong/70 bg-bg-surface p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Baseline, no factors
        </p>
        <p className="mt-3 font-display text-2xl font-medium text-text-primary">
          {formatNumber(impact.total_baseline)}
        </p>
        <p className="mt-2 text-[13px] text-text-secondary">
          The time-series pattern on its own
        </p>
      </div>

      <div className="border-r border-b border-border-strong/70 bg-bg-surface p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          With factors
        </p>
        <p className="mt-3 font-display text-2xl font-medium text-accent">
          {formatNumber(impact.total_with_factors)}
        </p>
        <p className="mt-2 text-[13px] text-text-secondary">
          {impact.top_driver ? (
            <>
              <span className="text-text-muted">Top driver:</span> {impact.top_driver}
            </>
          ) : (
            "Forecast adjusted by the factors you selected"
          )}
        </p>
      </div>
    </div>
  );
}
