import { create } from"zustand";
import type { ColumnMapping } from"@/types/dataset";

interface DatasetState {
 activeDatasetId: string | null;
 mapping: ColumnMapping | null;
 setActiveDatasetId: (id: string | null) => void;
 setMapping: (mapping: ColumnMapping | null) => void;
 reset: () => void;
}

export const useDatasetStore = create<DatasetState>((set) => ({
 activeDatasetId: null,
 mapping: null,
 setActiveDatasetId: (id) => set({ activeDatasetId: id, mapping: null }),
 setMapping: (mapping) => set({ mapping }),
 reset: () => set({ activeDatasetId: null, mapping: null }),
}));
