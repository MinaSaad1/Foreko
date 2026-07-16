import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/api/client";
import { FutureFactorGrid } from "@/components/project/FutureFactorGrid";
import { useProjectJob } from "@/hooks/useProjectJob";
import type { ProjectDetail, WorkflowState } from "@/types/project";
import type {
 FactorPlanRequirements,
 FillPolicy,
 ScenarioSummary,
} from "@/types/factors-plan";

interface Props {
 project: ProjectDetail;
 workflow: WorkflowState;
}

export function PlanStage({ project, workflow }: Props) {
 const job = useProjectJob(project.id);
 const queryClient = useQueryClient();
 const [name, setName] = useState("");
 const [values, setValues] = useState<Record<string, Record<string, number | string>>>(
 {},
 );
 const [fillPolicies, setFillPolicies] = useState<Record<string, FillPolicy>>({});
 const [error, setError] = useState<string | null>(null);

 const { data: requirements } = useQuery({
 queryKey: ["projects", "factor-plan", project.id],
 queryFn: () =>
 apiGet<FactorPlanRequirements>(`/projects/${project.id}/factor-plan`),
 });
 const { data: scenarios } = useQuery({
 queryKey: ["projects", "scenarios", project.id],
 queryFn: () => apiGet<ScenarioSummary[]>(`/projects/${project.id}/scenarios`),
 });

 const running = job.status === "running";
 const stage = workflow.stages.plan;

 async function run() {
 setError(null);
 const response = await fetch(`/api/projects/${project.id}/scenarios/run`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name, values, fill_policies: fillPolicies }),
 });
 const body = await response.json();
 if (!response.ok) {
 const detail = body.detail;
 setError(
 typeof detail === "string"
 ? detail
 : (detail?.message ?? "The scenario could not start."),
 );
 return;
 }
 job.track(body.job_id);
 setName("");
 setValues({});
 queryClient.invalidateQueries({ queryKey: ["projects", "scenarios", project.id] });
 }

 return (
 <div className="grid gap-6">
 <header className="grid gap-1">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 Plan
 </h1>
 <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 Change the assumptions and see what moves. A scenario copies the baseline
 plan, so comparing one never changes the baseline it is measured against.
 </p>
 <p className="text-[12px] text-text-muted">{stage?.reason}</p>
 </header>

 <section className="grid gap-3 border border-border-strong/70 bg-bg-surface/40 p-4">
 <label className="grid gap-1">
 <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Scenario name
 </span>
 <input
 value={name}
 onChange={(e) => setName(e.target.value)}
 className="max-w-sm border border-border-strong/70 bg-transparent px-3 py-2 text-[13px] text-text-primary"
 />
 </label>

 {requirements ? (
 <FutureFactorGrid
 requirements={requirements}
 values={values}
 fillPolicies={fillPolicies}
 onChange={setValues}
 onPolicyChange={setFillPolicies}
 disabled={running}
 emptyMeans="inherit"
 />
 ) : null}

 <div className="flex gap-2">
 <button
 type="button"
 onClick={run}
 disabled={running || !name.trim()}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
 >
 Run scenario
 </button>
 </div>

 {error ? (
 <p role="alert" className="text-[12px] text-warn">
 {error}
 </p>
 ) : null}
 {job.status === "error" ? (
 <p role="alert" className="text-[12px] text-danger">
 {job.error}
 </p>
 ) : null}
 {running && job.progress ? (
 <p aria-live="polite" className="font-mono text-[11px] text-text-secondary">
 {job.progress.stage} ({job.progress.current}/{job.progress.total})
 </p>
 ) : null}
 </section>

 {scenarios && scenarios.length ? (
 <ScenarioComparison scenarios={scenarios} />
 ) : (
 <p className="text-[12px] text-text-muted">
 No scenarios yet. Create one to compare against the baseline.
 </p>
 )}
 </div>
 );
}

function ScenarioComparison({ scenarios }: { scenarios: ScenarioSummary[] }) {
 return (
 <section className="grid gap-3">
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Scenarios versus baseline
 </h2>
 <div className="overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">Scenario deltas against the baseline</caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <Th>Scenario</Th>
 <Th>Baseline total</Th>
 <Th>Scenario total</Th>
 <Th>Change</Th>
 <Th>Change %</Th>
 </tr>
 </thead>
 <tbody>
 {scenarios.map((scenario) => {
 const p = scenario.deltas?.portfolio;
 return (
 <tr key={scenario.run_id} className="border-b border-border/30">
 <Td>{scenario.name}</Td>
 <Td>{p ? p.baseline_total.toFixed(1) : "not available"}</Td>
 <Td>{p ? p.scenario_total.toFixed(1) : "not available"}</Td>
 <Td>
 {p ? (
 <span className={p.absolute >= 0 ? "text-accent" : "text-warn"}>
 {p.absolute >= 0 ? "+" : ""}
 {p.absolute.toFixed(1)}
 </span>
 ) : (
 "not available"
 )}
 </Td>
 <Td>
 {p?.percent === null || p?.percent === undefined
 ? "not available"
 : `${p.percent >= 0 ? "+" : ""}${p.percent.toFixed(2)}%`}
 </Td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </section>
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
