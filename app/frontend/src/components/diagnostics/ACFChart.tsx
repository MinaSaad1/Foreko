import ReactECharts from "echarts-for-react";

interface Props {
  acf: number[];
  n: number;
}

export function ACFChart({ acf, n }: Props) {
  if (!acf.length) return null;
  const lags = acf.map((_, i) => i);
  const ci = 1.96 / Math.sqrt(n);
  const option = {
    backgroundColor: "transparent",
    grid: { left: 44, right: 16, top: 16, bottom: 36, containLabel: false },
    xAxis: {
      type: "category",
      data: lags,
      axisLine: { lineStyle: { color: "#252830" } },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      min: -1,
      max: 1,
      axisLine: { show: false },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
      splitLine: { lineStyle: { color: "#252830" } },
    },
    tooltip: { trigger: "axis" },
    series: [
      {
        type: "bar",
        data: acf.map((v) => Number(v.toFixed(4))),
        barMaxWidth: 6,
        itemStyle: {
          color: (p: { value: number }) => (Math.abs(p.value) > ci ? "#00E5C8" : "#4A90D9"),
        },
      },
      {
        type: "line",
        markLine: {
          symbol: "none",
          lineStyle: { color: "#F5A623", type: "dashed", opacity: 0.5 },
          label: { show: false },
          data: [{ yAxis: ci }, { yAxis: -ci }],
        },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 200, width: "100%" }} notMerge />;
}
