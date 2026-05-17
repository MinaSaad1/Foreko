import { create } from "zustand";

const STORAGE_KEY = "foreko.backtest.summaries";

export interface BacktestSummary {
  datasetId: string;
  winner: string;
  mapeByModel: Record<string, number>;
  horizon: number;
  folds: number;
  completedAt: number;
}

interface BacktestState {
  results: Record<string, BacktestSummary>;
  setResult: (summary: BacktestSummary) => void;
  getResult: (datasetId: string) => BacktestSummary | undefined;
  clearResult: (datasetId: string) => void;
}

function readInitial(): Record<string, BacktestSummary> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BacktestSummary>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore (private mode, malformed data, etc.)
  }
  return {};
}

function persist(results: Record<string, BacktestSummary>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch {
    // ignore
  }
}

export const useBacktestStore = create<BacktestState>((set, get) => ({
  results: readInitial(),
  setResult: (summary) => {
    const next = { ...get().results, [summary.datasetId]: summary };
    persist(next);
    set({ results: next });
  },
  getResult: (datasetId) => get().results[datasetId],
  clearResult: (datasetId) => {
    const { [datasetId]: _removed, ...rest } = get().results;
    persist(rest);
    set({ results: rest });
  },
}));
