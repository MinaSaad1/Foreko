import { useNavigate } from "react-router-dom";
import { DataSourceSelector } from "@/components/DataSourceSelector";
import { SamplesPicker } from "@/components/SamplesPicker";
import { PageIntro } from "@/components/common/PageIntro";

export function UploadPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-text-primary">
          Upload your data
        </h1>
        <p className="mt-2 text-text-secondary">
          Drop a data file (CSV, Excel, Parquet, or JSON) or connect directly
          to a database. Foresee will compare two forecasting approaches and
          recommend the one that fits your data better.
        </p>
      </div>

      <PageIntro pageKey="upload" />

      <DataSourceSelector
        onDatasetReady={(preview) => navigate(`/compare/${preview.id}`)}
      />

      <SamplesPicker />

      <div className="rounded-panel border border-border/50 bg-bg-surface/30 backdrop-blur-sm p-6 space-y-4 hover:border-text-muted/20 transition-all duration-300 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]">
        <h2 className="font-display text-sm font-medium text-text-primary uppercase tracking-widest">
          How it works
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-text-secondary">
          <li>Drop a CSV. A Date column and a numeric Value column is all you need.</li>
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
          <li>• A numeric column: the value you want to forecast (sales, requests, usage, cost).</li>
          <li>• Optional: extra numeric or categorical columns become factors you can analyse.</li>
        </ul>
      </div>
    </div>
  );
}
