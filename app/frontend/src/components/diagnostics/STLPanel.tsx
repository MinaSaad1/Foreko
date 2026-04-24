import ReactECharts from "echarts-for-react";

interface STLPanelProps {
  dates: string[];
  observed: number[];
  trend: number[];
  seasonal: number[];
  residual: number[];
}

function miniChart(dates: string[], values: number[], color: string) {
  return {
    backgroundColor: "transparent",
    grid: { left: 44, right: 16, top: 10, bottom: 20, containLabel: false },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: "#252830" } },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 9 },
      splitLine: { lineStyle: { color: "#252830" } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1A1D25",
      borderColor: "#252830",
      textStyle: { color: "#F0F2F5", fontFamily: "DM Mono", fontSize: 11 },
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
  const panels = [
    { label: "Observed", data: observed, color: "#F0F2F5" },
    { label: "Trend", data: trend, color: "#00E5C8" },
    { label: "Seasonal", data: seasonal, color: "#4A90D9" },
    { label: "Residual", data: residual, color: "#8A8F9E" },
  ];
  return (
    <div className="space-y-3">
      {panels.map((p) => (
        <div key={p.label}>
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-text-muted">{p.label}</p>
          <ReactECharts
            option={miniChart(dates, p.data, p.color)}
            style={{ height: 100, width: "100%" }}
            notMerge
          />
        </div>
      ))}
    </div>
  );
}
