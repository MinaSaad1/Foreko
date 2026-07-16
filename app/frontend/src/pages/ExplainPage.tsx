import { useParams } from"react-router-dom";
import { ColumnMapper } from"@/components/ColumnMapper";
import { MethodAgreementMatrix } from"@/components/anomaly/MethodAgreementMatrix";
import { RootCauseHints } from"@/components/anomaly/RootCauseHints";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import { RunError } from"@/components/common/RunError";
import {
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
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
 <div className="flex flex-col gap-6">
 <PageHeading
   kicker="Understand"
   title={displayName}
   intro="Four independent tools for asking why the numbers moved: a five-method anomaly vote, changepoint detection, lag analysis, and Granger causality against the factors you pick. Each runs on its own, so run only what you need."
 />

 <FactGrid>
   <Fact label="File" value={preview ? preview.filename : "Loading..."} />
   <Fact label="Rows" value={preview ? preview.row_count.toLocaleString() : "..."} />
   <Fact
     label="Numeric factors"
     value={`${numericFactors.length} of ${numericCols.length} selected`}
   />
   <Fact
     label="Category factors"
     value={`${categoricalFactors.length} of ${categoricalCols.length} selected`}
   />
 </FactGrid>

 <Section title="Set up">
 <div className="space-y-4">
 {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

 {numericCols.length > 0 && (
 <div>
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
 Numeric factors
 </p>
 <p className="mb-2 mt-1 text-[13px] text-text-secondary">
 Used by lag, Granger, and root cause. The other tools read your target column only.
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
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
 Category factors
 </p>
 <p className="mb-2 mt-1 text-[13px] text-text-secondary">
 Used by root cause, for example promotion, holiday, or segment.
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

 </div>
 </Section>

 {/* Five actions used to sit in one flat wrapping row, three of them dead on
     arrival, with the run order documented only in a rail that hides below
     lg. The grouping is now the explanation: each group says what it reads,
     and a blocked group says so in plain words instead of just greying out. */}
 <Section title="Analyses">
 <div className="space-y-5">
 <div>
 <h3 className="text-[13px] font-medium text-text-primary">On the series</h3>
 <p className="mt-1 text-[13px] text-text-secondary">
 These read your target column on its own, so they run as soon as the columns
 are mapped.
 </p>
 <div className="mt-2 flex flex-wrap gap-2">
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
 </div>
 </div>

 <div>
 <h3 className="text-[13px] font-medium text-text-primary">Against your factors</h3>
 <p className="mt-1 text-[13px] text-text-secondary">
 These weigh a factor against the target, so they need at least one factor
 selected above.
 </p>
 {!numericFactors.length && (
 <p className="mt-2 text-[13px] text-text-secondary">
 Select at least one numeric factor above to run lag or Granger causality.
 </p>
 )}
 {!anomalyMethodsMutation.data && (
 <p className="mt-2 text-[13px] text-text-secondary">
 Root cause explains the anomalies that detection finds, so run Detect
 anomalies first.
 </p>
 )}
 <div className="mt-2 flex flex-wrap gap-2">
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

 {/* Each analysis runs independently, so each reports its own failure.
     Without these a failed run leaves the previous panel on screen. */}
 <RunError error={anomalyMethodsMutation.error} label="Anomaly detection" />
 <RunError error={changepointsMutation.error} label="Changepoint detection" />
 <RunError error={lagMutation.error} label="Lag analysis" />
 <RunError error={grangerMutation.error} label="Granger causality" />
 <RunError error={rootCauseMutation.error} label="Root cause" />
 </div>
 </Section>

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

 <Depth label="Reading the result">
 <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
 <li className="flex gap-2">
 <span className="text-accent" aria-hidden>
 ▸
 </span>
 <span>
 Root cause explains anomalies, so pick factors, run Detect anomalies, then
 Find root cause.
 </span>
 </li>
 <li className="flex gap-2">
 <span className="text-accent" aria-hidden>
 ▸
 </span>
 <span>Lag: a positive lag means the factor leads the target.</span>
 </li>
 <li className="flex gap-2">
 <span className="text-accent" aria-hidden>
 ▸
 </span>
 <span>
 Granger p &lt; 0.05 means the factor predicts the target beyond the target's
 own history. That is predictive evidence, not proof of cause.
 </span>
 </li>
 </ul>
 </Depth>

 {hasResult && (
 <SecondaryActions>
 <button type="button" onClick={resetAll} className="btn-terminal">
 Clear results
 </button>
 </SecondaryActions>
 )}
 </div>
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
