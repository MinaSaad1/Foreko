import { forwardRef, useImperativeHandle, useRef } from"react";
import ReactECharts from"echarts-for-react";
import { useChartExport, getChartPng, type ChartHandle } from"@/hooks/useChartExport";
import { ExportChartButton } from"@/components/common/ExportChartButton";
import { useChartTheme } from"@/charts/theme";
import type { ComparisonResponse } from"@/types/comparison";

interface ComparisonChartProps {
 data: ComparisonResponse;
 showBothModels?: boolean;
 activeModel?:"winner" |"alternative";
}

export type ComparisonChartHandle = ChartHandle;

export const ComparisonChart = forwardRef<ComparisonChartHandle, ComparisonChartProps>(
 function ComparisonChart(
 { data, showBothModels = false, activeModel ="winner" },
 ref,
 ) {
 const theme = useChartTheme();
 const CHART_COLORS = {
 historical: theme.historical,
 winner: theme.winner,
 alternative: theme.alternative,
 band: theme.band,
 holdout: theme.holdout,
 grid: theme.grid,
 axisLabel: theme.axisLabel,
 };
 const chartRef = useRef<ReactECharts>(null);
 const { export: exportChart } = useChartExport(chartRef, {
 filename:"comparison-chart",
 });

 useImperativeHandle(ref, () => ({
 getPng: (opts) => getChartPng(chartRef, opts),
 }));

 const { winner, alternative, dates, historical_dates, historical_values } = data;

 const primary = activeModel ==="winner" ? winner : alternative;
 const overlay = activeModel ==="winner" ? alternative : winner;

 // Some models (e.g. LightGBM in the default config) return P10 = P50 = P90,
 // i.e. they produce point forecasts only. To still show meaningful
 // uncertainty information when the active model is point-only, fall back to
 // the other model's band when the primary's band is degenerate.
 function bandIsDegenerate(m: typeof primary): boolean {
 const n = Math.min(m.p10.length, m.p90.length);
 if (n === 0) return true;
 let totalSpread = 0;
 for (let i = 0; i < n; i++) {
 totalSpread += Math.max(0, m.p90[i] - m.p10[i]);
 }
 return totalSpread < 1e-6;
 }
 const primaryDegenerate = bandIsDegenerate(primary);
 const bandSource = primaryDegenerate && !bandIsDegenerate(overlay) ? overlay : primary;
 const bandIsFromOverlay = bandSource !== primary;

 const allDates = [...historical_dates, ...dates];

 // Detect data frequency to pick a sensible x-axis label format.
 // Daily/weekly data spanning a single month would otherwise collapse to "2025-01"
 // for every tick. We look at the median step between consecutive dates.
 const detectFrequency = (datesArr: string[]): "daily" | "weekly" | "monthly" | "yearly" => {
 if (datesArr.length < 2) return "monthly";
 const steps: number[] = [];
 for (let i = 1; i < Math.min(datesArr.length, 10); i++) {
 const a = new Date(datesArr[i - 1]).getTime();
 const b = new Date(datesArr[i]).getTime();
 if (Number.isFinite(a) && Number.isFinite(b)) {
 steps.push(Math.abs(b - a) / 86_400_000);
 }
 }
 if (steps.length === 0) return "monthly";
 steps.sort((a, b) => a - b);
 const median = steps[Math.floor(steps.length / 2)];
 if (median <= 1.5) return "daily";
 if (median <= 10) return "weekly";
 if (median <= 60) return "monthly";
 return "yearly";
 };
 const freq = detectFrequency(allDates);
 const formatDateLabel = (raw: string): string => {
 if (!raw) return "";
 // Normalize ISO-like strings.
 const s = raw.length >= 10 ? raw.slice(0, 10) : raw;
 switch (freq) {
 case "daily":
 case "weekly":
 return s.slice(5); // MM-DD
 case "monthly":
 return s.slice(0, 7); // YYYY-MM
 case "yearly":
 return s.slice(0, 4); // YYYY
 default:
 return s;
 }
 };

 const historicalSeries = historical_values.map(
 (v, i) => [historical_dates[i], v] as [string, number],
 );
 const primarySeries = dates.map(
 (d, i) => [d, primary.point_forecast[i]] as [string, number],
 );
 const overlaySeries = dates.map(
 (d, i) => [d, overlay.point_forecast[i]] as [string, number],
 );
 // P10 + (P90 - P10) stacked = an area band between P10 and P90.
 // Stacking on a category x-axis is index-based, so the series data must be
 // aligned to the full `allDates` index. We pad the historical positions with
 // null so the band only renders over the forecast region.
 const historicalPad: Array<number | null> = historical_dates.map(() => null);
 const p10Data: Array<number | null> = [...historicalPad, ...bandSource.p10];
 const bandData: Array<number | null> = [
 ...historicalPad,
 ...bandSource.p90.map((hi, i) => Math.max(0, hi - bandSource.p10[i])),
 ];

 const series: object[] = [
 // P10 invisible baseline (stacked).
 {
 name:"P10",
 type:"line",
 data: p10Data,
 lineStyle: { color:"transparent", width: 0, opacity: 0 },
 areaStyle: { color:"transparent", opacity: 0 },
 stack:"confidence",
 symbol:"none",
 z: 1,
 connectNulls: false,
 },
 // Visible band, sitting on top of P10. Height = P90 - P10.
 {
 name:"Band",
 type:"line",
 data: bandData,
 lineStyle: { color:"transparent", width: 0, opacity: 0 },
 areaStyle: { color: CHART_COLORS.band, opacity: 1 },
 stack:"confidence",
 symbol:"none",
 z: 1,
 connectNulls: false,
 },
 {
 name:"Historical",
 type:"line",
 data: historicalSeries,
 lineStyle: { color: CHART_COLORS.historical, width: 2 },
 itemStyle: { color: CHART_COLORS.historical },
 symbol:"none",
 z: 2,
 },
 {
 name: primary.display_name,
 type:"line",
 data: primarySeries,
 lineStyle: { color: CHART_COLORS.winner, width: 2 },
 itemStyle: { color: CHART_COLORS.winner },
 symbol:"none",
 z: 3,
 },
 ];

 if (showBothModels) {
 series.push({
 name: overlay.display_name,
 type:"line",
 data: overlaySeries,
 lineStyle: { color: CHART_COLORS.alternative, width: 1.5, type:"dashed" },
 itemStyle: { color: CHART_COLORS.alternative },
 symbol:"none",
 z: 2,
 });
 }

 const forecastStartPct = allDates.length
 ? Math.max(0, Math.round(((historical_dates.length - Math.min(60, historical_dates.length)) / allDates.length) * 100))
 : 0;

 const option = {
 backgroundColor:"transparent",
 grid: { left: 56, right: 24, top: 24, bottom: 68, containLabel: false },
 xAxis: {
 type:"category",
 data: allDates,
 axisLine: { lineStyle: { color: CHART_COLORS.grid } },
 axisTick: { show: false },
 axisLabel: {
 color: CHART_COLORS.axisLabel,
 fontFamily:"JetBrains Mono",
 fontSize: 11,
 rotate: 30,
 formatter: (v: string) => formatDateLabel(v),
 },
 splitLine: { show: false },
 },
 yAxis: {
 type:"value",
 axisLine: { show: false },
 axisTick: { show: false },
 axisLabel: {
 color: CHART_COLORS.axisLabel,
 fontFamily:"JetBrains Mono",
 fontSize: 11,
 },
 splitLine: { lineStyle: { color: CHART_COLORS.grid } },
 },
 dataZoom: [
 {
 type:"inside",
 xAxisIndex: 0,
 start: forecastStartPct,
 end: 100,
 zoomOnMouseWheel: true,
 moveOnMouseMove: true,
 moveOnMouseWheel: false,
 },
 {
 type:"slider",
 xAxisIndex: 0,
 start: forecastStartPct,
 end: 100,
 height: 18,
 bottom: 8,
 borderColor: CHART_COLORS.grid,
 backgroundColor:"transparent",
 fillerColor: theme.band,
 handleStyle: { color: theme.accent, borderColor: theme.accent },
 moveHandleStyle: { color: theme.grid },
 dataBackground: {
 lineStyle: { color: theme.grid, width: 1 },
 areaStyle: { color: theme.holdout },
 },
 selectedDataBackground: {
 lineStyle: { color: theme.accent, width: 1 },
 areaStyle: { color: theme.accentDim },
 },
 textStyle: { color: CHART_COLORS.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
 labelFormatter: (_v: number, s: string) => formatDateLabel(s),
 },
 {
 type:"inside",
 yAxisIndex: 0,
 zoomOnMouseWheel:"shift",
 moveOnMouseMove: false,
 moveOnMouseWheel: false,
 },
 ],
 tooltip: {
 trigger:"axis",
 backgroundColor: theme.bgElevated,
 borderColor: theme.grid,
 textStyle: { color: theme.textPrimary, fontFamily:"JetBrains Mono", fontSize: 12 },
 formatter: (params: Array<{ seriesName: string; data: [string, number] | number | null; dataIndex: number }>) => {
 const rows: string[] = [];
 for (const p of params) {
 if (["P10","Band"].includes(p.seriesName)) continue;
 const raw = p.data;
 const v = Array.isArray(raw) ? raw[1] : raw;
 if (v == null || !Number.isFinite(v as number)) continue;
 rows.push(`${p.seriesName}: ${(v as number).toLocaleString()}`);
 }
 // Add P10–P90 band info when the primary forecast series is hovered.
 const fc = params.find((p) => p.seriesName === primary.display_name);
 if (fc) {
 const i = fc.dataIndex;
 const p10 = bandSource.p10[i];
 const p90 = bandSource.p90[i];
 if (Number.isFinite(p10) && Number.isFinite(p90) && Math.abs(p90 - p10) > 1e-6) {
 const label = bandIsFromOverlay
 ? `Band (P10–P90 via ${bandSource.display_name})`
 : "Band (P10–P90)";
 rows.push(`${label}: ${Math.round(p10).toLocaleString()} – ${Math.round(p90).toLocaleString()}`);
 }
 }
 return rows.join("<br/>");
 },
 },
 legend: showBothModels
 ? {
 data: [primary.display_name, overlay.display_name,"Historical"],
 textStyle: { color: theme.textSecondary, fontFamily:"JetBrains Mono", fontSize: 11 },
 itemWidth: 16,
 itemHeight: 2,
 }
 : { show: false },
 };

 return (
 <div className="space-y-4">
 <div className="flex justify-end">
 <ExportChartButton onExport={exportChart} />
 </div>
 <ReactECharts
 ref={chartRef}
 option={{ ...option, series }}
 style={{ height: 320, width:"100%" }}
 opts={{ renderer:"canvas" }}
 notMerge
 lazyUpdate={false}
 />
 <p className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
 Scroll to zoom X · Shift+scroll to zoom Y · Drag the handles below to pan
 </p>
 {bandIsFromOverlay && (
 <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
 ▸ Band: 80% interval from {bandSource.display_name} ({primary.display_name} is point-only)
 </p>
 )}
 {primaryDegenerate && bandIsFromOverlay === false && (
 <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
 ▸ This model returns point forecasts only; no uncertainty band available.
 </p>
 )}
 </div>
 );
 },
);
