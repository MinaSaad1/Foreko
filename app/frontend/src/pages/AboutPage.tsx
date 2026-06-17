import { Link } from"react-router-dom";
import { useDocumentTitle } from"@/utils/useDocumentTitle";
import { APP_VERSION, GIT_SHA } from"@/utils/version";

export function AboutPage() {
 useDocumentTitle("About");

 return (
 <div className="mx-auto max-w-3xl space-y-6 py-8">
 <div>
 <h1 className="font-display text-3xl font-semibold text-text-primary">About Foreko</h1>
 <p className="mt-2 text-text-secondary">
 A local forecasting studio powered by Google's TimesFM 2.5 foundation model.
 </p>
 </div>

 <section className="rounded-panel border border-border/60 bg-bg-surface p-6 space-y-3">
 <div className="grid gap-3 md:grid-cols-2">
 <div>
 <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Version</p>
 <p className="mt-1 font-mono text-sm text-text-primary">{APP_VERSION}</p>
 </div>
 <div>
 <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Build</p>
 <p className="mt-1 font-mono text-sm text-text-primary">{GIT_SHA}</p>
 </div>
 <div>
 <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Model</p>
 <p className="mt-1 font-mono text-sm text-text-primary">google/timesfm-2.5-200m-pytorch</p>
 </div>
 <div>
 <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Data home</p>
 <p className="mt-1 font-mono text-sm text-text-primary">~/.foreko/</p>
 </div>
 <div>
 <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">License</p>
 <p className="mt-1 font-mono text-sm text-text-primary">Apache 2.0</p>
 </div>
 </div>
 </section>

 <section className="rounded-panel border border-border/60 bg-bg-surface p-6 space-y-3">
 <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Who it's for
 </h2>
 <p className="text-sm text-text-secondary">
 Business users, product managers, ops leads, analysts, who need forecasts and explanations without a data science team.
 Upload a CSV, get a forecast with uncertainty ranges, understand what drove the change, and export a report.
 </p>
 </section>

 <section className="rounded-panel border border-border/60 bg-bg-surface p-6 space-y-3">
 <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Links
 </h2>
 <ul className="space-y-2 text-sm">
 <li>
 <Link to="/glossary"className="text-accent hover:underline">Glossary</Link>
 <span className="text-text-muted">, every metric and term in plain English</span>
 </li>
 <li>
 <Link to="/privacy"className="text-accent hover:underline">Privacy</Link>
 <span className="text-text-muted">, what stays local, what is opt-in</span>
 </li>
 <li>
 <Link to="/data"className="text-accent hover:underline">Upload a CSV</Link>
 </li>
 </ul>
 </section>
 </div>
 );
}
