import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DataQualityCard } from "@/components/preflight/DataQualityCard";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { RunError } from "@/components/common/RunError";
import {
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { usePreflightOrchestrator } from "@/hooks/usePreflightOrchestrator";

export function PreflightPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { mapping, handleMappingChange, data, isPending, error, mutate, reset } =
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
    <div className="flex flex-col gap-6">
      <PageHeading
        kicker="Data quality"
        title={displayName}
        intro="A pre-forecast health check on your series. Surfaces stationarity, seasonality, outliers, missing data, and recommends transformations before you trust a forecast."
      />

      <FactGrid columns={2}>
        <Fact label="File" value={preview ? preview.filename : "Loading..."} />
        <Fact
          label="Rows"
          value={preview ? preview.row_count.toLocaleString() : "Loading..."}
        />
      </FactGrid>

      {!data && preview && (
        <Section title="Set up the preflight check">
          {/* The four checks were a static left-rail list, so they were both
              inert and invisible below lg. They are one sentence about what
              the Run button is about to do, which is all they ever were. */}
          <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
            Four checks run on the series you map: stationarity (ADF), seasonality
            (STL period), outliers (z-score), and missing data (gap scan).
          </p>

          <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />

          <button
            onClick={() => mutate()}
            disabled={!mapping || isPending}
            className="mt-4 w-full btn-terminal-primary"
          >
            {isPending ? "Scanning…" : "Run preflight"}
          </button>

          <div className="mt-3">
            <RunError error={error} label="Preflight" />
          </div>
        </Section>
      )}

      {data && <DataQualityCard data={data} />}

      <Depth label="Reading the result">
        <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>Green checks = forecast-ready. Yellow = run with caution.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              Red = fix the data (or pick a transform) before forecasting.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              Use the recommended transformation in the Forecast page to test the fix.
            </span>
          </li>
        </ul>
      </Depth>

      {data && (
        <SecondaryActions>
          <button type="button" onClick={() => reset()} className="btn-terminal">
            ← Change settings
          </button>
        </SecondaryActions>
      )}
    </div>
  );
}
