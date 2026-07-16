import type { ValidationResult } from "@/types/validation";

interface Props {
 result: ValidationResult;
}

/**
 * Candidates that could not be scored, and series left without a champion.
 *
 * These are the results a leaderboard hides. A model that failed a fold is not
 * a model that scored badly, and the difference decides whether the evidence
 * can be trusted at all.
 */
export function PortfolioExceptionsTable({ result }: Props) {
 const unscored = Object.values(result.series_policies).filter(
 (p) => p.champion === null,
 );
 const ineligible = Object.values(result.series_policies).flatMap((policy) =>
 Object.entries(policy.ineligible).map(([model, reason]) => ({
 series_id: policy.series_id,
 model,
 reason,
 })),
 );

 if (!unscored.length && !ineligible.length && !result.failures.length) {
 return (
 <p className="text-[12px] text-text-muted">
 Every candidate completed every fold for every series.
 </p>
 );
 }

 return (
 <section className="grid gap-3">
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Exceptions
 </h2>

 {unscored.length ? (
 <div role="alert" className="border border-warning/50 bg-bg-surface/40 p-3">
 <p className="text-[12px] text-warning">
 {unscored.length} of {Object.keys(result.series_policies).length} series
 have no eligible champion and are excluded from the portfolio score.
 </p>
 <ul className="mt-1 grid gap-1">
 {unscored.map((p) => (
 <li key={p.series_id} className="text-[12px] text-text-secondary">
 {p.series_id}: {p.reason}
 </li>
 ))}
 </ul>
 </div>
 ) : null}

 {ineligible.length ? (
 <div className="overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">Candidates excluded from selection</caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <th scope="col" className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Series
 </th>
 <th scope="col" className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Candidate
 </th>
 <th scope="col" className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Why it was excluded
 </th>
 </tr>
 </thead>
 <tbody>
 {ineligible.map((row) => (
 <tr
 key={`${row.series_id}-${row.model}`}
 className="border-b border-border/30"
 >
 <td className="px-2 py-2 text-text-primary">{row.series_id}</td>
 <td className="px-2 py-2 text-text-primary">{row.model}</td>
 <td className="px-2 py-2 text-text-secondary">{row.reason}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 ) : null}
 </section>
 );
}
