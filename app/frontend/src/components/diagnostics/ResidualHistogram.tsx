import ReactECharts from"echarts-for-react";
import { useChartTheme } from"@/charts/theme";

interface Props {
 centers: number[];
 counts: number[];
 mean: number;
 std: number;
}

export function ResidualHistogram({ centers, counts, mean, std }: Props) {
 const t = useChartTheme();
 const data = centers.map((c, i) => [c, counts[i]]);
 const option = {
 backgroundColor:"transparent",
 grid: { left: 44, right: 16, top: 16, bottom: 36, containLabel: false },
 xAxis: {
 type:"value",
 axisLine: { lineStyle: { color: t.grid } },
 axisLabel: { color: t.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
 splitLine: { show: false },
 },
 yAxis: {
 type:"value",
 axisLine: { show: false },
 axisLabel: { color: t.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
 splitLine: { lineStyle: { color: t.grid } },
 },
 tooltip: {
 trigger:"item",
 backgroundColor: t.bgElevated,
 borderColor: t.grid,
 textStyle: { color: t.textPrimary, fontFamily:"JetBrains Mono" },
 },
 series: [
 {
 type:"bar",
 data,
 barMaxWidth: 20,
 itemStyle: { color: t.accentDim, borderColor: t.accent },
 },
 {
 type:"line",
 markLine: {
 symbol:"none",
 lineStyle: { color: t.warning, type:"dashed" },
 label: { show: false },
 data: [{ xAxis: mean }, { xAxis: mean - std }, { xAxis: mean + std }],
 },
 },
 ],
 };
 return <ReactECharts option={option} style={{ height: 200, width:"100%" }} notMerge />;
}
