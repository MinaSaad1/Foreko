import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { useBacktestStore } from "@/stores/backtestStore";
import { useJobsStore } from "@/stores/jobsStore";
import type { ColumnMapping } from "@/types/dataset";
import type { BacktestResult, CalibrationResult } from "@/types/phases";

export interface BacktestOrchestratorState {
  mapping: ColumnMapping | null;
  handleMappingChange: (m: ColumnMapping) => void;
  horizon: number;
  setHorizon: (n: number) => void;
  folds: number;
  setFolds: (n: number) => void;
  models: string[];
  toggleModel: (m: string) => void;
  jobId: string | null;
  jobError: string | null;
  result: BacktestResult | null;
  calibration: CalibrationResult | null;
  isStartPending: boolean;
  isStartError: boolean;
  startError: unknown;
  isCalibrationPending: boolean;
  startBacktest: () => void;
  runCalibration: () => void;
  handleJobDone: (r: unknown) => Promise<void>;
  handleJobError: (sseError: string | null) => Promise<void>;
  handleJobReset: () => void;
  reset: () => void;
}

export function useBacktestOrchestrator(activeId: string | undefined): BacktestOrchestratorState {
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);
  const setBacktestSummary = useBacktestStore((s) => s.setResult);
  const updateJob = useJobsStore((s) => s.updateJob);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [horizon, setHorizon] = useState(12);
  const [folds, setFolds] = useState(3);
  const [models, setModels] = useState<string[]>(["timesfm", "lightgbm", "seasonal_naive"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);

  const persistBacktestSummary = useCallback(
    (r: BacktestResult) => {
      if (!activeId || !r.winner) return;
      const mapeByModel: Record<string, number> = {};
      for (const [model, agg] of Object.entries(r.aggregate)) {
        mapeByModel[model] = agg.mape_mean;
      }
      setBacktestSummary({
        datasetId: activeId,
        winner: r.winner,
        mapeByModel,
        horizon: r.horizon,
        folds: r.folds,
        completedAt: Date.now(),
      });
    },
    [activeId, setBacktestSummary],
  );

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const toggleModel = useCallback((m: string) => {
    setModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }, []);

  const startMutation = useMutation({
    mutationFn: async () =>
      api.startBacktest({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        folds,
        models,
      }),
    onSuccess: (handle) => {
      if (handle.status === "done") {
        api.getBacktestJob(handle.job_id).then((j) => {
          setResult(j.result);
          if (j.result) persistBacktestSummary(j.result);
        });
      } else {
        setJobId(handle.job_id);
      }
    },
  });

  const calibrationMutation = useMutation({
    mutationFn: () =>
      api.runCalibration({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        folds,
      }),
    onSuccess: (c) => setCalibration(c),
  });

  const startBacktest = useCallback(() => {
    setJobError(null);
    startMutation.reset();
    startMutation.mutate();
  }, [startMutation]);

  const handleJobDone = useCallback(
    async (r: unknown) => {
      let br = r as BacktestResult | null;
      if (!br) {
        try {
          const j = await api.getBacktestJob(jobId!);
          br = j.result as BacktestResult | null;
        } catch { /* fall through */ }
      }
      if (br) {
        setResult(br);
        persistBacktestSummary(br);
      }
      setJobId(null);
    },
    [jobId, persistBacktestSummary],
  );

  const handleJobError = useCallback(
    async (sseError: string | null) => {
      try {
        const j = await api.getBacktestJob(jobId!);
        if (j.status === "done" && j.result) {
          const br = j.result as BacktestResult;
          setResult(br);
          persistBacktestSummary(br);
          setJobId(null);
          return;
        }
        if (j.error) {
          updateJob(jobId!, { status: "error", error: j.error });
        } else if (sseError) {
          updateJob(jobId!, { status: "error", error: sseError });
        }
      } catch {
        if (sseError) {
          updateJob(jobId!, { status: "error", error: sseError });
        }
      }
    },
    [jobId, persistBacktestSummary, updateJob],
  );

  const handleJobReset = useCallback(() => {
    setJobId(null);
    setJobError("Job failed. Adjust settings and try again.");
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setJobId(null);
    setCalibration(null);
    setJobError(null);
    startMutation.reset();
  }, [startMutation]);

  return {
    mapping,
    handleMappingChange,
    horizon,
    setHorizon,
    folds,
    setFolds,
    models,
    toggleModel,
    jobId,
    jobError,
    result,
    calibration,
    isStartPending: startMutation.isPending,
    isStartError: startMutation.isError,
    startError: startMutation.error,
    isCalibrationPending: calibrationMutation.isPending,
    startBacktest,
    runCalibration: calibrationMutation.mutate,
    handleJobDone,
    handleJobError,
    handleJobReset,
    reset,
  };
}
