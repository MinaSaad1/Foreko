import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjects, useCreateProject } from "@/hooks/useProject";
import { useProjectStore } from "@/stores/projectStore";
import { useDatasetStore } from "@/stores/datasetStore";
import type { ProjectSummary } from "@/types/project";

export function ProjectsPage() {
 const showArchived = useProjectStore((s) => s.showArchived);
 const setShowArchived = useProjectStore((s) => s.setShowArchived);
 const { data: projects, isPending, isError, error } = useProjects(showArchived);
 const [creating, setCreating] = useState(false);

 return (
 <div className="flex flex-col gap-6">
 <header className="flex items-end justify-between gap-4 border-b border-border-strong/70 pb-4">
 <div className="min-w-0">
 <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
 Forecast Projects
 </p>
 <h1 className="mt-2 font-display text-[2rem] leading-[1.1] tracking-[-0.01em] font-medium text-text-primary">
 Projects
 </h1>
 <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 A project keeps a forecast together over time: the data recipe, the model
 evidence, the assumptions you entered, the forecast you issued, and how
 accurate it turned out. Everything stays on this machine.
 </p>
 </div>
 <button
 type="button"
 onClick={() => setCreating(true)}
 className="shrink-0 border border-accent/70 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10"
 >
 New project
 </button>
 </header>

 <label className="flex w-fit items-center gap-2 text-[12px] text-text-secondary">
 <input
 type="checkbox"
 checked={showArchived}
 onChange={(e) => setShowArchived(e.target.checked)}
 className="accent-accent"
 />
 Show archived
 </label>

 {creating ? <CreateProjectForm onDone={() => setCreating(false)} /> : null}

 {isPending ? (
 <p className="text-[13px] text-text-muted">Loading projects…</p>
 ) : isError ? (
 <p role="alert" className="text-[13px] text-danger">
 {(error as Error).message}
 </p>
 ) : projects && projects.length > 0 ? (
 <ul className="grid gap-2">
 {projects.map((project) => (
 <ProjectRow key={project.id} project={project} />
 ))}
 </ul>
 ) : (
 <EmptyState onCreate={() => setCreating(true)} />
 )}
 </div>
 );
}

function ProjectRow({ project }: { project: ProjectSummary }) {
 return (
 <li>
 <Link
 to={`/projects/${project.id}`}
 className="flex items-center justify-between gap-4 border border-border-strong/70 bg-bg-surface/40 px-4 py-3 transition-colors hover:border-accent"
 >
 <span className="min-w-0">
 <span className="block truncate text-[14px] text-text-primary">
 {project.name}
 </span>
 <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
 {project.dataset_id} · revision {project.current_revision} · updated{" "}
 {project.updated_at}
 </span>
 </span>
 <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
 {project.is_archived ? "Archived" : project.status}
 </span>
 </Link>
 </li>
 );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
 return (
 <div className="border border-border-strong/70 bg-bg-surface/40 px-6 py-10 text-center">
 <p className="text-[14px] text-text-primary">No projects yet</p>
 <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-secondary">
 Create a project to turn a one-off analysis into a forecast you can reissue,
 compare against actuals, and reproduce later.
 </p>
 <button
 type="button"
 onClick={onCreate}
 className="mt-4 border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10"
 >
 New project
 </button>
 </div>
 );
}

function CreateProjectForm({ onDone }: { onDone: () => void }) {
 const activeDatasetId = useDatasetStore((s) => s.activeDatasetId);
 const [name, setName] = useState("");
 const [datasetId, setDatasetId] = useState(activeDatasetId ?? "");
 const create = useCreateProject();

 const canSubmit = name.trim().length > 0 && datasetId.trim().length > 0;

 return (
 <form
 className="grid gap-3 border border-border-strong/70 bg-bg-surface/40 p-4"
 onSubmit={(e) => {
 e.preventDefault();
 if (!canSubmit) return;
 create.mutate(
 { name: name.trim(), dataset_id: datasetId.trim(), description: "" },
 { onSuccess: onDone },
 );
 }}
 >
 <label className="grid gap-1">
 <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Project name
 </span>
 <input
 value={name}
 onChange={(e) => setName(e.target.value)}
 className="border border-border-strong/70 bg-transparent px-3 py-2 text-[13px] text-text-primary"
 />
 </label>
 <label className="grid gap-1">
 <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Dataset id
 </span>
 <input
 value={datasetId}
 onChange={(e) => setDatasetId(e.target.value)}
 className="border border-border-strong/70 bg-transparent px-3 py-2 text-[13px] text-text-primary"
 />
 </label>
 {create.isError ? (
 <p role="alert" className="text-[12px] text-danger">
 {(create.error as Error).message}
 </p>
 ) : null}
 <div className="flex gap-2">
 <button
 type="submit"
 disabled={!canSubmit || create.isPending}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
 >
 Create project
 </button>
 <button
 type="button"
 onClick={onDone}
 className="border border-border-strong/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
 >
 Cancel
 </button>
 </div>
 </form>
 );
}
