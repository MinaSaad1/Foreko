import { forwardRef, useImperativeHandle, useRef } from"react";
import ReactECharts from"echarts-for-react";
import { useChartExport, getChartPng, type ChartHandle } from"@/hooks/useChartExport";
import { ExportChartButton } from"@/components/common/ExportChartButton";
import { useChartTheme } from"@/charts/theme";
import type { ContextAnomalyRecord } from"@/types/anomaly";

interface AnomalyChartProps {
  records: ContextAnomalyRecord[];
}

export type AnomalyChartHandle = ChartHandle;

export const AnomalyChart = forwardRef<AnomalyChartHandle, AnomalyChartProps>(
  function AnomalyChart({ records }, ref) {
  const theme = useChartTheme();
  const COLORS = {
    normal: theme.accent,
    warning: theme.warning,
    critical: theme.anomaly,
    trend: theme.trend,
    grid: theme.grid,
    axisLabel: theme.axisLabel,
  };
  const chartRef = useRef<ReactECharts>(null);
  const { export: exportChart } = useChartExport(chartRef, {
    filename:"anomaly-chart",
  });

  useImperativeHandle(ref, () => ({
    getPng: (opts) => getChartPng(chartRef, opts),
  }));

  const dates = records.map((r) => r.date);
  const values = records.map((r) => r.value);
  const trend = records.map((r) => r.trend);

  const criticalPoints = records
    .filter((r) => r.severity ==="CRITICAL")
    .map((r) => [dates.indexOf(r.date), r.value]);
  const warningPoints = records
    .filter((r) => r.severity ==="WARNING")
    .map((r) => [dates.indexOf(r.date), r.value]);

  const option = {
    backgroundColor:"transparent",
    grid: { left: 56, right: 24, top: 24, bottom: 68, containLabel: false },
    dataZoom: [
      {
        type:"inside",
        xAxisIndex: 0,
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type:"slider",
        xAxisIndex: 0,
        start: 0,
        end: 100,
        height: 18,
        bottom: 8,
        borderColor: COLORS.grid,
        backgroundColor:"transparent",
        fillerColor: theme.band,
        handleStyle: { color: theme.accent, borderColor: theme.accent },
        moveHandleStyle: { color: theme.grid },
        dataBackground: {
          lineStyle: { color: theme.grid, width: 1 },
          areaStyle: { color: theme.holdout },
        },
        selectedDataBackground: {
          lineStyle: { color: theme.accent, width: 1 },
          areaStyle: { color: theme.accentDim },
        },
        textStyle: { color: COLORS.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
        labelFormatter: (_v: number, s: string) => (s ? s.slice(0, 7) :""),
      },
      {
        type:"inside",
        yAxisIndex: 0,
        zoomOnMouseWheel:"shift",
        moveOnMouseMove: false,
        moveOnMouseWheel: false,
      },
    ],
    xAxis: {
      type:"category",
      data: dates,
      axisLine: { lineStyle: { color: COLORS.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: COLORS.axisLabel,
        fontFamily:"JetBrains Mono",
        fontSize: 11,
        rotate: 30,
        formatter: (v: string) => v.slice(0, 7),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type:"value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: COLORS.axisLabel, fontFamily:"JetBrains Mono", fontSize: 11 },
      splitLine: { lineStyle: { color: COLORS.grid } },
    },
    tooltip: {
      trigger:"axis",
      backgroundColor: theme.bgElevated,
      borderColor: theme.grid,
      textStyle: { color: theme.textPrimary, fontFamily:"JetBrains Mono", fontSize: 12 },
      formatter: (params: { name: string; data: unknown; seriesName: string }[]) => {
        const main = params.find((p) => p.seriesName ==="Value");
        if (!main) return"";
        const rec = records.find((r) => r.date === main.name);
        if (!rec) return `${main.name}`;
        const badge =
          rec.severity ==="CRITICAL"
            ? ` · <span style='color:${theme.anomaly}'>ANOMALY</span>`
            : rec.severity ==="WARNING"
              ? ` · <span style='color:${theme.warning}'>WARNING</span>`
              :"";
        return `${main.name}${badge}<br/>Value: ${rec.value.toLocaleString()}<br/>Z-score: ${rec.z_score.toFixed(2)}`;
      },
    },
    series: [
      {
        name:"Trend",
        type:"line",
        data: trend,
        lineStyle: { color: COLORS.trend, width: 1, type:"dashed" },
        symbol:"none",
        z: 1,
      },
      {
        name:"Value",
        type:"line",
        data: values,
        lineStyle: { color: COLORS.normal, width: 2 },
        itemStyle: { color: COLORS.normal },
        symbol:"none",
        z: 2,
      },
      ...(warningPoints.length > 0
        ? [
            {
              name:"Warning",
              type:"scatter",
              data: warningPoints,
              symbolSize: 10,
              itemStyle: { color: COLORS.warning },
              z: 4,
            },
          ]
        : []),
      ...(criticalPoints.length > 0
        ? [
            {
              name:"Anomaly",
              type:"effectScatter",
              data: criticalPoints,
              symbolSize: 12,
              itemStyle: { color: COLORS.critical },
              rippleEffect: { brushType:"stroke", scale: 3, period: 2 },
              showEffectOn:"render",
              z: 5,
            },
          ]
        : []),
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportChartButton onExport={exportChart} />
      </div>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: 340, width:"100%" }}
        opts={{ renderer:"canvas" }}
        notMerge
      />
      <p className="px-1 font-mono text-xs uppercase tracking-widest text-text-muted">
        Scroll to zoom X · Shift+scroll to zoom Y · Drag the handles below to pan
      </p>
    </div>
  );
  },
);
