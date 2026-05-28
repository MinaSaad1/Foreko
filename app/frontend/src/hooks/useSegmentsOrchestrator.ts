import { useCallback, useState } from"react";
import { useMutation } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import type { ColumnMapping } from"@/types/dataset";
import type { SegmentsResult } from"@/types/phases";

export interface SegmentsOrchestratorState {
 mapping: ColumnMapping | null;
 handleMappingChange: (m: ColumnMapping) => void;
 topN: number;
 setTopN: (n: number) => void;
 sortBy: "total" | "growth" | "volatility";
 setSortBy: (s: "total" | "growth" | "volatility") => void;
 data: SegmentsResult | undefined;
 isPending: boolean;
 isError: boolean;
 error: Error | null;
 mutate: () => void;
 reset: () => void;
}

export function useSegmentsOrchestrator(activeId: string | undefined): SegmentsOrchestratorState {
 const storeMapping = useDatasetStore((s) => s.mapping);
 const setStoreMapping = useDatasetStore((s) => s.setMapping);

 const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
 const [topN, setTopN] = useState(10);
 const [sortBy, setSortBy] = useState<"total" | "growth" | "volatility">("total");

 const handleMappingChange = useCallback(
 (m: ColumnMapping) => {
 setMapping(m);
 setStoreMapping(m);
 },
 [setStoreMapping],
 );

 const runMutation = useMutation<SegmentsResult, Error>({
 mutationFn: () =>
 api.compareSegments({
 dataset_id: activeId!,
 mapping: mapping!,
 top_n: topN,
 }),
 });

 return {
 mapping,
 handleMappingChange,
 topN,
 setTopN,
 sortBy,
 setSortBy,
 data: runMutation.data,
 isPending: runMutation.isPending,
 isError: runMutation.isError,
 error: runMutation.error,
 mutate: runMutation.mutate,
 reset: runMutation.reset,
 };
}
