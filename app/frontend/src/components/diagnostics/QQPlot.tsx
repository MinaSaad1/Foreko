import ReactECharts from "echarts-for-react";

interface Props {
  points: [number, number][];
}

export function QQPlot({ points }: Props) {
  if (!points.length) return <p className="text-xs text-text-muted">Not enough residuals.</p>;
  const xs = points.map((p) => p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const option = {
    backgroundColor: "transparent",
    grid: { left: 44, right: 16, top: 16, bottom: 36, containLabel: false },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: "#252830" } },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
      splitLine: { lineStyle: { color: "#252830" } },
    },
    tooltip: { trigger: "item" },
    series: [
      {
        type: "line",
        data: [[minX, minX], [maxX, maxX]],
        lineStyle: { color: "#565B6A", type: "dashed" },
        symbol: "none",
      },
      {
        type: "scatter",
        data: points,
        itemStyle: { color: "#00E5C8" },
        symbolSize: 5,
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 200, width: "100%" }} notMerge />;
}
