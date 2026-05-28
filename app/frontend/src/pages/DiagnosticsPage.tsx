import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { ResidualHistogram } from "@/components/diagnostics/ResidualHistogram";
import { QQPlot } from "@/components/diagnostics/QQPlot";
import { ACFChart } from "@/components/diagnostics/ACFChart";
import { STLPanel } from "@/components/diagnostics/STLPanel";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import {
  LeftRail,
  PageHeader,
  RailChoiceGrid,
  RailResetButton,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
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

  const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Diagnostics";

  return (
    <ThreeRailLayout
      left={
        <LeftRail ariaLabel="Diagnostics configuration">
          <RailSection label="Dataset">
            {preview ? (
              <>
                <RailRow k="File" v={preview.filename} />
                <RailRow k="Rows" v={preview.row_count.toLocaleString()} />
              </>
            ) : (
              <p className="font-mono text-[10px] text-text-faint">Loading…</p>
            )}
          </RailSection>

          <RailSection label="Horizon">
            <RailChoiceGrid
              options={HORIZON_OPTIONS}
              value={horizon}
              onChange={setHorizon}
              disabled={!!result}
              columns={2}
            />
          </RailSection>

          <RailSection label="Model">
            <RailChoiceGrid
              options={MODEL_OPTIONS}
              value={model}
              onChange={setModel}
              disabled={!!result}
              columns={3}
            />
          </RailSection>

          {result && <RailResetButton onClick={() => reset()} />}
        </LeftRail>
      }
      right={
        <RightRail ariaLabel="Diagnostics insights">
          {!result && (
            <WhatYoullGet
              summary="Residual analysis on a held-out forecast. Surfaces residual distribution, Q-Q plot, autocorrelation, STL decomposition, and the Ljung-Box white-noise test."
              reading={[
                "Residual histogram should look bell-shaped and centered near 0.",
                "Q-Q dots on the diagonal = normally distributed residuals.",
                "Ljung-Box p < 0.05 = residuals carry leftover structure; widen the model.",
              ]}
            />
          )}
          {result && (
            <>
              <RailSection label="Residuals">
                <RailRow k="Mean" v={result.residual_stats.mean.toFixed(3)} />
                <RailRow k="Std" v={result.residual_stats.std.toFixed(3)} />
                <RailRow k="Skew" v={result.residual_stats.skew.toFixed(2)} />
                <RailRow k="Kurtosis" v={result.residual_stats.kurtosis.toFixed(2)} />
              </RailSection>
              <RailSection label="Ljung-Box">
                <RailRow
                  k="p-value"
                  v={result.ljung_box.p_value.toFixed(3)}
                  tone={result.ljung_box.p_value < 0.05 ? "warn" : "ok"}
                />
                <RailRow
                  k="Verdict"
                  v={result.ljung_box.p_value < 0.05 ? "Autocorrelated" : "White noise"}
                  tone={result.ljung_box.p_value < 0.05 ? "warn" : "ok"}
                />
              </RailSection>
              <RailSection label="Series">
                <RailRow k="Period" v={String(result.period)} />
                <RailRow k="Freq" v={result.freq} />
              </RailSection>
            </>
          )}
        </RightRail>
      }
    >
      <PageHeader
        kicker="Inspect"
        title={displayName}
        subtitle={preview ? `${preview.row_count.toLocaleString()} rows · ${model} · horizon ${horizon}` : undefined}
      />

      <div className="lg:hidden">
        <PageIntro pageKey="diagnostics" />
      </div>

      {!result && (
        <div className="border border-border-strong/70 bg-bg-surface px-6 py-6 space-y-5 shadow-[var(--shadow-elev-1)]">
          <div className="flex items-center gap-2">
            <span className="text-accent leading-none" aria-hidden>▣</span>
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
              Set up diagnostics
            </h2>
          </div>

          {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

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
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted text-center">
              Model still loading; the Run button enables when it's ready.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-5">
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
        </div>
      )}
    </ThreeRailLayout>
  );
}
