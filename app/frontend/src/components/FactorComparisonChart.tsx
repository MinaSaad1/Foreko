import { useRef } from "react";
import ReactECharts from "echarts-for-react";
import { useChartExport } from "@/hooks/useChartExport";
import { ExportChartButton } from "@/components/common/ExportChartButton";
import { useChartTheme } from "@/charts/theme";
import type { FactorAnalysisResponse } from "@/types/factors";

interface FactorComparisonChartProps {
  data: FactorAnalysisResponse;
  showBaseline?: boolean;
  showBand?: boolean;
}

export function FactorComparisonChart({
  data,
  showBaseline = true,
  showBand = true,
}: FactorComparisonChartProps) {
  const t = useChartTheme();
  const COLORS = {
    history: t.historical,
    baseline: t.neutral,
    factors: t.accent,
    band: t.band,
    grid: t.grid,
    axisLabel: t.axisLabel,
  };
  const chartRef = useRef<ReactECharts>(null);
  const { export: exportChart } = useChartExport(chartRef, {
    filename: "factor-comparison",
  });

  const {
    historical_dates,
    historical_values,
    forecast_dates,
    baseline_forecast,
    factors_forecast,
    factors_p10,
    factors_p90,
  } = data;

  const allDates = [...historical_dates, ...forecast_dates];

  const histSeries = historical_values.map(
    (v, i) => [historical_dates[i], v] as [string, number],
  );
  const factorsSeries = forecast_dates.map(
    (d, i) => [d, factors_forecast[i]] as [string, number],
  );
  const baselineSeries = forecast_dates.map(
    (d, i) => [d, baseline_forecast[i]] as [string, number],
  );
  const p10Series = forecast_dates.map((d, i) => [d, factors_p10[i]] as [string, number]);
  const p90Series = forecast_dates.map((d, i) => [d, factors_p90[i]] as [string, number]);

  const series: object[] = [
    {
      name: "Historical",
      type: "line",
      data: histSeries,
      lineStyle: { color: COLORS.history, width: 2 },
      itemStyle: { color: COLORS.history },
      symbol: "none",
      z: 2,
    },
    {
      name: "With factors",
      type: "line",
      data: factorsSeries,
      lineStyle: { color: COLORS.factors, width: 2 },
      itemStyle: { color: COLORS.factors },
      symbol: "none",
      z: 4,
    },
  ];

  if (showBand) {
    series.push(
      {
        name: "P90",
        type: "line",
        data: p90Series,
        lineStyle: { color: "transparent" },
        areaStyle: { color: COLORS.band, origin: "auto" },
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
    );
  }

  if (showBaseline) {
    series.push({
      name: "Baseline (no factors)",
      type: "line",
      data: baselineSeries,
      lineStyle: { color: COLORS.baseline, width: 1.5, type: "dashed" },
      itemStyle: { color: COLORS.baseline },
      symbol: "none",
      z: 3,
    });
  }

  const startPct = allDates.length
    ? Math.max(
        0,
        Math.round(
          ((historical_dates.length - Math.min(60, historical_dates.length)) /
            allDates.length) *
            100,
        ),
      )
    : 0;

  const option = {
    backgroundColor: "transparent",
    grid: { left: 56, right: 24, top: 24, bottom: 68, containLabel: false },
    xAxis: {
      type: "category",
      data: allDates,
      axisLine: { lineStyle: { color: COLORS.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: COLORS.axisLabel,
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
      axisLabel: { color: COLORS.axisLabel, fontFamily: "JetBrains Mono", fontSize: 11 },
      splitLine: { lineStyle: { color: COLORS.grid } },
    },
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        start: startPct,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type: "slider",
        xAxisIndex: 0,
        start: startPct,
        end: 100,
        height: 18,
        bottom: 8,
        borderColor: COLORS.grid,
        backgroundColor: "transparent",
        fillerColor: t.band,
        handleStyle: { color: t.accent, borderColor: t.accent },
        moveHandleStyle: { color: t.grid },
        dataBackground: {
          lineStyle: { color: t.grid, width: 1 },
          areaStyle: { color: t.holdout },
        },
        selectedDataBackground: {
          lineStyle: { color: t.accent, width: 1 },
          areaStyle: { color: t.accentDim },
        },
        textStyle: { color: COLORS.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
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
      backgroundColor: t.bgElevated,
      borderColor: t.grid,
      textStyle: { color: t.textPrimary, fontFamily: "JetBrains Mono", fontSize: 12 },
      formatter: (params: { seriesName: string; data: [string, number] }[]) => {
        return params
          .filter((p) => !["P90", "P10"].includes(p.seriesName))
          .map((p) => `${p.seriesName}: ${p.data[1].toLocaleString()}`)
          .join("<br/>");
      },
    },
    legend: {
      data: [
        "Historical",
        "With factors",
        ...(showBaseline ? ["Baseline (no factors)"] : []),
      ],
      textStyle: { color: t.textSecondary, fontFamily: "JetBrains Mono", fontSize: 11 },
      itemWidth: 16,
      itemHeight: 2,
      right: 16,
      top: 0,
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportChartButton onExport={exportChart} />
      </div>
      <ReactECharts
        ref={chartRef}
        option={{ ...option, series }}
        style={{ height: 400, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
      />
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
        Scroll to zoom X · Shift+scroll to zoom Y · Drag the handles below to pan
      </p>
    </div>
  );
}
