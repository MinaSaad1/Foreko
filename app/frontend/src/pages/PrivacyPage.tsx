import { useState } from"react";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import { useDocumentTitle } from"@/utils/useDocumentTitle";
import { toast } from"@/utils/toast";
import { Tour, clearTourDismissal } from"@/components/Tour";

interface StorageRow {
  path: string;
  what: string;
}

const STORAGE_INVENTORY: StorageRow[] = [
  { path:"~/.timesfm_studio/datasets/", what:"Your uploaded CSVs. Kept for 30 days, then auto-purged." },
  { path:"~/.timesfm_studio/models/", what:"The TimesFM model weights (around 1.2 GB), downloaded on first run. If HuggingFace is unreachable, you can pre-populate this folder from another machine." },
  { path:"~/.timesfm_studio/data/foresee.db", what:"Cached forecasts, backtests, anomaly results, saved scenarios." },
  { path:"~/.timesfm_studio/adapters/", what:"Any fine-tuned adapters you create." },
  { path:"~/.timesfm_studio/jobs/", what:"Background job state for long-running operations." },
  { path:"~/.timesfm_studio/exports/", what:"PDFs and CSVs you export from reports." },
  { path:"~/.timesfm_studio/logs/", what:"App logs you can inspect if something goes wrong." },
];

export function PrivacyPage() {
  useDocumentTitle("Privacy");
  const resetStore = useDatasetStore((s) => s.reset);
  const [confirming, setConfirming] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [replayingTour, setReplayingTour] = useState(false);

  const replayTour = () => {
    clearTourDismissal();
    setReplayingTour(true);
  };

  const downloadLogBundle = () => {
    window.location.href = api.logBundleUrl;
  };

  const handleWipe = async () => {
    setWiping(true);
    try {
      const result = await api.wipeStorage();
      resetStore();
      toast.success(
        `Removed ${result.removed.length} folder${result.removed.length === 1 ?"" :"s"}`,
        { description:"Model weights were kept to avoid a redownload." },
      );
      setConfirming(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-text-primary">Privacy</h1>
        <p className="mt-2 text-text-secondary">
          Foresee is a local-first app. Your data stays on the machine running it.
        </p>
      </div>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-4">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          What Foresee writes to your machine
        </h2>
        <p className="text-sm text-text-secondary">
          Everything Foresee touches lives under
          <code className="mx-1 font-mono text-text-primary">~/.timesfm_studio/</code>
          (or
          <code className="mx-1 font-mono text-text-primary">%USERPROFILE%\.timesfm_studio\</code>
          on Windows). Delete that folder to remove all app data.
        </p>
        <ul className="space-y-2 text-sm">
          {STORAGE_INVENTORY.map((row) => (
            <li key={row.path} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <code className="font-mono text-xs text-text-primary shrink-0">{row.path}</code>
              <span className="text-text-secondary">{row.what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-3">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          What can leave your machine (opt-in only)
        </h2>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li>
            <span className="text-text-primary">LLM-generated narratives.</span> If you click a"Narrate" button, a summary of your forecast is sent to the LLM you have configured
            (OpenAI, Anthropic, or local). Foresee asks for your consent the first time, and the
            setting is stored locally. No LLM is called otherwise.
          </li>
          <li>
            <span className="text-text-primary">Webhook alerts.</span> If you create an alert rule
            with a webhook URL, alert payloads are POSTed to that URL.
          </li>
        </ul>
        <p className="text-xs text-text-muted">
          Foresee never sends telemetry, crash reports, or usage analytics automatically.
        </p>
      </section>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-4">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          Manage local data
        </h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-text-primary">Replay the intro tour</p>
            <p className="text-xs text-text-muted">
              5-step walkthrough of the main flow. Runs automatically on first visit.
            </p>
          </div>
          <button
            type="button"
            onClick={replayTour}
            className="inline-flex items-center gap-2 border border-accent/40 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10"
          >
            Replay tour
          </button>
        </div>

        <div className="border-t border-border/40 pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-text-primary">Download a log bundle</p>
            <p className="text-xs text-text-muted">
              Zipped copy of <code className="font-mono">~/.timesfm_studio/logs/</code>, useful when filing bug reports.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadLogBundle}
            className="inline-flex items-center gap-2 border border-accent/40 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10"
          >
            Download logs
          </button>
        </div>

        <div className="border-t border-border/40 pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-text-primary">Delete uploaded data</p>
            <p className="text-xs text-text-muted">
              Removes datasets, jobs, cached results, logs, adapters, and exports. The model weights stay so you don't have to redownload 1.2 GB. Cannot be undone.
            </p>
          </div>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleWipe}
                disabled={wiping}
                className="inline-flex items-center gap-2 border border-anomaly bg-anomaly/20 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-anomaly transition-all hover:bg-anomaly/30 disabled:opacity-40"
              >
                {wiping ?"Deleting..." :"Yes, delete it"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={wiping}
                className="inline-flex items-center gap-2 border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-all hover:border-text-primary hover:text-text-primary disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-2 border border-anomaly/40 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-anomaly transition-all hover:bg-anomaly/10"
            >
              Delete uploaded data
            </button>
          )}
        </div>

        <p className="text-xs text-text-muted pt-1">
          To also remove the 1.2 GB model weights, close Foresee and delete
          <code className="mx-1 font-mono">~/.timesfm_studio/models/</code>
          manually.
        </p>
      </section>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-3">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          How to remove all Foresee data
        </h2>
        <p className="text-sm text-text-secondary">
          Close the app and delete
          <code className="mx-1 font-mono text-text-primary">~/.timesfm_studio/</code>.
          That removes uploaded datasets, cached results, logs, and the model weights. Foresee does
          not write anywhere else on your machine.
        </p>
      </section>

      {replayingTour && <Tour force onClose={() => setReplayingTour(false)} />}
    </div>
  );
}
