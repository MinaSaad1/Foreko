import type { FactorStat } from "@/types/factors";

interface FactorDetailsTableProps {
  factors: FactorStat[];
}

function fmt(n: number | null, digits: number = 2): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (abs === 0) return "0";
  if (abs < 0.01) return n.toExponential(2);
  return n.toFixed(digits);
}

function corrBadge(r: number): { label: string; className: string } {
  const abs = Math.abs(r);
  if (abs >= 0.7) return { label: "Strong", className: "border-accent/40 bg-accent-dim text-accent" };
  if (abs >= 0.4) return { label: "Moderate", className: "border-neutral/40 bg-neutral/10 text-neutral" };
  if (abs >= 0.15) return { label: "Mild", className: "border-warning/30 bg-warning/10 text-warning" };
  return { label: "Weak", className: "border-border bg-bg-elevated text-text-muted" };
}

export function FactorDetailsTable({ factors }: FactorDetailsTableProps) {
  if (factors.length === 0) return null;

  const sorted = [...factors].sort((a, b) => b.influence - a.influence);

  return (
    <div className="rounded-panel border border-border bg-bg-surface overflow-hidden">
      <div className="border-b border-border bg-bg-elevated px-5 py-3">
        <h3 className="font-display text-sm font-medium text-text-primary">Factor details</h3>
        <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-text-muted">
          Correlation is Pearson r with the target · elasticity is ∂ target / ∂ factor
        </p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-bg-surface">
            <tr>
              {["Factor", "Type", "Correlation", "Strength", "Elasticity", "Mean", "Std", "Last value"].map(
                (h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2 text-left font-mono text-xs uppercase tracking-widest text-text-muted"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => {
              const badge = corrBadge(f.correlation);
              const sign = f.correlation >= 0 ? "+" : "";
              const corrColor = f.correlation >= 0 ? "text-positive" : "text-anomaly";
              return (
                <tr
                  key={f.name}
                  className="border-b border-border last:border-0 hover:bg-bg-elevated transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-text-primary">{f.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">{f.kind}</td>
                  <td className={`px-4 py-2 font-mono ${corrColor}`}>
                    {sign}
                    {f.correlation.toFixed(3)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-xs uppercase tracking-widest ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">
                    {f.kind === "numeric" ? fmt(f.elasticity, 4) : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">
                    {f.kind === "numeric"
                      ? fmt(f.mean)
                      : f.top_category
                        ? `mode: ${f.top_category}`
                        : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">
                    {f.kind === "numeric" ? fmt(f.std) : f.unique_count != null ? `${f.unique_count} values` : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-text-secondary">
                    {f.kind === "numeric" ? fmt(f.last_value) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
