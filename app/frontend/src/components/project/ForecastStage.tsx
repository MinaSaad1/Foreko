import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/client";
import {
 FutureFactorGrid,
 missingCells,
} from "@/components/project/FutureFactorGrid";
import { useProjectJob } from "@/hooks/useProjectJob";
import { useProjectRuns } from "@/hooks/useProject";
import type { ProjectDetail, ProjectRun, WorkflowState } from "@/types/project";
import { IssueForecast } from "@/components/project/IssueForecast";
import type {
 FactorPlanRequirements,
 FillPolicy,
 ForecastRunResult,
} from "@/types/factors-plan";

interface Props {
 project: ProjectDetail;
 workflow: WorkflowState;
}

export function ForecastStage({ project, workflow }: Props) {
 const job = useProjectJob(project.id);
 const { data: runs } = useProjectRuns(project.id);
 const [values, setValues] = useState<Record<string, Record<string, number | string>>>(
 {},
 );
 const [fillPolicies, setFillPolicies] = useState<Record<string, FillPolicy>>({});
 const [result, setResult] = useState<ForecastRunResult | null>(null);
 const [blocked, setBlocked] = useState<string | null>(null);

 const { data: requirements } = useQuery({
 queryKey: ["projects", "factor-plan", project.id],
 queryFn: () =>
 apiGet<FactorPlanRequirements>(`/projects/${project.id}/factor-plan`),
 });

 const [seeded, setSeeded] = useState(false);

 useEffect(() => {
 if (job.result) {
 setResult(job.result as unknown as ForecastRunResult);
 return;
 }
 const done = runs?.find(
 (r) =>
 r.stage === "forecast" &&
 r.status === "done" &&
 r.revision_no === project.current_revision,
 );
 if (done?.summary && "series" in done.summary) {
 const previous = done.summary as unknown as ForecastRunResult;
 setResult(previous);
 // Reopening a project restores the assumptions it was run with (design
 // 14). Without this the grid reads as empty next to a completed run,
 // which implies the forecast was produced from nothing.
 if (!seeded && previous.assumptions) {
 setValues(previous.assumptions);
 setFillPolicies(
 Object.fromEntries(
 previous.applied_fills.map((f) => [f.covariate, f.policy]),
 ),
 );
 setSeeded(true);
 }
 }
 }, [job.result, runs, project.current_revision, seeded]);

 const stage = workflow.stages.forecast;
 const running = job.status === "running";
 const missing = requirements
 ? missingCells(requirements, values, fillPolicies)
 : [];
 const canRun = !running && missing.length === 0;

 async function run() {
 setBlocked(null);
 const response = await fetch(`/api/projects/${project.id}/forecast`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ values, fill_policies: fillPolicies }),
 });
 const body = await response.json();
 if (!response.ok) {
 const detail = body.detail;
 setBlocked(
 typeof detail === "string"
 ? detail
 : (detail?.message ?? "The forecast could not start."),
 );
 return;
 }
 job.track(body.job_id);
 }

 return (
 <div className="grid gap-6">
 <header className="grid gap-1">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 Forecast
 </h1>
 <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 Run the baseline. Each series uses the model its own validation selected,
 and values come back on the scale you started with.
 </p>
 <p className="text-[12px] text-text-muted">{stage?.reason}</p>
 </header>

 {requirements ? (
 <FutureFactorGrid
 requirements={requirements}
 values={values}
 fillPolicies={fillPolicies}
 onChange={setValues}
 onPolicyChange={setFillPolicies}
 disabled={running}
 />
 ) : null}

 <div className="flex flex-wrap items-center gap-3 border-t border-border-strong/70 pt-4">
 <button
 type="button"
 onClick={run}
 disabled={!canRun}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
 >
 Run baseline forecast
 </button>
 {running ? (
 <button
 type="button"
 onClick={job.cancel}
 className="border border-border-strong/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
 >
 Cancel
 </button>
 ) : null}
 </div>

 {running && job.progress ? (
 <p aria-live="polite" className="font-mono text-[11px] text-text-secondary">
 {job.progress.stage} ({job.progress.current}/{job.progress.total})
 </p>
 ) : null}

 {blocked ? (
 <p role="alert" className="text-[13px] text-warn">
 {blocked}
 </p>
 ) : null}

 {job.status === "error" ? (
 <p role="alert" className="text-[13px] text-danger">
 {job.error}
 </p>
 ) : null}

 {result ? (
 <ForecastResult result={result} projectId={project.id} runs={runs} />
 ) : null}
 </div>
 );
}

function ForecastResult({
 result,
 projectId,
 runs,
}: {
 result: ForecastRunResult;
 projectId: string;
 runs: ProjectRun[] | undefined;
}) {
 const runId = runs?.find((r) => r.stage === "forecast" && r.status === "done")?.id;
 return (
 <div className="grid gap-4" aria-live="polite">
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
 Baseline complete
 </p>
 <p className="text-[12px] text-text-secondary">
 {result.series_count} series forecast
 {result.exception_count ? `, ${result.exception_count} could not be` : ""}.
 </p>

 {result.applied_fills.length ? (
 <div role="note" className="border border-border-strong/70 bg-bg-surface/40 p-3">
 <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Assumptions filled for you
 </p>
 <ul className="mt-1 grid gap-1">
 {result.applied_fills.map((fill) => (
 <li key={fill.covariate} className="text-[12px] text-text-secondary">
 {fill.covariate}: {fill.policy.replace(/_/g, " ")} for{" "}
 {fill.periods.join(", ")}
 </li>
 ))}
 </ul>
 </div>
 ) : null}

 <div className="overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">Baseline forecast by series</caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <Th>Series</Th>
 <Th>Model</Th>
 <Th>First period</Th>
 <Th>Point</Th>
 <Th>P10 to P90</Th>
 </tr>
 </thead>
 <tbody>
 {result.series.map((series) => (
 <tr key={series.series_id} className="border-b border-border/30">
 <Td>{series.series_id}</Td>
 <Td>{series.model}</Td>
 <Td>{series.dates[0]}</Td>
 <Td>{series.point[0]?.toFixed(2)}</Td>
 <Td>
 {series.p10[0]?.toFixed(2)} to {series.p90[0]?.toFixed(2)}
 </Td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {runId ? <IssueForecast projectId={projectId} runId={runId} /> : null}

 {result.exceptions.length ? (
 <div role="alert" className="border border-warn/50 bg-bg-surface/40 p-3">
 <p className="text-[12px] text-warn">
 {result.exceptions.length} series could not be forecast. They are listed
 rather than filled in with another model.
 </p>
 <ul className="mt-1 grid gap-1">
 {result.exceptions.map((e) => (
 <li key={e.series_id} className="text-[12px] text-text-secondary">
 {e.series_id}: {e.reason}
 </li>
 ))}
 </ul>
 </div>
 ) : null}
 </div>
 );
}

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
