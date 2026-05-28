import type { MethodId } from"@/types/phases";

interface Props {
 methods: MethodId[];
 matrix: Record<string, Record<string, number>>;
 counts: Record<string, number>;
}

const LABELS: Record<string, string> = {
 z_score:"Z-score",
 iqr:"IQR",
 stl_residual:"STL res.",
 isolation_forest:"IsoForest",
 quantile_pi:"Quantile PI",
};

function cellColor(v: number): string {
 if (v >= 0.75) return"bg-accent text-on-accent";
 if (v >= 0.5) return"bg-accent/70 text-on-accent";
 if (v >= 0.25) return"bg-accent/30 text-text-primary";
 if (v >= 0.1) return"bg-accent-dim text-text-secondary";
 return"bg-bg-elevated text-text-muted";
}

export function MethodAgreementMatrix({ methods, matrix, counts }: Props) {
 return (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
 <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Method agreement
 </h3>
 <p className="text-xs text-text-muted">
 Jaccard overlap between each pair of methods. Higher = the two methods agree on the same anomalies.
 </p>
 <div className="overflow-auto">
 <table className="terminal-table">
 <thead>
 <tr>
 <th className="px-2 py-1 text-left font-mono text-xs uppercase tracking-widest">
 Method
 </th>
 {methods.map((m) => (
 <th
 key={m}
 className="px-2 py-1 text-center font-mono text-xs uppercase tracking-widest"
 >
 {LABELS[m] ?? m}
 </th>
 ))}
 <th className="px-2 py-1 text-right font-mono text-xs uppercase tracking-widest">
 Count
 </th>
 </tr>
 </thead>
 <tbody>
 {methods.map((m1) => (
 <tr key={m1}>
 <td className="px-2 py-1 font-mono">{LABELS[m1] ?? m1}</td>
 {methods.map((m2) => {
 const v = matrix[m1]?.[m2] ?? 0;
 return (
 <td
 key={m2}
 className={`px-2 py-1 text-center font-mono ${cellColor(v)}`}
 title={`${(v * 100).toFixed(0)}%`}
 >
 {(v * 100).toFixed(0)}
 </td>
 );
 })}
 <td className="px-2 py-1 text-right text-text-secondary">{counts[m1] ?? 0}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 );
}
