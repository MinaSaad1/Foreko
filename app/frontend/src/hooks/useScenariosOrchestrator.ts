import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import type { ColumnMapping } from "@/types/dataset";
import type { ScenarioRunResult, ScenarioCompareResult } from "@/types/phases";

export interface FactorOverride {
  value: number;
  rampTo?: number;
  mode: "flat" | "ramp";
}

type Scenario = { id: string; label: string; created_at: string };

export interface ScenariosOrchestratorState {
  mapping: ColumnMapping | null;
  handleMappingChange: (m: ColumnMapping) => void;
  horizon: number;
  setHorizon: (n: number) => void;
  numericFactors: string[];
  setNumericFactors: (f: string[] | ((prev: string[]) => string[])) => void;
  overrides: Record<string, FactorOverride>;
  setOverrides: (o: Record<string, FactorOverride> | ((prev: Record<string, FactorOverride>) => Record<string, FactorOverride>)) => void;
  counterfactuals: string[];
  setCounterfactuals: (c: string[] | ((prev: string[]) => string[])) => void;
  label: string;
  setLabel: (l: string) => void;
  selectedForCompare: string[];
  toggleSelectedForCompare: (id: string) => void;
  listQuery: UseQueryResult<Scenario[]>;
  runMutation: UseMutationResult<ScenarioRunResult, Error, void, unknown>;
  saveMutation: UseMutationResult<unknown, Error, void, unknown>;
  compareMutation: UseMutationResult<ScenarioCompareResult, Error, void, unknown>;
  deleteScenario: (id: string) => Promise<void>;
}

export function useScenariosOrchestrator(activeId: string | undefined): ScenariosOrchestratorState {
  const queryClient = useQueryClient();
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [horizon, setHorizon] = useState(12);
  const [numericFactors, setNumericFactors] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, FactorOverride>>({});
  const [counterfactuals, setCounterfactuals] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const toggleSelectedForCompare = useCallback((id: string) => {
    setSelectedForCompare((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const listQuery = useQuery({
    queryKey: ["scenarios", activeId],
    queryFn: () => api.listScenarios(activeId!),
    enabled: !!activeId,
  }) as UseQueryResult<Scenario[]>;

  const runMutation = useMutation<ScenarioRunResult, Error, void, unknown>({
    mutationFn: () => {
      const future_numeric: Record<string, number[]> = {};
      for (const f of numericFactors) {
        const o = overrides[f];
        if (!o) continue;
        if (o.mode === "flat") {
          future_numeric[f] = new Array(horizon).fill(o.value);
        } else {
          const ramp = o.rampTo ?? o.value;
          future_numeric[f] = Array.from({ length: horizon }, (_, i) =>
            o.value + ((ramp - o.value) * i) / Math.max(horizon - 1, 1),
          );
        }
      }
      return api.runScenario({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        numeric_factors: numericFactors,
        categorical_factors: [],
        future_numeric,
        future_categorical: {},
        counterfactuals,
        xreg_mode: "additive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveScenario(label || "Unnamed scenario", {
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        numeric_factors: numericFactors,
        categorical_factors: [],
        future_numeric: Object.fromEntries(
          Object.entries(overrides).map(([k, o]) => {
            if (o.mode === "flat") return [k, new Array(horizon).fill(o.value)];
            const ramp = o.rampTo ?? o.value;
            return [
              k,
              Array.from({ length: horizon }, (_, i) =>
                o.value + ((ramp - o.value) * i) / Math.max(horizon - 1, 1),
              ),
            ];
          }),
        ),
        counterfactuals,
        xreg_mode: "additive",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scenarios", activeId] });
      setLabel("");
    },
  });

  const compareMutation = useMutation<ScenarioCompareResult, Error, void, unknown>({
    mutationFn: () => api.compareScenarios(selectedForCompare),
  });

  const deleteScenario = useCallback(
    async (id: string) => {
      await api.deleteScenario(id);
      queryClient.invalidateQueries({ queryKey: ["scenarios", activeId] });
    },
    [activeId, queryClient],
  );

  return {
    mapping,
    handleMappingChange,
    horizon,
    setHorizon,
    numericFactors,
    setNumericFactors,
    overrides,
    setOverrides,
    counterfactuals,
    setCounterfactuals,
    label,
    setLabel,
    selectedForCompare,
    toggleSelectedForCompare,
    listQuery,
    runMutation,
    saveMutation,
    compareMutation,
    deleteScenario,
  };
}
