import { useMemo, useState } from"react";
import { useParams } from"react-router-dom";
import { ColumnMapper } from"@/components/ColumnMapper";
import ReactECharts from"echarts-for-react";
import { useChartTheme } from"@/charts/theme";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import { RunError } from"@/components/common/RunError";
import {
  ChoiceGrid,
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  Section,
} from "@/components/common/Page";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import { useHealth } from"@/hooks/useHealth";
import { useScenariosOrchestrator } from"@/hooks/useScenariosOrchestrator";
import type { ColumnInfo } from"@/types/dataset";
import type { ScenarioRunResult, ScenarioCompareResult } from"@/types/phases";

export function ScenariosPage() {
 const { datasetId } = useParams<{ datasetId?: string }>();
 const { activeId, preview } = useSyncedDataset(datasetId);
 const { data: health } = useHealth();
 const modelReady = health?.model_status === "ready";

 const {
 mapping,
 handleMappingChange,
 horizon,
 setHorizon,
 numericFactors,
 setNumericFactors,
 overrides,
 setOverrides,
 counterfactuals,
 setCounterfactuals,
 label,
 setLabel,
 selectedForCompare,
 toggleSelectedForCompare,
 listQuery,
 runMutation,
 saveMutation,
 compareMutation,
 deleteScenario,
 } = useScenariosOrchestrator(activeId);
 const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

 if (!activeId) {
 return (
 <EmptyDatasetState
 title="What-If Scenarios"pageKey="scenarios"basePath="/scenarios"
 />
 );
 }

 const numericCols: ColumnInfo[] =
 preview?.columns.filter((c) => c.dtype === "numeric" && c.name !== mapping?.value_col) ?? [];

 const scenarios = listQuery.data;
 const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Scenarios";

 return (
 <div className="flex flex-col gap-6">
 <PageHeading
   kicker="Plan"
   title={displayName}
   intro="Set future factor values, flat or ramping, then run the forecast to see how your metric responds. Save a scenario under a name and compare two or more side by side."
 />

 <FactGrid>
   <Fact label="File" value={preview ? preview.filename : "Loading..."} />
   <Fact label="Rows" value={preview ? preview.row_count.toLocaleString() : "..."} />
   <Fact label="Horizon" value={`${horizon} periods`} />
   <Fact label="Saved scenarios" value={String(scenarios?.length ?? 0)} />
 </FactGrid>

 <Section
   title="Set up"
   controls={
     <div className="flex items-center gap-2">
       {/* Horizon was LeftRail-only, so below lg it did not exist and could
           not be changed, while the header reported it back to the user. */}
       <span id="scenario-horizon-label" className="text-[13px] text-text-secondary">
         Horizon
       </span>
       <div role="group" aria-labelledby="scenario-horizon-label" className="w-40">
         <ChoiceGrid
           options={[
             { value: 4, label: "4" },
             { value: 8, label: "8" },
             { value: 12, label: "12" },
             { value: 24, label: "24" },
           ]}
           value={horizon}
           onChange={setHorizon}
           columns={2}
         />
       </div>
     </div>
   }
 >
 <div className="space-y-5">
 {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

 {numericCols.length > 0 && (
 <div>
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
 Factors to change
 </p>
 <p className="mb-2 mt-1 text-[13px] text-text-secondary">
 Tick a factor to set its future value. Untouched factors keep their own
 projected path.
 </p>
 <div className="divide-y divide-border/60 border-y border-border/60">
 {numericCols.map((c) => {
 const active = numericFactors.includes(c.name);
 const cfActive = counterfactuals.includes(c.name);
 const override = overrides[c.name] ?? { value: 0, mode: "flat"as const };
 return (
 // Was a bordered card inside a bordered card, N times over, with every
 // factor showing five controls whether or not it was in play. Rows now,
 // and an untouched factor costs exactly one checkbox.
 <div key={c.name} className={`px-3 py-2 ${active ? "bg-accent/5" : ""}`}>
 <div className="flex flex-wrap items-center justify-between gap-3">
 <label className="flex items-center gap-2 font-mono text-sm text-text-primary">
 <input
 type="checkbox"checked={active}
 onChange={() =>
 setNumericFactors((prev) =>
 prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name],
 )
 }
 />
 {c.name}
 </label>
 {active && (
 <label className="flex items-center gap-2 text-[13px] text-text-secondary">
 <input
 type="checkbox"checked={cfActive}
 onChange={() =>
 setCounterfactuals((prev) =>
 prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name],
 )
 }
 />
 Zero it out, to see its own contribution
 </label>
 )}
 </div>
 {active && !cfActive && (
 <div className="mt-3 flex flex-wrap items-center gap-3">
 <select
 value={override.mode}
 onChange={(e) =>
 setOverrides((prev) => ({
 ...prev,
 [c.name]: { ...(prev[c.name] ?? { value: 0, mode: "flat" }), mode: e.target.value as"flat" | "ramp" },
 }))
 }
 className="border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
 >
 <option value="flat">Flat value</option>
 <option value="ramp">Ramp to value</option>
 </select>
 <input
 type="number"value={override.value}
 onChange={(e) =>
 setOverrides((prev) => ({
 ...prev,
 [c.name]: { ...(prev[c.name] ?? { value: 0, mode: "flat" }), value: Number(e.target.value) },
 }))
 }
 className="w-28 border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"placeholder="start"
 />
 {override.mode === "ramp" && (
 <input
 type="number"value={override.rampTo ?? override.value}
 onChange={(e) =>
 setOverrides((prev) => ({
 ...prev,
 [c.name]: { ...(prev[c.name] ?? { value: 0, mode: "flat" }), rampTo: Number(e.target.value) },
 }))
 }
 className="w-28 border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"placeholder="end"
 />
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Run used to share a row with a flex-1 label input, which made an
     optional text field the widest thing on the page and left the eye
     landing on it instead of on the primary action. */}
 <button
 onClick={() => runMutation.mutate()}
 disabled={!mapping || runMutation.isPending || !modelReady}
 className="w-full btn-terminal-primary"
 >
 {runMutation.isPending ? "Running..." : "Run scenario"}
 </button>
 {!modelReady && (
 <p className="text-[13px] text-text-secondary">
 Model still loading, the Run button will enable when it's ready.
 </p>
 )}

 <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
 <label htmlFor="scenario-label" className="text-[13px] text-text-secondary">
 Keep this scenario as
 </label>
 <input
 id="scenario-label"
 type="text"value={label}
 onChange={(e) => setLabel(e.target.value)}
 placeholder="e.g. Q3 price rise"className="min-w-[200px] flex-1 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
 />
 <button
 onClick={() => saveMutation.mutate()}
 disabled={!label || !mapping || saveMutation.isPending}
 className="btn-terminal"
 >
 {saveMutation.isPending ? "Saving..." : "Save"}
 </button>
 </div>

 <RunError error={runMutation.error} label="Scenario run" />
 <RunError error={saveMutation.error} label="Save" />
 <RunError error={compareMutation.error} label="Compare" />
 </div>
 </Section>

 {runMutation.data && <ScenarioResultChart data={runMutation.data} />}

 {scenarios && scenarios.length > 0 && (
 <Section
 title={`Saved scenarios (${scenarios.length})`}
 controls={
 <button
 onClick={() => compareMutation.mutate()}
 disabled={selectedForCompare.length < 2 || compareMutation.isPending}
 className="btn-terminal py-1.5 px-3 text-[10px]"
 >
 Compare selected ({selectedForCompare.length})
 </button>
 }
 >
 {selectedForCompare.length < 2 && (
 <p className="mb-3 text-[13px] text-text-secondary">
 Tick two or more scenarios to compare them side by side.
 </p>
 )}
 <div className="space-y-1">
 {scenarios.map((s) => (
 <div
 key={s.id}
 className="flex items-center justify-between border border-border bg-bg-elevated px-3 py-2 hover:border-border-strong"
 >
 {/* Only the checkbox and the scenario name belong inside the label.
     Delete used to sit inside it too, so every delete click also
     bubbled up and toggled this scenario into the comparison. */}
 <label className="flex items-center gap-2">
 <input
 type="checkbox"checked={selectedForCompare.includes(s.id)}
 onChange={() => toggleSelectedForCompare(s.id)}
 />
 <span className="font-mono text-sm text-text-primary">{s.label}</span>
 </label>
 <div className="flex items-center gap-3">
 <span className="font-mono text-xs text-text-muted">
 {new Date(s.created_at).toLocaleString()}
 </span>
 {confirmingDelete === s.id ? (
 <>
 <span className="text-xs text-text-secondary">Delete permanently?</span>
 <button
 onClick={() => {
 deleteScenario(s.id);
 setConfirmingDelete(null);
 }}
 className="font-mono text-xs text-anomaly"
 >
 confirm
 </button>
 <button
 onClick={() => setConfirmingDelete(null)}
 className="font-mono text-xs text-text-muted hover:text-text-primary"
 >
 cancel
 </button>
 </>
 ) : (
 <button
 onClick={() => setConfirmingDelete(s.id)}
 className="font-mono text-xs text-text-muted hover:text-anomaly"
 >
 delete
 </button>
 )}
 </div>
 </div>
 ))}
 </div>
 </Section>
 )}

 {compareMutation.data && <ScenarioCompareChart data={compareMutation.data} />}

 <Depth label="Reading the result">
 <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
 <li className="flex gap-2">
 <span className="text-accent" aria-hidden>
 ▸
 </span>
 <span>Flat pins the factor at one value for the whole horizon.</span>
 </li>
 <li className="flex gap-2">
 <span className="text-accent" aria-hidden>
 ▸
 </span>
 <span>Ramp moves the factor from the start value to the end value in a straight line.</span>
 </li>
 <li className="flex gap-2">
 <span className="text-accent" aria-hidden>
 ▸
 </span>
 <span>
 Zeroing a factor out shows what the forecast looks like without its
 contribution. It is a comparison, not a prediction that the factor will
 be zero.
 </span>
 </li>
 </ul>
 </Depth>
 </div>
 );
}

function ScenarioResultChart({ data }: { data: ScenarioRunResult }) {
 const t = useChartTheme();
 const allDates = [...data.historical_dates, ...data.forecast_dates];
 const histSeries = data.historical_values.map((v, i) => [data.historical_dates[i], v]);
 const fcSeries = data.forecast.map((v, i) => [data.forecast_dates[i], v]);
 const option = useMemo(
 () => ({
 backgroundColor: "transparent",
 grid: { left: 56, right: 24, top: 24, bottom: 48, containLabel: false },
 xAxis: {
 type: "category",
 data: allDates,
 axisLine: { lineStyle: { color: t.grid } },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10, rotate: 30, formatter: (v: string) => v.slice(0, 7) },
 },
 yAxis: {
 type: "value",
 axisLine: { show: false },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
 splitLine: { lineStyle: { color: t.grid } },
 },
 tooltip: { trigger: "axis" },
 dataZoom: [
 { type: "inside", xAxisIndex: 0 },
 { type: "slider", xAxisIndex: 0, height: 16, bottom: 8, handleStyle: { color: t.accent } },
 ],
 series: [
 { name: "Historical", type: "line", data: histSeries, lineStyle: { color: t.historical, width: 2 }, symbol: "none" },
 { name: "Scenario", type: "line", data: fcSeries, lineStyle: { color: t.accent, width: 2 }, symbol: "none" },
 ],
 }),
 [allDates, histSeries, fcSeries, t],
 );
 return (
 <div className="rounded-panel border border-accent/30 bg-bg-surface p-5 space-y-3">
 <div className="flex items-center justify-between">
 <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Scenario forecast
 </h3>
 <p className="font-mono text-xs text-accent">Total: {data.total.toFixed(0)}</p>
 </div>
 <ReactECharts option={option} style={{ height: 300, width: "100%" }} notMerge />
 </div>
 );
}

function ScenarioCompareChart({ data }: { data: ScenarioCompareResult }) {
 const t = useChartTheme();
 const colors = [t.accent, t.neutral, t.positive, t.warning, t.anomaly];
 const histSeries = data.historical_values.map((v, i) => [data.historical_dates[i], v]);
 const allDates = [
 ...data.historical_dates,
 ...(data.scenarios[0]?.forecast_dates ?? []),
 ];
 const series = [
 {
 name: "Historical",
 type: "line",
 data: histSeries,
 lineStyle: { color: t.historical, width: 2 },
 symbol: "none",
 },
 ...data.scenarios.map((s, i) => ({
 name: s.label,
 type: "line",
 data: s.forecast.map((v, idx) => [s.forecast_dates[idx], v]),
 lineStyle: { color: colors[i % colors.length], width: 2 },
 itemStyle: { color: colors[i % colors.length] },
 symbol: "none",
 })),
 ];

 return (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
 <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Scenario comparison
 </h3>
 <div className="flex flex-wrap gap-3">
 {data.scenarios.map((s, i) => (
 <div
 key={s.id}
 className="border border-border bg-bg-elevated px-3 py-2"style={{ borderLeftColor: colors[i % colors.length], borderLeftWidth: 3 }}
 >
 <p className="font-mono text-xs text-text-primary">{s.label}</p>
 <p className="font-mono text-xs text-text-muted">
 total {s.total.toFixed(0)} · Δ {(s.delta_pct_vs_first * 100).toFixed(1)}%
 </p>
 </div>
 ))}
 </div>
 <ReactECharts
 option={{
 backgroundColor: "transparent",
 grid: { left: 56, right: 24, top: 24, bottom: 48, containLabel: false },
 xAxis: {
 type: "category",
 data: allDates,
 axisLine: { lineStyle: { color: t.grid } },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10, rotate: 30, formatter: (v: string) => v.slice(0, 7) },
 },
 yAxis: {
 type: "value",
 axisLine: { show: false },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
 splitLine: { lineStyle: { color: t.grid } },
 },
 tooltip: { trigger: "axis" },
 legend: {
 data: ["Historical", ...data.scenarios.map((s) => s.label)],
 textStyle: { color: t.textSecondary, fontFamily: "JetBrains Mono", fontSize: 10 },
 top: 0,
 right: 16,
 },
 dataZoom: [
 { type: "inside", xAxisIndex: 0 },
 { type: "slider", xAxisIndex: 0, height: 16, bottom: 8 },
 ],
 series,
 }}
 style={{ height: 360, width: "100%" }}
 notMerge
 />
 </div>
 );
}
