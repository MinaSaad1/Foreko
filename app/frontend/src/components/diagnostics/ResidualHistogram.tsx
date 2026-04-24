import ReactECharts from "echarts-for-react";

interface Props {
  centers: number[];
  counts: number[];
  mean: number;
  std: number;
}

export function ResidualHistogram({ centers, counts, mean, std }: Props) {
  const data = centers.map((c, i) => [c, counts[i]]);
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
    tooltip: { trigger: "item", backgroundColor: "#1A1D25", borderColor: "#252830", textStyle: { color: "#F0F2F5", fontFamily: "DM Mono" } },
    series: [
      {
        type: "bar",
        data,
        barMaxWidth: 20,
        itemStyle: { color: "rgba(0,229,200,0.35)", borderColor: "#00E5C8" },
      },
      {
        type: "line",
        markLine: {
          symbol: "none",
          lineStyle: { color: "#F5A623", type: "dashed" },
          label: { show: false },
          data: [{ xAxis: mean }, { xAxis: mean - std }, { xAxis: mean + std }],
        },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 200, width: "100%" }} notMerge />;
}
