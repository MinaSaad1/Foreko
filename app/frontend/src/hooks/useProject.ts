import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectApi, projectKeys } from "@/api/projects";
import type {
 ProjectCreate,
 ProjectPatch,
 ProjectRevisionCreate,
} from "@/types/project";

export function useProjects(includeArchived: boolean) {
 return useQuery({
 queryKey: projectKeys.list(includeArchived),
 queryFn: () => projectApi.list(includeArchived),
 });
}

export function useProject(projectId: string | undefined) {
 return useQuery({
 queryKey: projectKeys.detail(projectId ?? ""),
 queryFn: () => projectApi.get(projectId as string),
 enabled: Boolean(projectId),
 });
}

export function useProjectWorkflow(projectId: string | undefined) {
 return useQuery({
 queryKey: projectKeys.workflow(projectId ?? ""),
 queryFn: () => projectApi.workflow(projectId as string),
 enabled: Boolean(projectId),
 });
}

export function useProjectRuns(projectId: string | undefined) {
 return useQuery({
 queryKey: projectKeys.runs(projectId ?? ""),
 queryFn: () => projectApi.listRuns(projectId as string),
 enabled: Boolean(projectId),
 });
}

export function useCreateProject() {
 const queryClient = useQueryClient();
 return useMutation({
 mutationFn: (body: ProjectCreate) => projectApi.create(body),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: projectKeys.all });
 },
 });
}

export function usePatchProject() {
 const queryClient = useQueryClient();
 return useMutation({
 mutationFn: ({ id, body }: { id: string; body: ProjectPatch }) =>
 projectApi.patch(id, body),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: projectKeys.all });
 },
 });
}

export function useDeleteProject() {
 const queryClient = useQueryClient();
 return useMutation({
 mutationFn: (id: string) => projectApi.remove(id),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: projectKeys.all });
 },
 });
}

export function useCreateRevision(projectId: string) {
 const queryClient = useQueryClient();
 return useMutation({
 mutationFn: (body: ProjectRevisionCreate) =>
 projectApi.createRevision(projectId, body),
 onSuccess: () => {
 // A new revision changes stage readiness, so the workflow must refetch
 // alongside the project itself.
 queryClient.invalidateQueries({ queryKey: projectKeys.all });
 },
 });
}
