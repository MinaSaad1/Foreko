import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DataQualityCard } from "@/components/preflight/DataQualityCard";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import {
  LeftRail,
  PageHeader,
  RailResetButton,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { usePreflightOrchestrator } from "@/hooks/usePreflightOrchestrator";

export function PreflightPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { mapping, handleMappingChange, data, isPending, isError, error, mutate, reset } =
    usePreflightOrchestrator(activeId);

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Data Quality Preflight"
        pageKey="preflight"
        basePath="/preflight"
      />
    );
  }

  const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Preflight";

  return (
    <ThreeRailLayout
      left={
        <LeftRail ariaLabel="Preflight configuration">
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

          <RailSection label="Checks">
            <RailRow k="Stationarity" v="ADF" />
            <RailRow k="Seasonality" v="STL period" />
            <RailRow k="Outliers" v="z-score" />
            <RailRow k="Missing data" v="gap scan" />
          </RailSection>

          {data && <RailResetButton onClick={() => reset()} />}
        </LeftRail>
      }
      right={
        <RightRail ariaLabel="Preflight insights">
          {!data && (
            <WhatYoullGet
              summary="A pre-forecast health check on your series. Surfaces stationarity, seasonality, outliers, missing data, and recommends transformations before you trust a forecast."
              reading={[
                "Green checks = forecast-ready. Yellow = run with caution.",
                "Red = fix the data (or pick a transform) before forecasting.",
                "Use the recommended transformation in the Forecast page to test the fix.",
              ]}
            />
          )}
          {data && (
            <>
              <RailSection label="Summary">
                <RailRow
                  k="Quality"
                  v={`${Math.round(data.quality_score * 100)} / 100`}
                  tone={data.quality_score >= 0.8 ? "ok" : data.quality_score >= 0.5 ? "warn" : "err"}
                />
                <RailRow k="Length" v={`${data.n_points} points`} />
                <RailRow k="Freq" v={data.freq || "unknown"} />
                <RailRow k="Period" v={String(data.period)} />
              </RailSection>
              <RailSection label="Series shape">
                <RailRow k="Missing" v={`${data.missing_count} (${(data.missing_rate * 100).toFixed(1)}%)`} tone={data.missing_count > 0 ? "warn" : "ok"} />
                <RailRow k="Outliers" v={String(data.outlier_count)} tone={data.outlier_count > 0 ? "warn" : "ok"} />
                <RailRow k="Stationary" v={data.adf.stationary ? "Yes" : "No"} tone={data.adf.stationary ? "ok" : "warn"} />
              </RailSection>
            </>
          )}
        </RightRail>
      }
    >
      <PageHeader
        kicker="Data quality"
        title={displayName}
        subtitle={preview ? `${preview.row_count.toLocaleString()} rows · preflight` : undefined}
      />

      <div className="lg:hidden">
        <PageIntro pageKey="preflight" />
      </div>

      {!data && preview && (
        <div className="border border-border-strong/70 bg-bg-surface px-6 py-6 space-y-5 shadow-[var(--shadow-elev-1)]">
          <div className="flex items-center gap-2">
            <span className="text-accent leading-none" aria-hidden>▣</span>
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
              Set up the preflight check
            </h2>
          </div>
          <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />
          <button
            onClick={() => mutate()}
            disabled={!mapping || isPending}
            className="w-full btn-terminal-primary"
          >
            {isPending ? "Scanning…" : "Run preflight"}
          </button>
          {isError && (
            <p className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {error?.message}
            </p>
          )}
        </div>
      )}

      {data && <DataQualityCard data={data} />}
    </ThreeRailLayout>
  );
}
