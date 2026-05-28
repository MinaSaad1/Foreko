import { useRef } from"react";
import ReactECharts from"echarts-for-react";
import { useChartExport } from"@/hooks/useChartExport";
import { ExportChartButton } from"@/components/common/ExportChartButton";
import { useChartTheme } from"@/charts/theme";
import type { FactorStat } from"@/types/factors";

interface FactorInfluenceChartProps {
 factors: FactorStat[];
}

export function FactorInfluenceChart({ factors }: FactorInfluenceChartProps) {
 const t = useChartTheme();
 const chartRef = useRef<ReactECharts>(null);
 const { export: exportChart } = useChartExport(chartRef, {
 filename:"factor-influence",
 });

 if (factors.length === 0) return null;

 // Sort ascending for horizontal bar (larger bars render at top).
 const sorted = [...factors].sort((a, b) => a.influence - b.influence);
 const labels = sorted.map((f) => f.name);
 const values = sorted.map((f) => Number((f.influence * 100).toFixed(1)));
 const directions = sorted.map((f) => (f.correlation >= 0 ?"up" :"down"));

 const option = {
 backgroundColor:"transparent",
 grid: { left: 120, right: 48, top: 16, bottom: 16, containLabel: false },
 xAxis: {
 type:"value",
 max: 100,
 axisLine: { lineStyle: { color: t.grid } },
 axisTick: { show: false },
 axisLabel: {
 color: t.axisLabel,
 fontFamily:"JetBrains Mono",
 fontSize: 10,
 formatter:"{value}%",
 },
 splitLine: { lineStyle: { color: t.grid } },
 },
 yAxis: {
 type:"category",
 data: labels,
 axisLine: { show: false },
 axisTick: { show: false },
 axisLabel: { color: t.textPrimary, fontFamily:"JetBrains Mono", fontSize: 11 },
 },
 tooltip: {
 trigger:"axis",
 backgroundColor: t.bgElevated,
 borderColor: t.grid,
 textStyle: { color: t.textPrimary, fontFamily:"JetBrains Mono", fontSize: 11 },
 formatter: (params: { dataIndex: number }[]) => {
 const i = params[0].dataIndex;
 const f = sorted[i];
 const sign = f.correlation >= 0 ?"+" :"";
 return `${f.name}<br/>Influence: ${(f.influence * 100).toFixed(1)}%<br/>Correlation: ${sign}${f.correlation.toFixed(3)}`;
 },
 },
 series: [
 {
 type:"bar",
 data: values.map((v, i) => ({
 value: v,
 itemStyle: {
 color: directions[i] ==="up" ? t.accent : t.neutral,
 borderRadius: [0, 2, 2, 0],
 },
 label: {
 show: true,
 position:"right",
 color: t.textSecondary,
 fontFamily:"JetBrains Mono",
 fontSize: 10,
 formatter: `${v.toFixed(1)}%`,
 },
 })),
 barMaxWidth: 16,
 },
 ],
 };

 const height = Math.max(120, factors.length * 32 + 40);

 return (
 <div className="space-y-4">
 <div className="flex justify-end">
 <ExportChartButton onExport={exportChart} />
 </div>
 <ReactECharts ref={chartRef} option={option} style={{ height, width:"100%" }} notMerge />
 </div>
 );
}
