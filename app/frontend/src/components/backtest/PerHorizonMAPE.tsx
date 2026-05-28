import { forwardRef, useImperativeHandle, useRef } from"react";
import ReactECharts from"echarts-for-react";
import { getChartPng, type ChartHandle } from"@/hooks/useChartExport";
import { useChartTheme } from"@/charts/theme";

interface PerHorizonMAPEProps {
 perHorizon: Record<string, number[]>;
}

export type PerHorizonMAPEHandle = ChartHandle;

export const PerHorizonMAPE = forwardRef<PerHorizonMAPEHandle, PerHorizonMAPEProps>(
 function PerHorizonMAPE({ perHorizon }, ref) {
 const t = useChartTheme();
 const COLORS = [t.accent, t.neutral, t.positive, t.warning, t.anomaly, t.textMuted];
 const chartRef = useRef<ReactECharts>(null);
 useImperativeHandle(ref, () => ({
 getPng: (opts) => getChartPng(chartRef, opts),
 }));
 const models = Object.keys(perHorizon);
 if (!models.length) return null;
 const horizon = Math.max(...Object.values(perHorizon).map((v) => v.length));
 const xs = Array.from({ length: horizon }, (_, i) => `h+${i + 1}`);

 const series = models.map((m, i) => ({
 name: m,
 type:"line",
 data: (perHorizon[m] ?? []).map((v) => (v * 100).toFixed(2)),
 lineStyle: { color: COLORS[i % COLORS.length], width: 2 },
 itemStyle: { color: COLORS[i % COLORS.length] },
 symbol:"circle",
 symbolSize: 6,
 }));

 const option = {
 backgroundColor:"transparent",
 grid: { left: 48, right: 24, top: 32, bottom: 44, containLabel: false },
 legend: {
 data: models,
 textStyle: { color: t.textSecondary, fontFamily:"JetBrains Mono", fontSize: 11 },
 top: 0,
 right: 16,
 },
 xAxis: {
 type:"category",
 data: xs,
 axisLine: { lineStyle: { color: t.grid } },
 axisTick: { show: false },
 axisLabel: { color: t.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
 },
 yAxis: {
 type:"value",
 axisLine: { show: false },
 axisTick: { show: false },
 axisLabel: {
 color: t.axisLabel,
 fontFamily:"JetBrains Mono",
 fontSize: 10,
 formatter:"{value}%",
 },
 splitLine: { lineStyle: { color: t.grid } },
 },
 tooltip: {
 trigger:"axis",
 backgroundColor: t.bgElevated,
 borderColor: t.grid,
 textStyle: { color: t.textPrimary, fontFamily:"JetBrains Mono", fontSize: 11 },
 },
 series,
 };

 return <ReactECharts ref={chartRef} option={option} style={{ height: 220, width:"100%" }} notMerge />;
 },
);
