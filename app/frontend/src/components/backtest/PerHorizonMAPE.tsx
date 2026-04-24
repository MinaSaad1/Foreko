import { forwardRef, useImperativeHandle, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { getChartPng, type ChartHandle } from "@/hooks/useChartExport";

interface PerHorizonMAPEProps {
  perHorizon: Record<string, number[]>;
}

export type PerHorizonMAPEHandle = ChartHandle;

const COLORS = ["#00E5C8", "#4A90D9", "#22D17A", "#F5A623", "#FF4757", "#8A8F9E"];

export const PerHorizonMAPE = forwardRef<PerHorizonMAPEHandle, PerHorizonMAPEProps>(
  function PerHorizonMAPE({ perHorizon }, ref) {
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
    type: "line",
    data: (perHorizon[m] ?? []).map((v) => (v * 100).toFixed(2)),
    lineStyle: { color: COLORS[i % COLORS.length], width: 2 },
    itemStyle: { color: COLORS[i % COLORS.length] },
    symbol: "circle",
    symbolSize: 6,
  }));

  const option = {
    backgroundColor: "transparent",
    grid: { left: 48, right: 24, top: 32, bottom: 44, containLabel: false },
    legend: {
      data: models,
      textStyle: { color: "#8A8F9E", fontFamily: "DM Mono", fontSize: 11 },
      top: 0,
      right: 16,
    },
    xAxis: {
      type: "category",
      data: xs,
      axisLine: { lineStyle: { color: "#252830" } },
      axisTick: { show: false },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#565B6A",
        fontFamily: "DM Mono",
        fontSize: 10,
        formatter: "{value}%",
      },
      splitLine: { lineStyle: { color: "#252830" } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1A1D25",
      borderColor: "#252830",
      textStyle: { color: "#F0F2F5", fontFamily: "DM Mono", fontSize: 11 },
    },
    series,
  };

  return <ReactECharts ref={chartRef} option={option} style={{ height: 220, width: "100%" }} notMerge />;
  },
);
