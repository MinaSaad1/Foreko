import { useParams } from"react-router-dom";
import { ColumnMapper } from"@/components/ColumnMapper";
import { MethodAgreementMatrix } from"@/components/anomaly/MethodAgreementMatrix";
import { RootCauseHints } from"@/components/anomaly/RootCauseHints";
import { PageIntro } from"@/components/common/PageIntro";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import {
  LeftRail,
  PageHeader,
  RailResetButton,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import { useExplainOrchestrator } from"@/hooks/useExplainOrchestrator";
import type { ColumnInfo } from"@/types/dataset";
import type { LagResult } from"@/types/phases";
import ReactECharts from"echarts-for-react";
import { useChartTheme } from"@/charts/theme";

export function ExplainPage() {
 const { datasetId } = useParams<{ datasetId?: string }>();
 const { activeId, preview } = useSyncedDataset(datasetId);

 const {
 mapping,
 handleMappingChange,
 numericFactors,
 setNumericFactors,
 categoricalFactors,
 setCategoricalFactors,
 anomalyMethodsMutation,
 rootCauseMutation,
 changepointsMutation,
 lagMutation,
 grangerMutation,
 } = useExplainOrchestrator(activeId);

 if (!activeId) {
 return (
 <EmptyDatasetState
 title="Explain Your Data"pageKey="explain"basePath="/explain"
 />
 );
 }

 const numericCols: ColumnInfo[] =
 preview?.columns.filter((c) => c.dtype === "numeric" && c.name !== mapping?.value_col) ?? [];
 const categoricalCols: ColumnInfo[] =
 preview?.columns.filter((c) => c.dtype === "categorical" || c.dtype === "string") ?? [];

 const toggle = (col: string, kind: "num" | "cat") => {
 if (kind === "num") {
 setNumericFactors((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
 } else {
 setCategoricalFactors((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
 }
 };

 const hasResult = !!(
   anomalyMethodsMutation.data ||
   rootCauseMutation.data ||
   changepointsMutation.data ||
   lagMutation.data ||
   grangerMutation.data
 );
 const resetAll = () => {
   anomalyMethodsMutation.reset();
   rootCauseMutation.reset();
   changepointsMutation.reset();
   lagMutation.reset();
   grangerMutation.reset();
 };
 const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Explain";

 return (
 <ThreeRailLayout
   left={
     <LeftRail ariaLabel="Explain configuration">
       <RailSection label="Dataset">
         {preview ? (
           <>
             <RailRow k="File" v={preview.filename} />
             <RailRow k="Rows" v={preview.row_count.toLocaleString()} />
           </>
         ) : (
           <p className="font-mono text-[10px] text-text-faint">Loading…</p>
         )}
       </RailSection>

       <RailSection label="Factors">
         <RailRow k="Numeric" v={String(numericFactors.length)} />
         <RailRow k="Categorical" v={String(categoricalFactors.length)} />
         <RailRow k="Available" v={String(numericCols.length + categoricalCols.length)} tone="muted" />
       </RailSection>

       <RailSection label="Tools">
         <RailRow k="Anomalies" v="5 methods" />
         <RailRow k="Changepoints" v="rupture" />
         <RailRow k="Lag" v="cross-corr" />
         <RailRow k="Causality" v="Granger" />
       </RailSection>

       {hasResult && <RailResetButton onClick={resetAll} />}
     </LeftRail>
   }
   right={
     <RightRail ariaLabel="Explain insights">
       <WhatYoullGet
         summary="Five-method anomaly vote, changepoint detection, lag analysis, and Granger causality between selected factors and the target. Each tool runs independently."
         reading={[
           "Anomalies + root-cause: pick factors first, then run methods, then 'Find root cause'.",
           "Lag: positive lag means the factor leads the target.",
           "Granger p < 0.05 = factor predicts the target beyond its own history.",
         ]}
       />
     </RightRail>
   }
 >
 <PageHeader
   kicker="Understand"
   title={displayName}
   subtitle={preview ? `${preview.row_count.toLocaleString()} rows` : undefined}
 />

 <div className="lg:hidden">
   <PageIntro pageKey="explain" />
 </div>

 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-4">
 {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

 {numericCols.length > 0 && (
 <div>
 <p className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
 Numeric factors (for root-cause, lag, Granger)
 </p>
 <div className="flex flex-wrap gap-2">
 {numericCols.map((c) => (
 <button
 key={c.name}
 onClick={() => toggle(c.name, "num")}
 className={`border px-3 py-1 font-mono text-xs transition-colors ${
 numericFactors.includes(c.name)
 ? "border-accent bg-accent-dim text-accent"
 : "border-border text-text-secondary hover:border-border-strong"
 }`}
 >
 {c.name}
 </button>
 ))}
 </div>
 </div>
 )}
 {categoricalCols.length > 0 && (
 <div>
 <p className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
 Category factors
 </p>
 <div className="flex flex-wrap gap-2">
 {categoricalCols.map((c) => (
 <button
 key={c.name}
 onClick={() => toggle(c.name, "cat")}
 className={`border px-3 py-1 font-mono text-xs transition-colors ${
 categoricalFactors.includes(c.name)
 ? "border-accent bg-accent-dim text-accent"
 : "border-border text-text-secondary hover:border-border-strong"
 }`}
 >
 {c.name}
 </button>
 ))}
 </div>
 </div>
 )}

 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => anomalyMethodsMutation.mutate()}
 disabled={!mapping || anomalyMethodsMutation.isPending}
 className="btn-terminal-primary"
 >
 {anomalyMethodsMutation.isPending ? "Running…" : "Detect anomalies (5 methods)"}
 </button>
 <button
 onClick={() => changepointsMutation.mutate()}
 disabled={!mapping || changepointsMutation.isPending}
 className="btn-terminal"
 >
 {changepointsMutation.isPending ? "Running…" : "Detect changepoints"}
 </button>
 <button
 onClick={() => lagMutation.mutate()}
 disabled={!mapping || !numericFactors.length || lagMutation.isPending}
 className="btn-terminal"
 >
 {lagMutation.isPending ? "Running…" : "Lag analysis"}
 </button>
 <button
 onClick={() => grangerMutation.mutate()}
 disabled={!mapping || !numericFactors.length || grangerMutation.isPending}
 className="btn-terminal"
 >
 {grangerMutation.isPending ? "Running…" : "Granger causality"}
 </button>
 <button
 onClick={() => rootCauseMutation.mutate()}
 disabled={
 !mapping ||
 !anomalyMethodsMutation.data ||
 rootCauseMutation.isPending ||
 (!numericFactors.length && !categoricalFactors.length)
 }
 className="btn-terminal"
 >
 {rootCauseMutation.isPending ? "Running…" : "Find root cause"}
 </button>
 </div>
 </div>

 {anomalyMethodsMutation.data && (
 <>
 <MethodAgreementMatrix
 methods={anomalyMethodsMutation.data.methods}
 matrix={anomalyMethodsMutation.data.agreement_matrix}
 counts={anomalyMethodsMutation.data.method_counts}
 />
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-2">
 <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
 Top anomalies (by vote)
 </p>
 <div className="max-h-64 overflow-auto">
 <table className="terminal-table">
 <thead className="border-border">
 <tr>
 <th className="px-3 py-1 text-left font-mono text-xs uppercase tracking-widest">Date</th>
 <th className="px-3 py-1 text-right font-mono text-xs uppercase tracking-widest">Value</th>
 <th className="px-3 py-1 text-center font-mono text-xs uppercase tracking-widest">Votes</th>
 <th className="px-3 py-1 text-left font-mono text-xs uppercase tracking-widest">Reason</th>
 </tr>
 </thead>
 <tbody>
 {[...anomalyMethodsMutation.data.records]
 .sort((a, b) => b.votes - a.votes)
 .slice(0, 30)
 .map((r) => (
 <tr key={r.index} className="border-b border-border/40 hover:bg-bg-elevated">
 <td className="px-3 py-1 font-mono">{r.date}</td>
 <td className="px-3 py-1 text-right text-text-secondary">
 {r.value.toFixed(1)}
 </td>
 <td className="px-3 py-1 text-center text-accent">{r.votes}/5</td>
 <td className="px-3 py-1 text-xs">{r.reason}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </>
 )}

 {rootCauseMutation.data && <RootCauseHints data={rootCauseMutation.data} />}

 {changepointsMutation.data && (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
 <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Changepoints detected: {changepointsMutation.data.changepoints.length}
 </h3>
 <div className="flex flex-wrap gap-2">
 {changepointsMutation.data.changepoints.map((c) => (
 <div
 key={c.index}
 className={`border px-3 py-2 font-mono text-xs ${
 c.direction === "up"
 ? "border-positive/40 bg-positive/5 text-positive"
 : "border-anomaly/40 bg-anomaly/5 text-anomaly"
 }`}
 >
 {c.date} · {c.direction === "up" ? "▲" : "▼"}{" "}
 {(c.shift_percent * 100).toFixed(0)}%
 </div>
 ))}
 </div>
 </div>
 )}

 {lagMutation.data && <LagCharts data={lagMutation.data.results} />}

 {grangerMutation.data && (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
 <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Granger causality (factor → target)
 </h3>
 <table className="terminal-table">
 <thead className="border-border">
 <tr>
 <th className="px-3 py-1 text-left font-mono text-xs uppercase tracking-widest">
 Factor
 </th>
 <th className="px-3 py-1 text-right font-mono text-xs uppercase tracking-widest">
 Best lag
 </th>
 <th className="px-3 py-1 text-right font-mono text-xs uppercase tracking-widest">
 p-value
 </th>
 <th className="px-3 py-1 text-center font-mono text-xs uppercase tracking-widest">
 Causal?
 </th>
 </tr>
 </thead>
 <tbody>
 {grangerMutation.data.results.map((r) => (
 <tr key={r.factor} className="border-b border-border/40">
 <td className="px-3 py-1 font-mono">{r.factor}</td>
 <td className="px-3 py-1 text-right text-text-secondary">{r.best_lag}</td>
 <td className="px-3 py-1 text-right text-text-secondary">
 {r.p_value.toFixed(4)}
 </td>
 <td className="px-3 py-1 text-center">
 {r.causal ? (
 <span className="border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs text-positive">
 yes
 </span>
 ) : (
 <span className="text-text-muted">-</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </ThreeRailLayout>
 );
}

function LagCharts({ data }: { data: LagResult[] }) {
 const t = useChartTheme();
 if (!data.length) return null;
 return (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
 <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Lag analysis (cross-correlation)
 </h3>
 <p className="text-xs text-text-muted">
 Positive lag means the factor leads the target. Peak height = strength.
 </p>
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 {data.map((r) => {
 const option = {
 backgroundColor: "transparent",
 grid: { left: 40, right: 16, top: 24, bottom: 24, containLabel: false },
 title: {
 text: `${r.factor} · peak lag=${r.peak_lag} (${r.peak_corr.toFixed(2)})`,
 textStyle: { color: t.textPrimary, fontFamily: "JetBrains Mono", fontSize: 11 },
 top: 0,
 left: 0,
 },
 xAxis: {
 type: "category",
 data: r.lags.map((l) => l.lag),
 axisLine: { lineStyle: { color: t.grid } },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
 },
 yAxis: {
 type: "value",
 min: -1,
 max: 1,
 axisLine: { show: false },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
 splitLine: { lineStyle: { color: t.grid } },
 },
 tooltip: { trigger: "axis" },
 series: [
 {
 type: "bar",
 data: r.lags.map((l) => l.corr),
 barMaxWidth: 8,
 itemStyle: {
 color: (p: { value: number }) => (p.value >= 0 ? t.accent : t.anomaly),
 },
 },
 ],
 };
 return <ReactECharts key={r.factor} option={option} style={{ height: 180, width: "100%" }} notMerge />;
 })}
 </div>
 </div>
 );
}
