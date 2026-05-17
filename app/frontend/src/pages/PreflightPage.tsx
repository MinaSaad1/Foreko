import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DataQualityCard } from "@/components/preflight/DataQualityCard";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { Term } from "@/components/common/Term";
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Data Quality Preflight</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Run this before forecasting. Checks <Term k="stationarity">stationarity</Term>,{" "}
          <Term k="seasonality">seasonality</Term>, outliers, and missing data, and recommends transformations.
        </p>
      </div>

      <PageIntro pageKey="preflight" />

      {!data && (
        <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
          {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}
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

      {data && (
        <>
          <DataQualityCard data={data} />
          <button
            onClick={() => reset()}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change settings
          </button>
        </>
      )}
    </div>
  );
}
