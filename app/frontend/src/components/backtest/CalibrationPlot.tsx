import { forwardRef, useImperativeHandle, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { getChartPng, type ChartHandle } from "@/hooks/useChartExport";
import { useChartTheme } from "@/charts/theme";
import type { CalibrationResult } from "@/types/phases";

interface CalibrationPlotProps {
  data: CalibrationResult;
}

export type CalibrationPlotHandle = ChartHandle;

export const CalibrationPlot = forwardRef<CalibrationPlotHandle, CalibrationPlotProps>(
  function CalibrationPlot({ data }, ref) {
  const t = useChartTheme();
  const chartRef = useRef<ReactECharts>(null);
  useImperativeHandle(ref, () => ({
    getPng: (opts) => getChartPng(chartRef, opts),
  }));
  const points = data.reliability.map((r) => [r.nominal, r.empirical]);
  const option = {
    backgroundColor: "transparent",
    grid: { left: 52, right: 24, top: 16, bottom: 44, containLabel: false },
    xAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLine: { lineStyle: { color: t.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: t.axisLabel,
        fontFamily: "JetBrains Mono",
        fontSize: 10,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: { show: false },
      name: "Nominal coverage",
      nameTextStyle: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
      nameLocation: "middle",
      nameGap: 28,
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: t.axisLabel,
        fontFamily: "JetBrains Mono",
        fontSize: 10,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: t.grid } },
      name: "Empirical",
      nameTextStyle: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: t.bgElevated,
      borderColor: t.grid,
      textStyle: { color: t.textPrimary, fontFamily: "JetBrains Mono", fontSize: 11 },
      formatter: (params: { value: [number, number] }) =>
        `Nominal: ${(params.value[0] * 100).toFixed(0)}%<br/>Empirical: ${(params.value[1] * 100).toFixed(1)}%`,
    },
    series: [
      {
        name: "Ideal",
        type: "line",
        data: [[0, 0], [1, 1]],
        lineStyle: { color: t.textMuted, width: 1, type: "dashed" },
        symbol: "none",
        z: 1,
      },
      {
        name: "Observed",
        type: "scatter",
        data: points,
        itemStyle: { color: t.accent },
        symbolSize: 10,
        z: 3,
      },
      {
        type: "line",
        data: points,
        lineStyle: { color: t.accent, width: 2 },
        symbol: "none",
        z: 2,
      },
    ],
  };
  return <ReactECharts ref={chartRef} option={option} style={{ height: 280, width: "100%" }} notMerge />;
  },
);
