import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import type { ColumnMapping } from "@/types/dataset";
import type {
  AnomalyMethodsResult,
  ChangepointsResult,
  LagResult,
  RootCauseResult,
  GrangerRow,
} from "@/types/phases";

export interface ExplainOrchestratorState {
  mapping: ColumnMapping | null;
  handleMappingChange: (m: ColumnMapping) => void;
  numericFactors: string[];
  setNumericFactors: (f: string[] | ((prev: string[]) => string[])) => void;
  categoricalFactors: string[];
  setCategoricalFactors: (f: string[] | ((prev: string[]) => string[])) => void;
  anomalyMethodsMutation: UseMutationResult<AnomalyMethodsResult, Error, void, unknown>;
  rootCauseMutation: UseMutationResult<RootCauseResult, Error, void, unknown>;
  changepointsMutation: UseMutationResult<ChangepointsResult, Error, void, unknown>;
  lagMutation: UseMutationResult<{ results: LagResult[]; max_lag: number }, Error, void, unknown>;
  grangerMutation: UseMutationResult<{ results: GrangerRow[] }, Error, void, unknown>;
}

export function useExplainOrchestrator(activeId: string | undefined): ExplainOrchestratorState {
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [numericFactors, setNumericFactors] = useState<string[]>([]);
  const [categoricalFactors, setCategoricalFactors] = useState<string[]>([]);

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const anomalyMethodsMutation = useMutation<AnomalyMethodsResult, Error, void, unknown>({
    mutationFn: () => api.detectAnomalyMethods({ dataset_id: activeId!, mapping: mapping! }),
  });

  const rootCauseMutation = useMutation<RootCauseResult, Error, void, unknown>({
    mutationFn: () =>
      api.explainAnomalies({
        dataset_id: activeId!,
        mapping: mapping!,
        anomaly_dates: (anomalyMethodsMutation.data?.records ?? []).map((r) => r.date),
        numeric_factors: numericFactors,
        categorical_factors: categoricalFactors,
      }),
  });

  const changepointsMutation = useMutation<ChangepointsResult, Error, void, unknown>({
    mutationFn: () => api.detectChangepoints({ dataset_id: activeId!, mapping: mapping!, penalty: 10 }),
  });

  const lagMutation = useMutation<{ results: LagResult[]; max_lag: number }, Error, void, unknown>({
    mutationFn: () =>
      api.lagAnalysis({
        dataset_id: activeId!,
        mapping: mapping!,
        numeric_factors: numericFactors,
        max_lag: 14,
      }),
  });

  const grangerMutation = useMutation<{ results: GrangerRow[] }, Error, void, unknown>({
    mutationFn: () =>
      api.grangerTests({
        dataset_id: activeId!,
        mapping: mapping!,
        numeric_factors: numericFactors,
        max_lag: 5,
      }),
  });

  return {
    mapping,
    handleMappingChange,
    numericFactors,
    setNumericFactors,
    categoricalFactors,
    setCategoricalFactors,
    anomalyMethodsMutation,
    rootCauseMutation,
    changepointsMutation,
    lagMutation,
    grangerMutation,
  };
}
