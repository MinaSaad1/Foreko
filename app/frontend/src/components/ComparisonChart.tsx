import { forwardRef, useImperativeHandle, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { useChartExport, getChartPng, type ChartHandle } from "@/hooks/useChartExport";
import { ExportChartButton } from "@/components/common/ExportChartButton";
import type { ComparisonResponse } from "@/types/comparison";

interface ComparisonChartProps {
  data: ComparisonResponse;
  showBothModels?: boolean;
  activeModel?: "winner" | "alternative";
}

export type ComparisonChartHandle = ChartHandle;

const CHART_COLORS = {
  historical: "#64748B",
  winner: "#00F0FF",
  alternative: "#8A2BE2",
  band: "rgba(0,240,255,0.08)",
  holdout: "rgba(255,255,255,0.03)",
  grid: "#1E293B",
  axisLabel: "#64748B",
};

export const ComparisonChart = forwardRef<ComparisonChartHandle, ComparisonChartProps>(
  function ComparisonChart(
    { data, showBothModels = false, activeModel = "winner" },
    ref,
  ) {
  const chartRef = useRef<ReactECharts>(null);
  const { export: exportChart } = useChartExport(chartRef, {
    filename: "comparison-chart",
  });

  useImperativeHandle(ref, () => ({
    getPng: (opts) => getChartPng(chartRef, opts),
  }));

  const { winner, alternative, dates, historical_dates, historical_values } = data;

  const primary = activeModel === "winner" ? winner : alternative;
  const overlay = activeModel === "winner" ? alternative : winner;

  const allDates = [...historical_dates, ...dates];

  const historicalSeries = historical_values.map(
    (v, i) => [historical_dates[i], v] as [string, number],
  );
  const primarySeries = dates.map(
    (d, i) => [d, primary.point_forecast[i]] as [string, number],
  );
  const overlaySeries = dates.map(
    (d, i) => [d, overlay.point_forecast[i]] as [string, number],
  );
  const p10Series = dates.map((d, i) => [d, primary.p10[i]] as [string, number]);
  const p90Series = dates.map((d, i) => [d, primary.p90[i]] as [string, number]);

  const series: object[] = [
    {
      name: "Historical",
      type: "line",
      data: historicalSeries,
      lineStyle: { color: CHART_COLORS.historical, width: 2 },
      itemStyle: { color: CHART_COLORS.historical },
      symbol: "none",
      z: 2,
    },
    {
      name: primary.display_name,
      type: "line",
      data: primarySeries,
      lineStyle: { color: CHART_COLORS.winner, width: 2 },
      itemStyle: { color: CHART_COLORS.winner },
      symbol: "none",
      z: 3,
    },
    {
      name: "P90",
      type: "line",
      data: p90Series,
      lineStyle: { color: "transparent" },
      areaStyle: { color: CHART_COLORS.band, origin: "auto" },
      stack: "confidence",
      symbol: "none",
      z: 1,
    },
    {
      name: "P10",
      type: "line",
      data: p10Series,
      lineStyle: { color: "transparent" },
      areaStyle: { color: "transparent", origin: "auto" },
      stack: "confidence",
      symbol: "none",
      z: 1,
    },
  ];

  if (showBothModels) {
    series.push({
      name: overlay.display_name,
      type: "line",
      data: overlaySeries,
      lineStyle: { color: CHART_COLORS.alternative, width: 1.5, type: "dashed" },
      itemStyle: { color: CHART_COLORS.alternative },
      symbol: "none",
      z: 2,
    });
  }

  const forecastStartPct = allDates.length
    ? Math.max(0, Math.round(((historical_dates.length - Math.min(60, historical_dates.length)) / allDates.length) * 100))
    : 0;

  const option = {
    backgroundColor: "transparent",
    grid: { left: 56, right: 24, top: 24, bottom: 68, containLabel: false },
    xAxis: {
      type: "category",
      data: allDates,
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_COLORS.axisLabel,
        fontFamily: "JetBrains Mono",
        fontSize: 11,
        rotate: 30,
        formatter: (v: string) => v.slice(0, 7),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_COLORS.axisLabel,
        fontFamily: "JetBrains Mono",
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        start: forecastStartPct,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type: "slider",
        xAxisIndex: 0,
        start: forecastStartPct,
        end: 100,
        height: 18,
        bottom: 8,
        borderColor: CHART_COLORS.grid,
        backgroundColor: "transparent",
        fillerColor: "rgba(0,240,255,0.08)",
        handleStyle: { color: "#00F0FF", borderColor: "#00F0FF" },
        moveHandleStyle: { color: "#334155" },
        dataBackground: {
          lineStyle: { color: "#334155", width: 1 },
          areaStyle: { color: "rgba(100,116,139,0.2)" },
        },
        selectedDataBackground: {
          lineStyle: { color: "#00F0FF", width: 1 },
          areaStyle: { color: "rgba(0,240,255,0.15)" },
        },
        textStyle: { color: CHART_COLORS.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
        labelFormatter: (_v: number, s: string) => (s ? s.slice(0, 7) : ""),
      },
      {
        type: "inside",
        yAxisIndex: 0,
        zoomOnMouseWheel: "shift",
        moveOnMouseMove: false,
        moveOnMouseWheel: false,
      },
    ],
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1A1D25",
      borderColor: "#252830",
      textStyle: { color: "#F0F2F5", fontFamily: "JetBrains Mono", fontSize: 12 },
      formatter: (params: { seriesName: string; data: [string, number] }[]) => {
        return params
          .filter((p) => !["P90", "P10"].includes(p.seriesName))
          .map((p) => `${p.seriesName}: ${p.data[1].toLocaleString()}`)
          .join("<br/>");
      },
    },
    legend: showBothModels
      ? {
          data: [primary.display_name, overlay.display_name, "Historical"],
          textStyle: { color: "#8A8F9E", fontFamily: "JetBrains Mono", fontSize: 11 },
          itemWidth: 16,
          itemHeight: 2,
        }
      : { show: false },
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportChartButton onExport={exportChart} />
      </div>
      <ReactECharts
        ref={chartRef}
        option={{ ...option, series }}
        style={{ height: 320, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate={false}
      />
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
        Scroll to zoom X · Shift+scroll to zoom Y · Drag the handles below to pan
      </p>
    </div>
  );
  },
);
