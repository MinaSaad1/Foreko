import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { ResidualHistogram } from "@/components/diagnostics/ResidualHistogram";
import { QQPlot } from "@/components/diagnostics/QQPlot";
import { ACFChart } from "@/components/diagnostics/ACFChart";
import { STLPanel } from "@/components/diagnostics/STLPanel";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { RunError } from "@/components/common/RunError";
import {
  ChoiceGrid,
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import { useDiagnosticsOrchestrator } from "@/hooks/useDiagnosticsOrchestrator";

const HORIZON_OPTIONS = [
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 12, label: "12" },
  { value: 24, label: "24" },
];

const MODEL_OPTIONS = [
  { value: "timesfm", label: "TimesFM" },
  { value: "ets", label: "ETS" },
  { value: "seasonal_naive", label: "Naive" },
];

/** One chart, its heading, and the one sentence that says how to read it. */
function ChartCell({
  title,
  help,
  span,
  children,
}: {
  title: string;
  help: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`border-r border-b border-border-strong/70 p-4 space-y-2 ${
        span ? "md:col-span-2" : ""
      }`}
    >
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
        {title}
      </h3>
      <p className="text-xs text-text-muted">{help}</p>
      {children}
    </div>
  );
}

export function DiagnosticsPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";

  const { mapping, handleMappingChange, horizon, setHorizon, model, setModel, data, isPending, error, mutate, reset } =
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

  const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Diagnostics";
  const autocorrelated = result ? result.ljung_box.p_value < 0.05 : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        kicker="Inspect"
        title={displayName}
        intro="Residual analysis on a held-out forecast. Surfaces residual distribution, Q-Q plot, autocorrelation, STL decomposition, and the Ljung-Box white-noise test."
      />

      <FactGrid>
        <Fact label="File" value={preview ? preview.filename : "Loading..."} />
        <Fact
          label="Rows"
          value={preview ? preview.row_count.toLocaleString() : "Loading..."}
        />
        <Fact label="Model" value={model} />
        <Fact label="Horizon" value={String(horizon)} />
      </FactGrid>

      {!result && (
        // Horizon and Model were left-rail only, so below lg the header
        // reported the model back to a user who had no way to change it.
        // They now sit on the panel whose Run button consumes them.
        <Section
          title="Set up diagnostics"
          controls={
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span id="diagnostics-horizon-label" className="text-xs text-text-muted">
                  Horizon
                </span>
                <div role="group" aria-labelledby="diagnostics-horizon-label">
                  <ChoiceGrid
                    options={HORIZON_OPTIONS}
                    value={horizon}
                    onChange={setHorizon}
                    columns={2}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span id="diagnostics-model-label" className="text-xs text-text-muted">
                  Model
                </span>
                <div role="group" aria-labelledby="diagnostics-model-label">
                  <ChoiceGrid
                    options={MODEL_OPTIONS}
                    value={model}
                    onChange={setModel}
                    columns={3}
                  />
                </div>
              </div>
            </div>
          }
        >
          {preview && (
            <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />
          )}

          <div className="mt-4">
            <RunError error={error} label="Diagnostics" />
          </div>

          <button
            onClick={() => mutate()}
            disabled={!mapping || isPending || !modelReady}
            className="mt-4 w-full btn-terminal-primary"
          >
            {isPending ? "Running..." : "Run diagnostics"}
          </button>
          {!modelReady && (
            <p className="mt-2 text-center text-[13px] text-text-secondary">
              Model still loading, the Run button enables when it's ready.
            </p>
          )}
        </Section>
      )}

      {result && (
        <>
          <FactGrid>
            <Fact label="Residual mean" value={result.residual_stats.mean.toFixed(3)} />
            <Fact label="Residual std" value={result.residual_stats.std.toFixed(3)} />
            <Fact label="Skew" value={result.residual_stats.skew.toFixed(2)} />
            <Fact label="Kurtosis" value={result.residual_stats.kurtosis.toFixed(2)} />
            <Fact label="Ljung-Box p" value={result.ljung_box.p_value.toFixed(3)} />
            <Fact
              label="Verdict"
              value={autocorrelated ? "Autocorrelated" : "White noise"}
            />
            <Fact label="Period" value={String(result.period)} />
            <Fact label="Freq" value={result.freq} />
          </FactGrid>

          <Section title="Residual diagnostics">
            {/* Was four identical `rounded-panel border bg-bg-surface p-5`
                cards stamped in a grid. Shared-border seams instead: the
                container carries left and top, each cell right and bottom. */}
            <div className="grid grid-cols-1 border-l border-t border-border-strong/70 md:grid-cols-2">
              <ChartCell
                title="Residual distribution"
                help="The histogram should look bell-shaped and centered near 0."
              >
                <ResidualHistogram
                  centers={result.residual_histogram.centers}
                  counts={result.residual_histogram.counts}
                  mean={result.residual_stats.mean}
                  std={result.residual_stats.std}
                />
              </ChartCell>

              <ChartCell
                title="Q-Q plot"
                help="Dots on the diagonal mean normally distributed residuals."
              >
                <QQPlot points={result.qq_points} />
              </ChartCell>

              <ChartCell
                title="Autocorrelation of residuals"
                help="Ljung-Box p below 0.05 means the residuals carry leftover structure, so widen the model."
                span
              >
                <ACFChart acf={result.acf} n={result.n_points} />
              </ChartCell>

              <ChartCell
                title="STL decomposition"
                help="Splits the series into trend, seasonal, and residual parts, so you can see which one the model is missing."
                span
              >
                <STLPanel
                  dates={result.stl_dates}
                  observed={result.stl.observed}
                  trend={result.stl.trend}
                  seasonal={result.stl.seasonal}
                  residual={result.stl.residual}
                />
              </ChartCell>
            </div>
          </Section>
        </>
      )}

      {/* Before a run there are no charts to hang these on, which is exactly
          when the right rail used to show them. Once a result exists, each
          line lives on the chart it explains instead. */}
      {!result && (
        <Depth label="Reading the result">
          <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>
                ▸
              </span>
              <span>
                Residual histogram should look bell-shaped and centered near 0.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>
                ▸
              </span>
              <span>Q-Q dots on the diagonal = normally distributed residuals.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>
                ▸
              </span>
              <span>
                Ljung-Box p below 0.05 means residuals carry leftover structure, so
                widen the model.
              </span>
            </li>
          </ul>
        </Depth>
      )}

      {result && (
        <SecondaryActions>
          <button type="button" onClick={() => reset()} className="btn-terminal">
            ← Change settings
          </button>
        </SecondaryActions>
      )}
    </div>
  );
}
