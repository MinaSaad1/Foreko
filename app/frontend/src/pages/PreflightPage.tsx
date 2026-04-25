import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DataQualityCard } from "@/components/preflight/DataQualityCard";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { Term } from "@/components/common/Term";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import type { ColumnMapping } from "@/types/dataset";
import type { PreflightResult } from "@/types/phases";

export function PreflightPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const { activeId, preview } = useSyncedDataset(datasetId);

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const runMutation = useMutation<PreflightResult, Error>({
    mutationFn: () =>
      api.runPreflight({
        dataset_id: activeId!,
        mapping: mapping!,
      }),
  });

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

      {!runMutation.data && (
        <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
          {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}
          <button
            onClick={() => runMutation.mutate()}
            disabled={!mapping || runMutation.isPending}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {runMutation.isPending ? "Scanning…" : "Run preflight"}
          </button>
          {runMutation.isError && (
            <p className="rounded-md border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {runMutation.error.message}
            </p>
          )}
        </div>
      )}

      {runMutation.data && (
        <>
          <DataQualityCard data={runMutation.data} />
          <button
            onClick={() => runMutation.reset()}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change settings
          </button>
        </>
      )}
    </div>
  );
}
