import type { IssuedForecast } from "@/types/accuracy";

interface Props {
 issued: IssuedForecast | null;
}

/**
 * States what was issued, when, and on what assumptions.
 *
 * An issued forecast is a commitment that will be scored later, so the record
 * of what it assumed has to be visible next to it. Otherwise the accuracy
 * number arrives with no way to judge whether the assumptions or the model were
 * at fault.
 */
export function IssuedForecastBanner({ issued }: Props) {
 if (!issued) {
 return (
 <div className="border border-border-strong/70 bg-bg-surface/40 p-4">
 <p className="text-[13px] text-text-secondary">
 Nothing issued yet. Issuing freezes a forecast so it can be scored against
 what actually happens.
 </p>
 </div>
 );
 }

 const assumptions = Object.entries(issued.assumptions ?? {});

 return (
 <div className="border border-accent/40 bg-bg-surface/40 p-4">
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
 Forecast issued
 </p>
 <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
 <Fact label="Issued at" value={issued.issued_at} />
 <Fact label="Revision" value={String(issued.revision_no)} />
 <Fact label="Run" value={issued.run_id.slice(0, 8)} />
 </dl>

 {assumptions.length ? (
 <div className="mt-3">
 <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Assumptions it was issued on
 </p>
 <ul className="mt-1 grid gap-1">
 {assumptions.map(([name, byPeriod]) => (
 <li key={name} className="font-mono text-[11px] text-text-secondary">
 {name}:{" "}
 {typeof byPeriod === "object" && byPeriod !== null
 ? Object.entries(byPeriod as Record<string, unknown>)
 .map(([period, value]) => `${period}=${String(value)}`)
 .join(", ")
 : String(byPeriod)}
 </li>
 ))}
 </ul>
 </div>
 ) : null}
 </div>
 );
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
