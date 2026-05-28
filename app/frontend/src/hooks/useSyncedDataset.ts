import { useEffect } from"react";
import { useQuery } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import type { DatasetPreview } from"@/types/dataset";

interface SyncedDataset {
 activeId: string | undefined;
 preview: DatasetPreview | undefined;
 isLoading: boolean;
 isError: boolean;
}

export function useSyncedDataset(datasetId: string | undefined): SyncedDataset {
 const activeDatasetId = useDatasetStore((s) => s.activeDatasetId);
 const setActiveDatasetId = useDatasetStore((s) => s.setActiveDatasetId);
 const activeId = datasetId ?? activeDatasetId ?? undefined;

 // When the URL carries a dataset id, sync it into the store so the chrome
 // (StatusBar's DATASET segment, sidebar's active-dataset badge) reflects the
 // currently-viewed dataset even on direct navigation or refresh.
 useEffect(() => {
 if (datasetId && datasetId !== activeDatasetId) {
 setActiveDatasetId(datasetId);
 }
 }, [datasetId, activeDatasetId, setActiveDatasetId]);

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
