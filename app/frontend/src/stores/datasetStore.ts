import { create } from "zustand";
import type { DatasetPreview, ColumnMapping } from "@/types/dataset";

interface DatasetState {
  preview: DatasetPreview | null;
  mapping: ColumnMapping | null;
  setPreview: (preview: DatasetPreview | null) => void;
  setMapping: (mapping: ColumnMapping | null) => void;
  reset: () => void;
}

export const useDatasetStore = create<DatasetState>((set) => ({
  preview: null,
  mapping: null,
  setPreview: (preview) => set({ preview, mapping: null }),
  setMapping: (mapping) => set({ mapping }),
  reset: () => set({ preview: null, mapping: null }),
}));
