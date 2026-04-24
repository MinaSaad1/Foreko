import { useState } from "react";
import { api } from "@/api/endpoints";
import { friendlyError } from "@/utils/toast";

const CONSENT_STORAGE_KEY = "foresee:llm-consent";

function readConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeConsent(value: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // localStorage unavailable — best effort
  }
}

interface Props {
  kind: "forecast" | "anomaly" | "factors";
  payload: unknown;
}

export function NarrativeCard({ kind, payload }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState<boolean>(readConsent());

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const fn =
        kind === "forecast" ? api.narrateForecast :
        kind === "anomaly" ? api.narrateAnomaly :
        api.narrateFactors;
      const res = await fn(payload);
      setMarkdown(res.markdown);
      setSource(res.source);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const grantConsent = () => {
    writeConsent(true);
    setConsented(true);
  };

  if (!consented) {
    return (
      <div className="rounded-panel border border-warning/40 border-l-2 border-l-warning bg-bg-surface/40 backdrop-blur-sm p-5 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-warning">
          One-time consent
        </p>
        <h3 className="font-display text-sm font-medium text-text-primary">
          Generate a plain-English narrative?
        </h3>
        <p className="text-xs leading-relaxed text-text-secondary">
          This sends a JSON summary of your current forecast or analysis to the LLM configured by whoever runs Foresee. It may be an external service (OpenAI, Anthropic) or a local model. Raw CSV rows are not sent — only aggregated numbers and metadata.
        </p>
        <p className="text-xs text-text-muted">
          You can change this choice by clearing site data for this app.
        </p>
        <button
          type="button"
          onClick={grantConsent}
          className="border border-accent bg-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bg-base hover:opacity-90"
        >
          Allow narratives
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
          Explain this
        </h3>
        {markdown && (
          <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
            source: {source}
          </span>
        )}
      </div>
      {!markdown && (
        <button
          onClick={run}
          disabled={loading}
          className="rounded-md border border-accent/30 bg-accent-dim px-3 py-1.5 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40"
        >
          {loading ? "Generating…" : "Generate narrative"}
        </button>
      )}
      {error && (
        <p className="rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-xs text-anomaly">{error}</p>
      )}
      {markdown && (
        <div className="prose prose-invert max-w-none text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
          {markdown}
        </div>
      )}
    </div>
  );
}
