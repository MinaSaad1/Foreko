import { Link } from "react-router-dom";

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
      eyebrow: "Validate",
      title: "Backtest this forecast",
      body: "See how it would have done on your real history.",
    },
    {
      to: `/anomaly/${datasetId}`,
      eyebrow: "Investigate",
      title: "Find anomalies",
      body: "Flag the points that don't fit the pattern.",
    },
    {
      to: `/explain/${datasetId}`,
      eyebrow: "Understand",
      title: "Explain the movement",
      body: "Changepoints and drivers behind the numbers.",
    },
  ];

  return (
    <section
      aria-label="Next steps"
      className="rounded-panel border border-border/60 border-l-2 border-l-accent bg-bg-surface/30 backdrop-blur-sm p-5 space-y-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          Now that you have a forecast
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
          Optional next steps
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.to}
            to={step.to}
            className="group relative overflow-hidden rounded-panel border border-border/60 bg-bg-base/40 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/[0.08] hover:shadow-[0_0_20px_-8px_rgb(var(--color-accent)/0.35)]"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              {step.eyebrow}
            </span>
            <h3 className="mt-1 font-display text-sm font-medium text-text-primary">
              {step.title}
            </h3>
            <p className="mt-1 text-xs text-text-secondary">{step.body}</p>
            <span className="mt-3 inline-flex font-mono text-[10px] uppercase tracking-widest text-text-muted group-hover:text-accent">
              Open {" "}
              <span className="inline-block transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
