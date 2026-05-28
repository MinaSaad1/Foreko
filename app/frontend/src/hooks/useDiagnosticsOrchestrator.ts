import { useCallback, useState } from"react";
import { useMutation } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import type { ColumnMapping } from"@/types/dataset";
import type { DiagnosticsResult } from"@/types/phases";

export interface DiagnosticsOrchestratorState {
 mapping: ColumnMapping | null;
 handleMappingChange: (m: ColumnMapping) => void;
 horizon: number;
 setHorizon: (n: number) => void;
 model: string;
 setModel: (m: string) => void;
 data: DiagnosticsResult | undefined;
 isPending: boolean;
 isError: boolean;
 error: Error | null;
 mutate: () => void;
 reset: () => void;
}

export function useDiagnosticsOrchestrator(activeId: string | undefined): DiagnosticsOrchestratorState {
 const storeMapping = useDatasetStore((s) => s.mapping);
 const setStoreMapping = useDatasetStore((s) => s.setMapping);

 const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
 const [horizon, setHorizon] = useState(12);
 const [model, setModel] = useState("timesfm");

 const handleMappingChange = useCallback(
 (m: ColumnMapping) => {
 setMapping(m);
 setStoreMapping(m);
 },
 [setStoreMapping],
 );

 const runMutation = useMutation<DiagnosticsResult, Error>({
 mutationFn: () =>
 api.runDiagnostics({
 dataset_id: activeId!,
 mapping: mapping!,
 horizon,
 model,
 }),
 });

 return {
 mapping,
 handleMappingChange,
 horizon,
 setHorizon,
 model,
 setModel,
 data: runMutation.data,
 isPending: runMutation.isPending,
 isError: runMutation.isError,
 error: runMutation.error,
 mutate: runMutation.mutate,
 reset: runMutation.reset,
 };
}
