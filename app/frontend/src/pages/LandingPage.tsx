import { useState, type ReactNode } from"react";
import { Link, useNavigate } from"react-router-dom";
import { useDatasetStore } from"@/stores/datasetStore";
import { loadDemoDataset } from"@/utils/loadDemoDataset";
import { toast } from"@/utils/toast";
import {
  AnomaliesIllustration,
  BacktestIllustration,
  DataQualityIllustration,
  DiagnosticsIllustration,
  ExplainIllustration,
  FactorsIllustration,
  ForecastIllustration,
  ScenariosIllustration,
  SegmentsIllustration,
} from"@/components/landing/FeatureIllustrations";

interface FeatureTile {
  title: string;
  benefit: string;
  to: string;
  cta: string;
  illustration: ReactNode;
}

const FEATURES: FeatureTile[] = [
  {
    title:"Data Quality",
    benefit:"Catch 'garbage in' before it becomes 'garbage out' forecasts.",
    to:"/preflight",
    cta:"Run preflight",
    illustration: <DataQualityIllustration />,
  },
  {
    title:"Forecast",
    benefit:"Best-fit forecast with upper and lower ranges, and a recommended model.",
    to:"/compare",
    cta:"Open forecast",
    illustration: <ForecastIllustration />,
  },
  {
    title:"Backtest",
    benefit:"Prove the forecast would have worked on your real history.",
    to:"/backtest",
    cta:"Run backtest",
    illustration: <BacktestIllustration />,
  },
  {
    title:"Diagnostics",
    benefit:"Confirm the model isn't leaving useful signal behind.",
    to:"/diagnostics",
    cta:"See diagnostics",
    illustration: <DiagnosticsIllustration />,
  },
  {
    title:"Anomalies",
    benefit:"Flag unusual points, sort by severity, and act on the real outliers.",
    to:"/anomaly",
    cta:"Detect anomalies",
    illustration: <AnomaliesIllustration />,
  },
  {
    title:"Explain",
    benefit:"Find changepoints and drivers behind the numbers that moved.",
    to:"/explain",
    cta:"Explain changes",
    illustration: <ExplainIllustration />,
  },
  {
    title:"Factors",
    benefit:"Bring in price, promo, weather, and measure their real impact.",
    to:"/covariates",
    cta:"Add factors",
    illustration: <FactorsIllustration />,
  },
  {
    title:"Scenarios",
    benefit:"Simulate price cuts, spend ramps, launches, before you commit.",
    to:"/scenarios",
    cta:"Build scenarios",
    illustration: <ScenariosIllustration />,
  },
  {
    title:"Segments",
    benefit:"Compare regions, products, or cohorts side-by-side.",
    to:"/segments",
    cta:"Compare segments",
    illustration: <SegmentsIllustration />,
  },
];

