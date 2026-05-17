import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import type { ColumnMapping } from "@/types/dataset";
import type { PreflightResult } from "@/types/phases";

export interface PreflightOrchestratorState {
  mapping: ColumnMapping | null;
  handleMappingChange: (m: ColumnMapping) => void;
  data: PreflightResult | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
  reset: () => void;
}

export function usePreflightOrchestrator(activeId: string | undefined): PreflightOrchestratorState {
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);

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

  return {
    mapping,
    handleMappingChange,
    data: runMutation.data,
    isPending: runMutation.isPending,
    isError: runMutation.isError,
    error: runMutation.error,
    mutate: runMutation.mutate,
    reset: runMutation.reset,
  };
}
