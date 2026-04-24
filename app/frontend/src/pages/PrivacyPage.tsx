import { useDocumentTitle } from "@/utils/useDocumentTitle";

export function PrivacyPage() {
  useDocumentTitle("Privacy");

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-text-primary">Privacy</h1>
        <p className="mt-2 text-text-secondary">
          Foresee is a local-first app. Your data stays on the machine running it.
        </p>
      </div>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-3">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          What stays local
        </h2>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li>
            <span className="text-text-primary">Your CSV uploads</span> — stored only in
            <code className="mx-1 font-mono text-text-primary">~/.timesfm_studio/datasets/</code>.
            Auto-purged after 24 hours by default.
          </li>
          <li>
            <span className="text-text-primary">Forecasts, backtests, anomaly results</span> — cached in a local SQLite database at
            <code className="mx-1 font-mono text-text-primary">~/.timesfm_studio/data/foresee.db</code>.
          </li>
          <li>
            <span className="text-text-primary">The TimesFM model</span> — downloaded once from HuggingFace on first run, cached at
            <code className="mx-1 font-mono text-text-primary">~/.cache/huggingface/hub/</code>.
          </li>
          <li>
            <span className="text-text-primary">Logs</span> — written to
            <code className="mx-1 font-mono text-text-primary">~/.timesfm_studio/logs/</code>
            for troubleshooting.
          </li>
        </ul>
      </section>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-3">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          What can leave your machine (opt-in only)
        </h2>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li>
            <span className="text-text-primary">LLM-generated narratives.</span> If you click a "Narrate" button, a summary of your forecast is sent to the LLM you have configured (OpenAI, Anthropic, or local). Foresee asks for your consent the first time, and the setting is stored locally. No LLM is called otherwise.
          </li>
          <li>
            <span className="text-text-primary">Webhook alerts.</span> If you create an alert rule with a webhook URL, alert payloads are POSTed to that URL.
          </li>
        </ul>
        <p className="text-xs text-text-muted">
          Foresee never sends telemetry, crash reports, or usage analytics automatically.
        </p>
      </section>

      <section className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-3">
        <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
          How to remove all Foresee data
        </h2>
        <p className="text-sm text-text-secondary">
          Close the app and delete the
          <code className="mx-1 font-mono text-text-primary">~/.timesfm_studio/</code>
          folder. The model cache lives separately at
          <code className="mx-1 font-mono text-text-primary">~/.cache/huggingface/hub/</code>
          — delete that too if you want to remove the model.
        </p>
      </section>
    </div>
  );
}
