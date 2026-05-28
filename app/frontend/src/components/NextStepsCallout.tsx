import { Link } from"react-router-dom";

interface NextStepsCalloutProps {
 datasetId: string;
}

interface Step {
 to: string;
 eyebrow: string;
 title: string;
 body: string;
}

export function NextStepsCallout({ datasetId }: NextStepsCalloutProps) {
 const steps: Step[] = [
 {
 to: `/backtest/${datasetId}`,
 eyebrow:"Validate",
 title:"Backtest this forecast",
 body:"See how it would have done on your real history.",
 },
 {
 to: `/anomaly/${datasetId}`,
 eyebrow:"Investigate",
 title:"Find anomalies",
 body:"Flag the points that don't fit the pattern.",
 },
 {
 to: `/explain/${datasetId}`,
 eyebrow:"Understand",
 title:"Explain the movement",
 body:"Changepoints and drivers behind the numbers.",
 },
 ];

 return (
 <section
 aria-label="Next steps"className="border border-border-strong/70 bg-bg-surface p-5 space-y-4"
 >
 <div className="flex items-baseline justify-between gap-3">
 <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Now that you have a forecast
 </h2>
 <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
 Optional next steps
 </span>
 </div>
 <div className="grid gap-0 md:grid-cols-3 border border-border-strong/70 divide-x divide-border-strong/70">
 {steps.map((step) => (
 <Link
 key={step.to}
 to={step.to}
 className="group relative p-4 transition-colors hover:bg-accent/10"
 >
 <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
 {step.eyebrow}
 </span>
 <h3 className="mt-1 font-display text-sm font-medium text-text-primary">
 {step.title}
 </h3>
 <p className="mt-1 text-xs text-text-secondary leading-relaxed">{step.body}</p>
 <span className="mt-3 inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted group-hover:text-accent transition-colors">
 Open{" "}
 <span className="inline-block ml-1">→</span>
 </span>
 </Link>
 ))}
 </div>
 </section>
 );
}
