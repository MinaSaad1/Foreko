import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CSVUpload } from "@/components/CSVUpload";
import { PageIntro } from "@/components/common/PageIntro";
import { useDatasetStore } from "@/stores/datasetStore";
import { loadDemoDataset } from "@/utils/loadDemoDataset";
import { toast } from "@/utils/toast";

export function UploadPage() {
  const navigate = useNavigate();
  const setPreview = useDatasetStore((s) => s.setPreview);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const handleDemo = async () => {
    setLoadingDemo(true);
    try {
      const preview = await loadDemoDataset();
      setPreview(preview);
      navigate(`/compare/${preview.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-text-primary">
          Upload your data
        </h1>
        <p className="mt-2 text-text-secondary">
          Drop a CSV with a date column and a numeric value column. Foresee will
          compare two forecasting approaches and recommend the one that fits
          your data better.
        </p>
      </div>

      <PageIntro pageKey="upload" />

      <CSVUpload onUploaded={(preview) => navigate(`/compare/${preview.id}`)} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border/40 bg-bg-surface/20 backdrop-blur-sm px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
            No data yet?
          </p>
          <p className="mt-1 text-sm text-text-primary">
            Try the built-in demo dataset — 3 years of daily sales.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDemo}
          disabled={loadingDemo}
          className="inline-flex items-center gap-2 border border-accent/60 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 hover:shadow-[0_0_12px_rgba(0,240,255,0.2)] disabled:opacity-40"
        >
          {loadingDemo ? "Loading demo…" : "Try demo dataset →"}
        </button>
      </div>

      <div className="rounded-panel border border-border/50 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-4 hover:border-text-muted/20 transition-all duration-300 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]">
        <h2 className="font-display text-sm font-medium text-text-primary uppercase tracking-widest">
          How it works
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-text-secondary">
          <li>Drop a CSV — a Date column and a numeric Value column is all you need.</li>
          <li>Map the columns and choose how far ahead to forecast.</li>
          <li>
            Foresee trains two models on your data, backtests them, and shows you
            which one performed better along with the forecast.
          </li>
        </ol>
        <p className="text-xs text-text-muted pt-1">
          Your data stays on this machine. Nothing is sent to the cloud.
        </p>
      </div>

      <div className="rounded-panel border border-border/30 bg-bg-surface/10 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
          Good CSV checklist
        </p>
        <ul className="mt-2 space-y-1 text-xs text-text-secondary">
          <li>• One row per time period (day, week, month).</li>
          <li>• A column that parses as a date (<code className="font-mono text-text-primary">2024-01-15</code>, <code className="font-mono text-text-primary">Jan 2024</code>, or Year + Month columns).</li>
          <li>• A numeric column — the value you want to forecast (sales, requests, usage, cost).</li>
          <li>• Optional: extra numeric or categorical columns become factors you can analyse.</li>
        </ul>
      </div>
    </div>
  );
}