const TRUST_POINTS: { title: string; body: string }[] = [
  {
    title:"Stays on your machine",
    body:"Your CSVs are processed locally. Nothing is sent to the cloud.",
  },
  {
    title:"Foundation-model ready",
    body:"Uses a pretrained forecasting model, usable the moment you upload, no ML team required.",
  },
  {
    title:"Evidence over vibes",
    body:"Every recommendation is backed by a backtest on your own history, not a generic benchmark.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const setActiveDatasetId = useDatasetStore((s) => s.setActiveDatasetId);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const handleDemo = async () => {
    setLoadingDemo(true);
    try {
      const preview = await loadDemoDataset();
      setActiveDatasetId(preview.id);
      navigate(`/compare/${preview.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20">
      <section className="relative py-16 md:py-24">
        <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-3xl space-y-6">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight tracking-tight">
              <span className="bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent">
                Forecast your numbers.
              </span>
              <br />
              <span className="bg-gradient-to-r from-accent to-text-primary bg-clip-text text-transparent whitespace-nowrap">
                Understand why they move.
              </span>
            </h1>
            <p className="text-lg text-text-secondary md:text-xl">
              Foreko turns your Data into a trustworthy forecast with uncertainty
              ranges, a recommended model, and plain-English explanations, no
              data-science team required.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/data"
                className="btn-terminal-primary"
              >
                <span>↑</span> Upload your Data
              </Link>
              <button
                type="button"
                onClick={handleDemo}
                disabled={loadingDemo}
                className="btn-terminal"
              >
                {loadingDemo ?"Loading demo..." :"Try demo dataset"}
              </button>
              <Link
                to="/data"
                className="inline-flex items-center gap-2 px-3 py-3 font-mono text-xs font-medium uppercase tracking-widest text-text-muted transition-colors hover:text-accent"
              >
                Or pick a sample →
              </Link>
            </div>
          </div>

          {/* Hero mascot */}
          <div className="relative hidden md:block shrink-0 h-[22rem] w-[22rem] lg:h-[28rem] lg:w-[28rem]">
            {/* Soft glow behind, fills the square */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-hero-glow opacity-25 blur-3xl animate-pulse-slow" />

            {/* Concentric halo rings, absolute + inset-0 + m-auto = perfectly centered */}
            <span className="pointer-events-none absolute inset-0 m-auto h-[16rem] w-[16rem] lg:h-[20rem] lg:w-[20rem] rounded-full border border-accent/10" />
            <span className="pointer-events-none absolute inset-0 m-auto h-[20rem] w-[20rem] lg:h-[24rem] lg:w-[24rem] rounded-full border border-dashed border-accent/15 animate-spin-slow" />
            <span className="pointer-events-none absolute inset-0 m-auto h-[22rem] w-[22rem] lg:h-[28rem] lg:w-[28rem] rounded-full border border-accent/5" />

            {/* Mascot, centered via absolute + inset-0 + m-auto */}
            <img
              src="/foreko-logo.png"
              alt="Foreko mascot"
              className="absolute inset-0 m-auto z-10 h-64 w-64 lg:h-80 lg:w-80 object-contain animate-float-y-slow drop-shadow-[0_0_30px_rgb(var(--color-accent)/0.45)]"
            />
          </div>
        </div>
      </section>

      <section className="pt-4">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold text-text-primary">
            What Foreko does for you
          </h2>
          <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
            9 analyses · one dataset
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              to={f.to}
              className="group relative overflow-hidden rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/[0.08] hover:shadow-[0_0_32px_-8px_rgb(var(--color-accent)/0.35)]"
            >
              {/* Corner sweep on hover */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-accent/0 blur-2xl transition-all duration-500 group-hover:bg-accent/20"
              />
              {/* Accent bar left edge */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-6 h-8 w-0.5 bg-accent/40 transition-all duration-300 group-hover:h-16 group-hover:bg-accent"
              />

              <div className="relative flex items-start justify-between gap-3">
                <div className="rounded-panel border border-accent/10 bg-bg-base/60 p-2 transition-all duration-300 group-hover:border-accent/40 group-hover:bg-bg-base/80 group-hover:shadow-[0_0_18px_-4px_rgb(var(--color-accent)/0.35)]">
                  {f.illustration}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted transition-colors group-hover:text-accent">
                  {f.cta} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </div>
              <h3 className="relative mt-4 font-display text-base font-medium text-text-primary">
                {f.title}
              </h3>
              <p className="relative mt-1 text-sm text-text-secondary">{f.benefit}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-8">
        <h2 className="font-display text-xl font-semibold text-text-primary">How it works</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              n:"01",
              title:"Upload a CSV",
              body:"A date column and a numeric value column is all Foreko needs.",
            },
            {
              n:"02",
              title:"Map and run",
              body:"Map your columns, pick a horizon, and let the model forecast.",
            },
            {
              n:"03",
              title:"Act with confidence",
              body:"Read the recommended model, the uncertainty range, and the business story.",
            },
          ].map((step) => (
            <li key={step.n} className="border-l-2 border-accent/50 pl-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{step.n}</span>
              <h3 className="mt-1 font-display text-base font-medium text-text-primary">{step.title}</h3>
              <p className="mt-1 text-sm text-text-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {TRUST_POINTS.map((p) => (
          <div
            key={p.title}
            className="rounded-panel border border-border/40 bg-bg-surface/20 backdrop-blur-sm p-5"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              {p.title}
            </p>
            <p className="mt-2 text-sm text-text-secondary">{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-6 font-mono text-xs uppercase tracking-widest text-text-muted">
        <span>Foreko · Local forecasting studio</span>
        <div className="flex gap-4">
          <Link to="/glossary" className="hover:text-accent">
            Glossary
          </Link>
          <Link to="/data" className="hover:text-accent">
            Datasets
          </Link>
          <Link to="/data" className="hover:text-accent">
            Upload
          </Link>
        </div>
      </footer>
    </div>
  );
}
