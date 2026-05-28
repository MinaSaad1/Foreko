import { create } from"zustand";
import type { JobStatus } from"@/types/phases";

interface JobsState {
 jobs: Record<string, JobStatus>;
 updateJob: (jobId: string, patch: Partial<JobStatus>) => void;
 removeJob: (jobId: string) => void;
 getJob: (jobId: string) => JobStatus | undefined;
}

export const useJobsStore = create<JobsState>((set, get) => ({
 jobs: {},
 updateJob: (jobId, patch) =>
 set((state) => ({
 jobs: {
 ...state.jobs,
 [jobId]: { ...(state.jobs[jobId] ?? ({} as JobStatus)), ...patch } as JobStatus,
 },
 })),
 removeJob: (jobId) =>
 set((state) => {
 const { [jobId]: _removed, ...rest } = state.jobs;
 return { jobs: rest };
 }),
 getJob: (jobId) => get().jobs[jobId],
}));
