import { useCallback, useState } from"react";
import { useMutation } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import type { ColumnMapping } from"@/types/dataset";
import type { AnomalyResponse } from"@/types/anomaly";

export interface AnomalyOrchestratorState {
 mapping: ColumnMapping | null;
 handleMappingChange: (m: ColumnMapping) => void;
 horizon: number;
 setHorizon: (n: number) => void;
 data: AnomalyResponse | undefined;
 isPending: boolean;
 isError: boolean;
 error: Error | null;
 mutate: () => void;
 reset: () => void;
}

export function useAnomalyOrchestrator(activeId: string | undefined): AnomalyOrchestratorState {
 const storeMapping = useDatasetStore((s) => s.mapping);
 const setStoreMapping = useDatasetStore((s) => s.setMapping);

 const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
 const [horizon, setHorizon] = useState(12);

 const handleMappingChange = useCallback(
 (m: ColumnMapping) => {
 setMapping(m);
 setStoreMapping(m);
 },
 [setStoreMapping],
 );

 const detectMutation = useMutation<AnomalyResponse, Error>({
 mutationFn: () =>
 api.detectAnomalies({
 dataset_id: activeId!,
 mapping: mapping!,
 horizon,
 critical_z: 3.0,
 warning_z: 2.0,
 }),
 });

 return {
 mapping,
 handleMappingChange,
 horizon,
 setHorizon,
 data: detectMutation.data,
 isPending: detectMutation.isPending,
 isError: detectMutation.isError,
 error: detectMutation.error,
 mutate: detectMutation.mutate,
 reset: detectMutation.reset,
 };
}
