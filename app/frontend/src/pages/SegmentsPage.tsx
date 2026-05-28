import { useParams } from"react-router-dom";
import ReactECharts from"echarts-for-react";
import { useChartTheme } from"@/charts/theme";
import { ColumnMapper } from"@/components/ColumnMapper";
import { PageIntro } from"@/components/common/PageIntro";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import {
  LeftRail,
  PageHeader,
  RailChoiceGrid,
  RailResetButton,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import { useHealth } from"@/hooks/useHealth";
import { useSegmentsOrchestrator } from"@/hooks/useSegmentsOrchestrator";
import type { SegmentsResult } from"@/types/phases";

export function SegmentsPage() {
 const { datasetId } = useParams<{ datasetId?: string }>();
 const { activeId, preview } = useSyncedDataset(datasetId);
 const { data: health } = useHealth();
 const modelReady = health?.model_status === "ready";

 const { mapping, handleMappingChange, topN, setTopN, sortBy, setSortBy, data, isPending, isError, error, mutate, reset } =
 useSegmentsOrchestrator(activeId);

 if (!activeId) {
 return (
 <EmptyDatasetState
 title="Segments / Cohorts"pageKey="segments"basePath="/segments"message="Upload a CSV with a series ID column, or pick a sample to explore."
 />
 );
 }

 const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Segments";

 return (
   <ThreeRailLayout
     left={
       <LeftRail ariaLabel="Segments configuration">
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

         <RailSection label="Top N">
           <RailChoiceGrid
             options={[
               { value: 5, label: "5" },
               { value: 10, label: "10" },
               { value: 20, label: "20" },
               { value: 50, label: "50" },
             ]}
             value={topN}
             onChange={setTopN}
             disabled={!!data}
             columns={2}
           />
         </RailSection>

         <RailSection label="Sort by">
           <RailChoiceGrid
             options={[
               { value: "total", label: "Total" },
               { value: "growth", label: "Growth" },
               { value: "volatility", label: "Vol" },
             ]}
             value={sortBy}
             onChange={(v) => setSortBy(v as "total" | "growth" | "volatility")}
             columns={3}
           />
         </RailSection>

         {data && <RailResetButton onClick={() => reset()} />}
       </LeftRail>
     }
     right={
       <RightRail ariaLabel="Segments insights">
         {!data && (
           <WhatYoullGet
             summary="Side-by-side ranking of every segment by total, growth, or volatility, plus a multi-line chart of the top series. Requires a series ID column in your CSV."
             reading={[
               "Total = lifetime sum. Growth = first-to-last delta. Volatility = relative std.",
               "Sort flips the ranking instantly. The chart shows the top 10 timelines.",
               "Use Volatility to find the bumpiest series that need extra modelling.",
             ]}
           />
         )}
         {data && (
           <RailSection label="Run">
             <RailRow k="Segments" v={String(data.n_segments)} tone="accent" />
             <RailRow k="Sorted by" v={sortBy} />
             <RailRow k="Shown" v={`Top ${Math.min(10, data.n_segments)}`} />
           </RailSection>
         )}
       </RightRail>
     }
   >
     <PageHeader
       kicker="Compare"
       title={displayName}
       subtitle={preview ? `${preview.row_count.toLocaleString()} rows · top ${topN}` : undefined}
     />

     <div className="lg:hidden">
       <PageIntro pageKey="segments" />
     </div>

     {!data && (
       <div className="border border-border-strong/70 bg-bg-surface px-6 py-6 space-y-5 shadow-[var(--shadow-elev-1)]">
         <div className="flex items-center gap-2">
           <span className="text-accent leading-none" aria-hidden>▣</span>
           <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
             Set up segment comparison
           </h2>
         </div>
         {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}
         <button
           onClick={() => mutate()}
           disabled={!mapping?.series_id_col || isPending || !modelReady}
           className="w-full btn-terminal-primary"
         >
           {isPending ? "Running..." : "Compare segments"}
         </button>
         {!mapping?.series_id_col && (
           <p className="border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
             Select a series ID column in the mapping above.
           </p>
         )}
         {!modelReady && (
           <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted text-center">
             Model still loading; the Run button enables when it's ready.
           </p>
         )}
         {isError && (
           <p className="border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-xs text-anomaly">
             {error?.message}
           </p>
         )}
       </div>
     )}

     {data && (
       <div className="space-y-5">
         <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
           <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
             {data.n_segments} segments, ranked by {sortBy}
           </h3>
           <SegmentRanking ranking={data.rankings[`by_${sortBy}`as keyof typeof data.rankings]} sortBy={sortBy} />
         </div>

         <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
           <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
             Segment timelines
           </h3>
           <MultiLineSegments segments={data.segments.slice(0, 10)} />
         </div>
       </div>
     )}
   </ThreeRailLayout>
 );
}

function SegmentRanking({ ranking, sortBy }: { ranking: { id: string; value: number }[]; sortBy: string }) {
 const fmt = (v: number) =>
 sortBy === "growth" || sortBy === "volatility" ? `${(v * 100).toFixed(1)}%` : v.toLocaleString();
 return (
 <div className="space-y-1">
 {ranking.slice(0, 10).map((r, i) => (
 <div
 key={r.id}
 className="flex items-center justify-between border border-border bg-bg-elevated px-3 py-2"
 >
 <p className="font-mono text-xs text-text-secondary">
 <span className="text-text-muted mr-2">#{i + 1}</span>
 {r.id}
 </p>
 <p className="font-mono text-sm text-accent">{fmt(r.value)}</p>
 </div>
 ))}
 </div>
 );
}

function MultiLineSegments({ segments }: { segments: SegmentsResult["segments"] }) {
 const t = useChartTheme();
 const colors = [t.accent, t.neutral, t.positive, t.warning, t.anomaly, t.textMuted, t.alternative, t.historical];
 const series = segments.map((s, i) => ({
 name: s.id,
 type: "line",
 data: s.values.map((v, idx) => [s.dates[idx], v]),
 lineStyle: { color: colors[i % colors.length], width: 1.5 },
 itemStyle: { color: colors[i % colors.length] },
 symbol: "none",
 }));
 const option = {
 backgroundColor: "transparent",
 grid: { left: 56, right: 24, top: 24, bottom: 40, containLabel: false },
 legend: {
 data: segments.map((s) => s.id),
 textStyle: { color: t.textSecondary, fontFamily: "JetBrains Mono", fontSize: 10 },
 top: 0,
 },
 xAxis: {
 type: "time",
 axisLine: { lineStyle: { color: t.grid } },
 axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
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
 { type: "slider", xAxisIndex: 0, height: 16, bottom: 0 },
 ],
 series,
 };
 return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
