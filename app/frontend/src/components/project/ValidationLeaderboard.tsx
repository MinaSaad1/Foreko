import type { SeriesPolicy, ValidationResult } from "@/types/validation";

interface Props {
 result: ValidationResult;
}

function fmt(value: number | null, digits = 3): string {
 // A metric that could not be computed is null, and must read as unknown
 // rather than as a very good zero.
 return value === null || !Number.isFinite(value) ? "not available" : value.toFixed(digits);
}

function pct(value: number | null): string {
 return value === null || !Number.isFinite(value) ? "not available" : `${(value * 100).toFixed(1)}%`;
}

export function ValidationLeaderboard({ result }: Props) {
 const series = Object.values(result.series_policies);

 return (
 <section className="grid gap-4">
 <div>
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Portfolio
 </h2>
 <p className="mt-1 text-[12px] text-text-secondary">
 Every series counts equally, so one large series cannot decide the headline
 number. WAPE is shown alongside because it weights by magnitude.
 </p>
 <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border border-border-strong/70 bg-bg-surface/40 p-4 md:grid-cols-4">
 <Fact label={`${result.primary_metric} (primary)`} value={fmt(result.portfolio_metrics.mase)} />
 <Fact label="WAPE" value={pct(result.portfolio_metrics.wape)} />
 <Fact label="Signed bias" value={result.portfolio_metrics.bias_pct === null ? "not available" : `${result.portfolio_metrics.bias_pct.toFixed(2)}%`} />
 <Fact label="P10 to P90 coverage" value={pct(result.portfolio_metrics.coverage_p10_p90)} />
 </dl>
 {result.portfolio_metrics.warnings.map((w) => (
 <p key={w} role="note" className="mt-2 text-[12px] text-warn">
 {w}
 </p>
 ))}
 </div>

 <div>
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Selected policy by series
 </h2>
 <div className="mt-2 overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">
 Champion model and evidence for each series
 </caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <Th>Series</Th>
 <Th>Champion</Th>
 <Th>Challenger</Th>
 <Th>MASE</Th>
 <Th>WAPE</Th>
 <Th>Bias</Th>
 <Th>Coverage</Th>
 </tr>
 </thead>
 <tbody>
 {series.map((policy) => (
 <SeriesRow key={policy.series_id} policy={policy} />
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </section>
 );
}

function SeriesRow({ policy }: { policy: SeriesPolicy }) {
 const champion = policy.champion;
 const metrics = champion ? policy.metrics[champion] : null;

 return (
 <tr className="border-b border-border/30 align-top">
 <Td>{policy.series_id}</Td>
 <Td>
 {champion ? (
 <span className="text-accent">{champion}</span>
 ) : (
 <span className="text-warn">No eligible champion</span>
 )}
 <span className="mt-1 block text-[11px] text-text-muted">{policy.reason}</span>
 </Td>
 <Td>{policy.challenger ?? "none"}</Td>
 <Td>{metrics ? fmt(metrics.mase) : "not available"}</Td>
 <Td>{metrics ? pct(metrics.wape) : "not available"}</Td>
 <Td>
 {metrics && metrics.bias_pct !== null
 ? `${metrics.bias_pct.toFixed(2)}%`
 : "not available"}
 </Td>
 <Td>{metrics ? pct(metrics.coverage_p10_p90) : "not available"}</Td>
 </tr>
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
