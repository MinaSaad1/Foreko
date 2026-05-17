import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import type { ColumnMapping } from "@/types/dataset";
import type { ComparisonResponse } from "@/types/comparison";

export interface ComparisonOrchestratorState {
  mapping: ColumnMapping | null;
  handleMappingChange: (m: ColumnMapping) => void;
  horizon: number;
  setHorizon: (n: number) => void;
  result: ComparisonResponse | null;
  setResult: (r: ComparisonResponse | null) => void;
  isRunning: boolean;
  isError: boolean;
  error: Error | null;
  startComparison: () => void;
  reset: () => void;
}

export function useComparisonOrchestrator(activeId: string | undefined): ComparisonOrchestratorState {
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [horizon, setHorizon] = useState(12);
  const [result, setResult] = useState<ComparisonResponse | null>(null);

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const compareMutation = useMutation({
    mutationFn: () =>
      api.runComparison({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
      }),
    onSuccess: (data) => setResult(data),
  });

  const startComparison = useCallback(() => {
    compareMutation.reset();
    compareMutation.mutate();
  }, [compareMutation]);

  const reset = useCallback(() => {
    setResult(null);
    compareMutation.reset();
  }, [compareMutation]);

  return {
    mapping,
    handleMappingChange,
    horizon,
    setHorizon,
    result,
    setResult,
    isRunning: compareMutation.isPending,
    isError: compareMutation.isError,
    error: compareMutation.error,
    startComparison,
    reset,
  };
}
