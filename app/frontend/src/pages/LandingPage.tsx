import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProjects } from "@/hooks/useProject";
import { useDatasetStore } from "@/stores/datasetStore";
import { loadDemoDataset } from "@/utils/loadDemoDataset";
import { toast } from "@/utils/toast";
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
} from "@/components/landing/FeatureIllustrations";

interface FeatureTile {
  title: string;
  benefit: string;
  to: string;
  cta: string;
  illustration: ReactNode;
}

const FEATURES: FeatureTile[] = [
  {
    // Named to match the sidebar and the page itself. This tile said
    // "Forecast" while pointing at a destination titled Model Comparison,
    // and in V2 the forecast you keep is a project, not this page.
    title: "Model Comparison",
    benefit: "Run two models on one holdout and see which fits your series better.",
    to: "/compare",
    cta: "Compare models",
    illustration: <ForecastIllustration />,
  },
  {
    title: "Backtest",
    benefit: "Replay the forecast on your own history to see how well it would have held up.",
    to: "/backtest",
    cta: "Open backtest",
    illustration: <BacktestIllustration />,
  },
  {
    title: "Anomalies",
    benefit: "Flag unusual points, sort by severity, and act on the real outliers.",
    to: "/anomaly",
    cta: "Detect anomalies",
    illustration: <AnomaliesIllustration />,
  },
  {
    title: "Explain",
    benefit: "Find changepoints and drivers behind the numbers that moved.",
    to: "/explain",
    cta: "Explain changes",
    illustration: <ExplainIllustration />,
  },
  {
    title: "Factors",
    benefit: "Bring external drivers into the forecast and measure their real impact.",
    to: "/covariates",
    cta: "Open factors",
    illustration: <FactorsIllustration />,
  },
  {
    title: "Scenarios",
    benefit: "Play out what-if futures. Compare planned spend, price moves, or holiday lifts.",
    to: "/scenarios",
    cta: "Run scenarios",
    illustration: <ScenariosIllustration />,
  },
  {
    title: "Diagnostics",
    benefit: "Inspect residuals, autocorrelation, and STL to confirm a forecast is honest.",
    to: "/diagnostics",
    cta: "Run diagnostics",
    illustration: <DiagnosticsIllustration />,
  },
  {
    title: "Data Quality",
    benefit: "Catch 'garbage in' before it becomes 'garbage out' anywhere downstream.",
    to: "/preflight",
    cta: "Run preflight",
    illustration: <DataQualityIllustration />,
  },
  {
    title: "Segments",
    benefit: "Forecast multiple segments side by side, ranked by total, growth, or volatility.",
    to: "/segments",
    cta: "Open segments",
    illustration: <SegmentsIllustration />,
  },
];

const TRUST_POINTS: { title: string; body: string }[] = [
  {
    title: "Free and open source",
    body: "Apache-2.0 licensed. No upsell, no paid tier, no telemetry. The whole app is on GitHub.",
  },
  {
    title: "Stays on your machine",
    body: "Your files are processed locally. Nothing is sent to the cloud.",
  },
  {
    title: "Two models side by side",
    body: "Google's TimesFM foundation model and a LightGBM baseline. Backtested on your data so you can see which fits.",
  },
];

/** How many projects the home page shows before deferring to /projects. */
const HOME_PROJECT_LIMIT = 4;

/**
 * The V2 workflow, surfaced on the home page.
 *
 * A project is the thing a user comes back to, so it belongs above the
 * feature tiles: the tiles are destinations, this is the work. It stays quiet
 * when there is nothing to resume, because an empty list should invite rather
 * than nag.
 */
