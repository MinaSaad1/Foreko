import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import type { DatasetPreview } from "@/types/dataset";

interface SyncedDataset {
  activeId: string | undefined;
  preview: DatasetPreview | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useSyncedDataset(datasetId: string | undefined): SyncedDataset {
  const activeDatasetId = useDatasetStore((s) => s.activeDatasetId);
  const activeId = datasetId ?? activeDatasetId ?? undefined;

  const query = useQuery({
    queryKey: ["dataset-preview", activeId],
    queryFn: () => api.datasetPreview(activeId!),
    enabled: !!activeId,
  });

  return {
    activeId,
    preview: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
