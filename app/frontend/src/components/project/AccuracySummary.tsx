import type { AccuracyResult } from "@/types/accuracy";

interface Props {
 accuracy: AccuracyResult;
}

function num(value: number | null, digits = 3): string {
 // Null means the metric could not be computed. Rendering 0 would present a
 // broken metric as a perfect score.
 return value === null || !Number.isFinite(value) ? "not available" : value.toFixed(digits);
}

function pct(value: number | null): string {
 return value === null || !Number.isFinite(value)
 ? "not available"
 : `${(value * 100).toFixed(1)}%`;
}

/**
 * Post-issue accuracy: the forecast you issued versus what happened.
 *
 * Deliberately labelled apart from backtest evidence everywhere. A backtest
 * asks how a model would have done on history it never saw; this asks how the
 * forecast you committed to turned out. Presenting them as the same number
 * would let a good backtest stand in for a bad outcome.
 */
export function AccuracySummary({ accuracy }: Props) {
 if (!accuracy.issued_id) {
 return (
 <p className="text-[13px] text-text-secondary">
 {accuracy.metric_warnings[0] ?? "No forecast has been issued yet."}
 </p>
 );
 }

 if (accuracy.matched_points === 0) {
 return (
 <div role="alert" className="border border-warning/50 bg-bg-surface/40 p-4">
 <p className="text-[13px] text-warning">
 {accuracy.metric_warnings[0] ??
 "No actuals matched the issued forecast yet."}
 </p>
 </div>
 );
 }

 return (
 <section className="grid gap-4">
 <div>
 <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Portfolio
 </h3>
 <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 border border-border-strong/70 bg-bg-surface/40 p-4 md:grid-cols-4">
 <Fact label="Matched periods" value={String(accuracy.matched_points)} />
 <Fact label="WAPE" value={pct(accuracy.metrics.wape)} />
 <Fact
 label="Signed bias"
 value={
 accuracy.metrics.bias_pct === null
 ? "not available"
 : `${accuracy.metrics.bias_pct.toFixed(2)}%`
 }
 />
 <Fact label="MASE" value={num(accuracy.metrics.mase)} />
 <Fact label="RMSE" value={num(accuracy.metrics.rmse, 2)} />
 <Fact label="Coverage" value={pct(accuracy.metrics.coverage_p10_p90)} />
 <Fact label="Pinball loss" value={num(accuracy.metrics.pinball_loss, 2)} />
 <Fact
 label="Periods not yet due"
 value={String(accuracy.unmatched_periods)}
 />
 </dl>
 </div>

 {accuracy.metric_warnings.length ? (
 <ul className="grid gap-1">
 {accuracy.metric_warnings.map((w) => (
 <li key={w} role="note" className="text-[12px] text-warning">
 {w}
 </li>
 ))}
 </ul>
 ) : null}

 <div>
 <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 By series
 </h3>
 <div className="mt-2 overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">
 Post-issue accuracy of the issued forecast, by series
 </caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <Th>Series</Th>
 <Th>Matched</Th>
 <Th>WAPE</Th>
 <Th>Bias</Th>
 <Th>MASE</Th>
 <Th>Coverage</Th>
 </tr>
 </thead>
 <tbody>
 {accuracy.series.map((series) => (
 <tr key={series.series_id} className="border-b border-border/30 align-top">
 <Td>
 {series.series_id}
 {series.metric_warnings.length ? (
 <span className="mt-1 block text-[11px] text-text-muted">
 {series.metric_warnings[0]}
 </span>
 ) : null}
 </Td>
 <Td>{series.matched_points}</Td>
 <Td>{pct(series.metrics.wape)}</Td>
 <Td>
 {series.metrics.bias_pct === null
 ? "not available"
 : `${series.metrics.bias_pct.toFixed(2)}%`}
 </Td>
 <Td>{num(series.metrics.mase)}</Td>
 <Td>{pct(series.metrics.coverage_p10_p90)}</Td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </section>
 );
}

function Th({ children }: { children: React.ReactNode }) {
 return (
 <th
 scope="col"
 className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted"
 >
 {children}
 </th>
 );
}

function Td({ children }: { children: React.ReactNode }) {
 return <td className="px-2 py-2 text-text-primary">{children}</td>;
}

function Fact({ label, value }: { label: string; value: string }) {
 return (
 <div className="min-w-0">
 <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 {label}
 </dt>
 <dd className="mt-1 truncate font-mono text-[12px] text-text-primary">{value}</dd>
 </div>
 );
}
