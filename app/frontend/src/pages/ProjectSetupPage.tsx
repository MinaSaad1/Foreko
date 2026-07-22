import { Link, useNavigate, useParams } from "react-router-dom";
import { ProjectConfigForm } from "@/components/project/ProjectConfigForm";
import { useCreateRevision, useProject } from "@/hooks/useProject";

export function ProjectSetupPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isPending, isError, error } = useProject(projectId);
  const createRevision = useCreateRevision(projectId ?? "");

  if (isPending) return <p className="text-[13px] text-text-muted">Loading project…</p>;
  if (isError || !project) {
    return (
      <p role="alert" className="text-[13px] text-anomaly">
        {(error as Error)?.message ?? "Project not found."}
      </p>
    );
  }

  const first = project.config === null;

  return (
    <div className="flex flex-col gap-6">
      <header className="grid gap-2 border-b border-border-strong/70 pb-4">
        <Link
          to={`/projects/${project.id}`}
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent"
        >
          {project.name}
        </Link>
        <h1 className="font-display text-[1.75rem] font-medium text-text-primary">
          {first ? "Set up the project" : "Change the setup"}
        </h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
          {first
            ? "Tell Foreko which columns hold the dates and the numbers, how far ahead to forecast, and which models to put against each other. Nothing can run until this is set."
            : "Changing any of this creates a new revision. Runs from the old revision are kept, but they stop counting as current until you run them again."}
        </p>
      </header>

      <ProjectConfigForm
        datasetId={project.dataset_id}
        initial={project.config}
        submitLabel={first ? "Save and continue" : "Save new revision"}
        pending={createRevision.isPending}
        error={createRevision.isError ? (createRevision.error as Error).message : null}
        onSubmit={(config) =>
          createRevision.mutate(config, {
            onSuccess: () => navigate(`/projects/${project.id}/studio/prepare`),
          })
        }
      />
    </div>
  );
}
