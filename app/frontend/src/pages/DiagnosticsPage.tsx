import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { ResidualHistogram } from "@/components/diagnostics/ResidualHistogram";
import { QQPlot } from "@/components/diagnostics/QQPlot";
import { ACFChart } from "@/components/diagnostics/ACFChart";
import { STLPanel } from "@/components/diagnostics/STLPanel";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { Term } from "@/components/common/Term";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import { useDiagnosticsOrchestrator } from "@/hooks/useDiagnosticsOrchestrator";

export function DiagnosticsPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";

  const { mapping, handleMappingChange, horizon, setHorizon, model, setModel, data, isPending, isError, error, mutate, reset } =
    useDiagnosticsOrchestrator(activeId);

  const result = data;

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Forecast Diagnostics"
        pageKey="diagnostics"
        basePath="/diagnostics"
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Forecast Diagnostics</h1>
        <p className="mt-1 text-sm text-text-secondary">
          <Term k="residual">Residual</Term> analysis, <Term k="qq-plot">Q-Q plot</Term>,{" "}
          <Term k="autocorrelation">autocorrelation</Term>,{" "}
          <Term k="stl">STL decomposition</Term>, and <Term k="ljung-box">Ljung-Box test</Term>.
        </p>
        {preview && (
          <p className="mt-1 text-sm text-text-muted font-mono">
            {preview.filename} · {preview.row_count.toLocaleString()} rows
          </p>
        )}
      </div>

      <PageIntro pageKey="diagnostics" />

      {!result && (
        <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
          {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

          <div className="flex items-end gap-4">
            <div>
              <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
                Horizon
              </label>
              <input
                type="number"
                min={1}
                max={256}
                value={horizon}
                onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
                className="w-24 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
              />
            </div>
            <div>
              <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                <option value="timesfm">TimesFM</option>
                <option value="ets">ETS</option>
                <option value="seasonal_naive">Seasonal Naive</option>
              </select>
            </div>
          </div>

          {isError && (
            <p className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {error?.message}
            </p>
          )}

          <button
            onClick={() => mutate()}
            disabled={!mapping || isPending || !modelReady}
            className="w-full btn-terminal-primary"
          >
            {isPending ? "Running..." : "Run diagnostics"}
          </button>
          {!modelReady && (
            <p className="text-xs text-text-muted text-center">Model still loading, the Run button will enable when it's ready.</p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-panel border border-border bg-bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Residual mean</p>
              <p className="mt-2 font-display text-xl text-text-primary">
                {result.residual_stats.mean.toFixed(2)}
              </p>
              <p className="mt-1 font-mono text-xs text-text-muted">std: {result.residual_stats.std.toFixed(2)}</p>
            </div>
            <div className="rounded-panel border border-border bg-bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Skewness</p>
              <p className="mt-2 font-display text-xl text-text-primary">
                {result.residual_stats.skew.toFixed(2)}
              </p>
              <p className="mt-1 font-mono text-xs text-text-muted">
                kurt: {result.residual_stats.kurtosis.toFixed(2)}
              </p>
            </div>
            <div className="rounded-panel border border-border bg-bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Ljung-Box p</p>
              <p className="mt-2 font-display text-xl text-text-primary">
                {result.ljung_box.p_value.toFixed(3)}
              </p>
              <p className="mt-1 font-mono text-xs text-text-muted">
                {result.ljung_box.p_value < 0.05 ? "autocorrelated residuals" : "white-noise residuals"}
              </p>
            </div>
            <div className="rounded-panel border border-border bg-bg-surface p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Period</p>
              <p className="mt-2 font-display text-xl text-text-primary">{result.period}</p>
              <p className="mt-1 font-mono text-xs text-text-muted">freq: {result.freq}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Residual distribution</p>
              <ResidualHistogram
                centers={result.residual_histogram.centers}
                counts={result.residual_histogram.counts}
                mean={result.residual_stats.mean}
                std={result.residual_stats.std}
              />
            </div>
            <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Q-Q plot</p>
              <QQPlot points={result.qq_points} />
            </div>
          </div>

          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
              Autocorrelation of residuals
            </p>
            <ACFChart acf={result.acf} n={result.n_points} />
          </div>

          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">STL decomposition</p>
            <STLPanel
              dates={result.stl_dates}
              observed={result.stl.observed}
              trend={result.stl.trend}
              seasonal={result.stl.seasonal}
              residual={result.stl.residual}
            />
          </div>

          <button
            onClick={() => reset()}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change settings
          </button>
        </div>
      )}
    </div>
  );
}
