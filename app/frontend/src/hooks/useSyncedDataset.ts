import { useEffect } from "react";
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
  const storePreview = useDatasetStore((s) => s.preview);
  const setStorePreview = useDatasetStore((s) => s.setPreview);

  const activeId = datasetId ?? storePreview?.id;

  const query = useQuery({
    queryKey: ["dataset-preview", activeId],
    queryFn: () => api.datasetPreview(activeId!),
    enabled: !!activeId,
    initialData: activeId === storePreview?.id ? storePreview ?? undefined : undefined,
  });

  useEffect(() => {
    if (query.data && query.data.id !== storePreview?.id) {
      setStorePreview(query.data);
    }
  }, [query.data, storePreview?.id, setStorePreview]);

  return {
    activeId,
    preview: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
