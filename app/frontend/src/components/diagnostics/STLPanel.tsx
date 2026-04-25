import ReactECharts from "echarts-for-react";
import { useChartTheme, type ChartTheme } from "@/charts/theme";

interface STLPanelProps {
  dates: string[];
  observed: number[];
  trend: number[];
  seasonal: number[];
  residual: number[];
}

function miniChart(t: ChartTheme, dates: string[], values: number[], color: string) {
  return {
    backgroundColor: "transparent",
    grid: { left: 44, right: 16, top: 10, bottom: 20, containLabel: false },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: t.grid } },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 9 },
      splitLine: { lineStyle: { color: t.grid } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.bgElevated,
      borderColor: t.grid,
      textStyle: { color: t.textPrimary, fontFamily: "JetBrains Mono", fontSize: 11 },
    },
    series: [
      {
        type: "line",
        data: values,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        symbol: "none",
      },
    ],
  };
}

export function STLPanel({ dates, observed, trend, seasonal, residual }: STLPanelProps) {
  const t = useChartTheme();
  const panels = [
    { label: "Observed", data: observed, color: t.textPrimary },
    { label: "Trend", data: trend, color: t.accent },
    { label: "Seasonal", data: seasonal, color: t.neutral },
    { label: "Residual", data: residual, color: t.textMuted },
  ];
  return (
    <div className="space-y-3">
      {panels.map((p) => (
        <div key={p.label}>
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-text-muted">{p.label}</p>
          <ReactECharts
            option={miniChart(t, dates, p.data, p.color)}
            style={{ height: 100, width: "100%" }}
            notMerge
          />
        </div>
      ))}
    </div>
  );
}
