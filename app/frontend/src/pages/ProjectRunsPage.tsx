import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RunManifestDrawer } from "@/components/project/RunManifestDrawer";
import { useProject, useProjectRuns } from "@/hooks/useProject";
import type { ProjectRun } from "@/types/project";

export function ProjectRunsPage() {
 const { projectId } = useParams<{ projectId: string }>();
 const { data: project } = useProject(projectId);
 const { data: runs, isPending, isError, error } = useProjectRuns(projectId);
 const [openRun, setOpenRun] = useState<string | null>(null);

 if (isPending) return <p className="text-[13px] text-text-muted">Loading runs…</p>;
 if (isError) {
 return (
 <p role="alert" className="text-[13px] text-danger">
 {(error as Error).message}
 </p>
 );
 }

 const current = project?.current_revision ?? 0;

 return (
 <div className="flex flex-col gap-6">
 <header className="grid gap-2 border-b border-border-strong/70 pb-4">
 <Link
 to={`/projects/${projectId}`}
 className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent"
 >
 {project?.name ?? "Project"}
 </Link>
 <h1 className="font-display text-[1.75rem] font-medium text-text-primary">
 Run history
 </h1>
 <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 Every run is kept, including the ones that failed or were superseded. A run
 from an older revision is marked stale rather than deleted, so you can
 still see what produced a past number.
 </p>
 <a
 href={`/api/projects/${projectId}/exports/package`}
 className="w-fit border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:bg-accent/10"
 >
 Download forecast package
 </a>
 </header>

 {runs && runs.length ? (
 <div className="overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">Every run this project has produced</caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <Th>Stage</Th>
 <Th>Status</Th>
 <Th>Revision</Th>
 <Th>Started</Th>
 <Th>Duration</Th>
 <Th>Manifest</Th>
 </tr>
 </thead>
 <tbody>
 {runs.map((run) => (
 <RunRow
 key={run.id}
 run={run}
 currentRevision={current}
 onOpen={() => setOpenRun(run.id)}
 />
 ))}
 </tbody>
 </table>
 </div>
 ) : (
 <p className="text-[13px] text-text-muted">
 No runs yet. Start with Prepare in the Studio.
 </p>
 )}

 {projectId ? (
 <RunManifestDrawer
 projectId={projectId}
 runId={openRun}
 onClose={() => setOpenRun(null)}
 />
 ) : null}
 </div>
 );
}

function RunRow({
 run,
 currentRevision,
 onOpen,
}: {
 run: ProjectRun;
 currentRevision: number;
 onOpen: () => void;
}) {
 const stale = run.status === "done" && run.revision_no !== currentRevision;
 const duration =
 run.completed_at && run.started_at
 ? `${Math.max(
 0,
 Math.round(
 (Date.parse(run.completed_at) - Date.parse(run.started_at)) / 1000,
 ),
 )}s`
 : "-";

 return (
 <tr className="border-b border-border/30 align-top">
 <Td>{run.stage}</Td>
 <Td>
 <span className={STATUS_CLASS[run.status] ?? "text-text-secondary"}>
 {run.status}
 </span>
 {run.error ? (
 <span className="mt-1 block text-[11px] text-danger">{run.error}</span>
 ) : null}
 </Td>
 <Td>
 {run.revision_no}
 {stale ? (
 <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
 stale
 </span>
 ) : null}
 </Td>
 <Td>{run.started_at}</Td>
 <Td>{duration}</Td>
 <Td>
 <button
 type="button"
 onClick={onOpen}
 className="border border-border-strong/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-text-secondary hover:border-accent hover:text-accent"
 >
 View
 </button>
 </Td>
 </tr>
 );
}

const STATUS_CLASS: Record<string, string> = {
 done: "text-accent",
 error: "text-danger",
 cancelled: "text-warn",
 running: "text-text-primary",
 queued: "text-text-muted",
};

function Th({ children }: { children: React.ReactNode }) {
 return (
 <th
 scope="col"
 className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted"
 >
 {children}
 </th>
 );
}

function Td({ children }: { children: React.ReactNode }) {
 return <td className="px-2 py-2 text-text-primary">{children}</td>;
}