function ProjectsSection() {
  const { data: projects, isPending, isError } = useProjects(false);

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline justify-between border-b border-border-strong/70 pb-3">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-text-primary">
          Your projects
        </h2>
        <Link
          to="/projects"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-accent"
        >
          All projects →
        </Link>
      </div>

      {isPending ? (
        <p className="text-[13px] text-text-muted">Loading projects...</p>
      ) : isError ? (
        // Honest failure. The rest of the page still works, so say what is
        // missing and let the user carry on rather than blanking the section.
        <p role="alert" className="text-[13px] text-anomaly">
          Could not load your projects. The forecasting pages below still work.
        </p>
      ) : projects && projects.length > 0 ? (
        <>
          <ul className="grid gap-2">
            {projects.slice(0, HOME_PROJECT_LIMIT).map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="flex items-center justify-between gap-4 border border-border-strong/70 bg-bg-surface/40 px-4 py-3 transition-colors hover:border-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-text-primary">
                      {project.name}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                      Revision {project.current_revision} · updated{" "}
                      {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
                    {project.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {projects.length > HOME_PROJECT_LIMIT && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
              {projects.length - HOME_PROJECT_LIMIT} more on the projects page
            </p>
          )}
        </>
      ) : (
        <div className="border border-border-strong/70 bg-bg-surface/40 px-6 py-8">
          <p className="text-[14px] text-text-primary">No projects yet</p>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-text-secondary">
            A project keeps a forecast together over time: the data recipe, the
            model evidence, the assumptions you entered, the forecast you
            issued, and how accurate it turned out. Start one when you have a
            number you need to produce again.
          </p>
          <Link
            to="/projects"
            className="mt-4 inline-block border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10"
          >
            New project
          </Link>
        </div>
      )}
    </section>
  );
}

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
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
              Local-first time-series forecasting
            </p>
            <h1 className="font-display text-3xl md:text-[2rem] font-medium leading-[1.1] tracking-[-0.01em] text-text-primary">
              Forecast your numbers.
              <br />
              <span className="text-accent">Stay on your machine.</span>
            </h1>
            <p className="text-base text-text-secondary leading-relaxed max-w-[60ch]">
              Foreko wraps Google's TimesFM and a LightGBM baseline in a
              workbench you run locally. Keep a recurring forecast as a
              project: the data recipe, the model evidence, your assumptions,
              and how accurate it turned out, all reproducible later. Free and
              open source.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/data" className="btn-terminal-primary">
                <span>↑</span> Upload your Data
              </Link>
              <button
                type="button"
                onClick={handleDemo}
                disabled={loadingDemo}
                className="btn-terminal"
              >
                {loadingDemo ? "Loading demo..." : "Try demo dataset"}
              </button>
              <Link
                to="/data"
                className="inline-flex items-center gap-2 px-3 py-3 font-mono text-xs font-medium uppercase tracking-widest text-text-muted transition-colors hover:text-accent"
              >
                Or pick a sample →
              </Link>
            </div>
          </div>

          <div className="relative hidden md:block shrink-0 h-[22rem] w-[22rem] lg:h-[28rem] lg:w-[28rem]">
            <span className="pointer-events-none absolute inset-0 rounded-full bg-hero-glow opacity-25 blur-3xl" />
            <span className="pointer-events-none absolute inset-0 m-auto h-[16rem] w-[16rem] lg:h-[20rem] lg:w-[20rem] rounded-full border border-accent/10" />
            <span className="pointer-events-none absolute inset-0 m-auto h-[20rem] w-[20rem] lg:h-[24rem] lg:w-[24rem] rounded-full border border-dashed border-accent/15" />
            <span className="pointer-events-none absolute inset-0 m-auto h-[22rem] w-[22rem] lg:h-[28rem] lg:w-[28rem] rounded-full border border-accent/5" />
            <img
              src="/foreko-logo.png"
              alt="Foreko mascot"
              className="absolute inset-0 m-auto z-10 h-64 w-64 lg:h-80 lg:w-80 object-contain drop-shadow-[0_0_30px_rgb(var(--color-accent)/0.45)]"
            />
          </div>
        </div>
      </section>

      <ProjectsSection />

      <section className="pt-4">
        <div className="mb-4 flex items-baseline justify-between border-b border-border-strong/70 pb-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-text-primary">
            What Foreko does
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            One workbench · many lenses
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-l border-t border-border-strong/70">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              to={f.to}
              className="group relative border-r border-b border-border-strong/70 bg-bg-surface p-5 transition-colors hover:bg-accent/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="border border-border-strong/60 bg-bg-base p-2 transition-colors group-hover:border-accent/50">
                  {f.illustration}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted transition-colors group-hover:text-accent">
                  {f.cta} →
                </span>
              </div>
              <h3 className="mt-4 font-display text-base font-medium text-text-primary">
                {f.title}
              </h3>
              <p className="mt-1 text-[13px] text-text-secondary leading-relaxed">{f.benefit}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 border border-border-strong/70 bg-bg-surface">
        <div className="border-b border-border-strong/70 px-6 py-3 flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-text-primary">
            How it works
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            Three steps
          </span>
        </div>
        <ol className="grid md:grid-cols-3 divide-x divide-border-strong/70">
          {[
            { n: "01", title: "Bring your data", body: "Upload a CSV, an Excel workbook, or connect a database. Foreko reads the schema." },
            { n: "02", title: "Open a project", body: "Prepare the series, validate the model on your own history, enter your assumptions, then issue the forecast." },
            { n: "03", title: "Score it later", body: "Load actuals when they arrive to measure accuracy and bias. Reproduce any past decision without rebuilding it." },
          ].map((step) => (
            <li key={step.n} className="p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">{step.n}</span>
              <h3 className="mt-2 font-display text-base font-medium text-text-primary">{step.title}</h3>
              <p className="mt-1 text-[13px] text-text-secondary leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 grid md:grid-cols-3 border-l border-t border-border-strong/70">
        {TRUST_POINTS.map((p) => (
          <div key={p.title} className="border-r border-b border-border-strong/70 bg-bg-surface p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              {p.title}
            </p>
            <p className="mt-2 text-[13px] text-text-secondary leading-relaxed">{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border-strong/70 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
        <span>Foreko · Free and open source · Apache-2.0 licensed</span>
        <div className="flex gap-5">
          <Link to="/glossary" className="hover:text-accent transition-colors">Glossary</Link>
          <Link to="/data" className="hover:text-accent transition-colors">Datasets</Link>
          <Link to="/data" className="hover:text-accent transition-colors">Upload</Link>
        </div>
      </footer>
    </div>
  );
}
