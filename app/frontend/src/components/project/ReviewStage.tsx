import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/api/client";
import { AccuracySummary } from "@/components/project/AccuracySummary";
import { IssuedForecastBanner } from "@/components/project/IssuedForecastBanner";
import { useProjectRuns } from "@/hooks/useProject";
import type { ProjectDetail, WorkflowState } from "@/types/project";
import type { AccuracyResult, IssuedForecast } from "@/types/accuracy";
import type { ValidationResult } from "@/types/validation";

interface Props {
 project: ProjectDetail;
 workflow: WorkflowState;
}

export function ReviewStage({ project, workflow }: Props) {
 const queryClient = useQueryClient();
 const fileRef = useRef<HTMLInputElement>(null);
 const [error, setError] = useState<string | null>(null);
 const [importing, setImporting] = useState(false);

 const { data: issued } = useQuery({
 queryKey: ["projects", "issued", project.id],
 queryFn: () => apiGet<IssuedForecast[]>(`/projects/${project.id}/issued`),
 });
 const { data: accuracy } = useQuery({
 queryKey: ["projects", "accuracy", project.id],
 queryFn: () => apiGet<AccuracyResult>(`/projects/${project.id}/accuracy`),
 });
 const { data: runs } = useProjectRuns(project.id);

 const latestIssued = issued?.[0] ?? null;
 const validation = runs?.find(
 (r) =>
 r.stage === "validate" &&
 r.status === "done" &&
 r.revision_no === project.current_revision,
 )?.summary as unknown as ValidationResult | undefined;

 async function importActuals(file: File) {
 setError(null);
 setImporting(true);
 try {
 const form = new FormData();
 form.append("file", file);
 const response = await fetch(`/api/projects/${project.id}/actuals`, {
 method: "POST",
 body: form,
 });
 const body = await response.json();
 if (!response.ok) {
 setError(typeof body.detail === "string" ? body.detail : "Import failed.");
 return;
 }
 // Only the accuracy and workflow change. The issued forecast does not.
 queryClient.invalidateQueries({ queryKey: ["projects", "accuracy", project.id] });
 queryClient.invalidateQueries({ queryKey: ["projects", "workflow", project.id] });
 } finally {
 setImporting(false);
 if (fileRef.current) fileRef.current.value = "";
 }
 }

 return (
 <div className="grid gap-6">
 <header className="grid gap-1">
 <h1 className="font-display text-[1.5rem] font-medium text-text-primary">
 Review
 </h1>
 <p className="max-w-2xl text-[13px] leading-relaxed text-text-secondary">
 How the forecast you issued actually turned out. This is not the backtest:
 a backtest asks how a model would have done on history it never saw, and
 this asks how your committed forecast performed.
 </p>
 <p className="text-[12px] text-text-muted">{workflow.stages.review?.reason}</p>
 </header>

 <IssuedForecastBanner issued={latestIssued} />

 <section className="grid gap-3 border-t border-border-strong/70 pt-4">
 <h2 className="font-display text-[1.1rem] font-medium text-text-primary">
 Post-issue accuracy
 </h2>
 <p className="text-[12px] text-text-muted">
 Actuals are matched to the issued values by series and period. Importing
 them never changes what was issued.
 </p>

 <label className="grid max-w-md gap-1">
 <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 Import actuals
 </span>
 <input
 ref={fileRef}
 type="file"
 accept=".csv"
 disabled={!latestIssued || importing}
 onChange={(e) => {
 const file = e.target.files?.[0];
 if (file) void importActuals(file);
 }}
 className="border border-border-strong/70 bg-transparent px-3 py-2 text-[12px] text-text-secondary"
 />
 </label>

 {error ? (
 <p role="alert" className="text-[12px] text-danger">
 {error}
 </p>
 ) : null}

 {accuracy ? <AccuracySummary accuracy={accuracy} /> : null}
 </section>

 {validation ? (
 <section className="grid gap-2 border-t border-border-strong/70 pt-4">
 <h2 className="font-display text-[1.1rem] font-medium text-text-primary">
 Backtest evidence
 </h2>
 <p className="max-w-2xl text-[12px] text-text-muted">
 What the rolling validation predicted before this forecast was issued.
 Shown for comparison only. It is not a measure of the issued forecast.
 </p>
 <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border border-border/40 bg-bg-surface/20 p-4 md:grid-cols-3">
 <Fact
 label={`Backtest ${validation.primary_metric}`}
 value={
 validation.portfolio_metrics.mase === null
 ? "not available"
 : validation.portfolio_metrics.mase.toFixed(3)
 }
 />
 <Fact
 label="Backtest WAPE"
 value={
 validation.portfolio_metrics.wape === null
 ? "not available"
 : `${(validation.portfolio_metrics.wape * 100).toFixed(1)}%`
 }
 />
 <Fact
 label="Backtest bias"
 value={
 validation.portfolio_metrics.bias_pct === null
 ? "not available"
 : `${validation.portfolio_metrics.bias_pct.toFixed(2)}%`
 }
 />
 </dl>
 </section>
 ) : null}
 </div>
 );
}

function Fact({ label, value }: { label: string; value: string }) {
 return (
 <div className="min-w-0">
 <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 {label}
 </dt>
 <dd className="mt-1 truncate font-mono text-[12px] text-text-primary">{value}</dd>
 </div>
 );
}
