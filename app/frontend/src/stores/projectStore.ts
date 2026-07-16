import { create } from "zustand";
import type { StudioStage } from "@/types/project";

// Local interface state only. Projects, revisions, and runs are server state and
// belong to TanStack Query; duplicating them here would create a second source
// of truth that goes stale.
interface ProjectUiState {
 activeProjectId: string | null;
 activeStage: StudioStage;
 showArchived: boolean;
 setActiveProjectId: (id: string | null) => void;
 setActiveStage: (stage: StudioStage) => void;
 setShowArchived: (show: boolean) => void;
}

export const useProjectStore = create<ProjectUiState>((set) => ({
 activeProjectId: null,
 activeStage: "prepare",
 showArchived: false,
 setActiveProjectId: (id) => set({ activeProjectId: id }),
 setActiveStage: (stage) => set({ activeStage: stage }),
 setShowArchived: (show) => set({ showArchived: show }),
}));
