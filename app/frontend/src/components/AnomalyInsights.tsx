import { useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { useChartExport } from "@/hooks/useChartExport";
import { ExportChartButton } from "@/components/common/ExportChartButton";
import { useChartTheme } from "@/charts/theme";
import type { ContextAnomalyRecord } from "@/types/anomaly";

interface AnomalyInsightsProps {
  records: ContextAnomalyRecord[];
}

interface Highlight {
  label: string;
  date: string;
  value: number;
  deviation: number;
  direction: "up" | "down" | "neutral";
  tone: "critical" | "warning" | "muted";
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function daysAgo(iso: string, today: Date): number {
  const d = new Date(iso);
  const diffMs = today.getTime() - d.getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

function relativeDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n} days ago`;
  if (n < 365) return `${Math.round(n / 30)} months ago`;
  return `${Math.round(n / 365)} years ago`;
}

export function AnomalyInsights({ records }: AnomalyInsightsProps) {
  const highlights = useMemo<Highlight[]>(() => {
    if (records.length === 0) return [];

    const criticals = records.filter((r) => r.severity === "CRITICAL");
    const warnings = records.filter((r) => r.severity === "WARNING");
    const anomalies = [...criticals, ...warnings];

    if (anomalies.length === 0) return [];

    // Compute deviation for each anomaly: % difference from trend (expected)
    const withDev = anomalies.map((r) => {
      const expected = r.trend || 0;
      const deviation = expected !== 0 ? ((r.value - expected) / Math.abs(expected)) * 100 : 0;
      return { ...r, deviation };
    });

    const sortedByDev = [...withDev].sort((a, b) => b.deviation - a.deviation);
    const biggestSpike = sortedByDev[0];
    const biggestDrop = sortedByDev[sortedByDev.length - 1];

    // Most recent by date
    const today = new Date();
    const sortedByDate = [...withDev].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const mostRecent = sortedByDate[0];

    const out: Highlight[] = [];

    if (biggestSpike && biggestSpike.deviation > 0) {
      out.push({
        label: "Largest spike",
        date: biggestSpike.date,
        value: biggestSpike.value,
        deviation: biggestSpike.deviation,
        direction: "up",
        tone: biggestSpike.severity === "CRITICAL" ? "critical" : "warning",
      });
    }

    if (biggestDrop && biggestDrop !== biggestSpike && biggestDrop.deviation < 0) {
      out.push({
        label: "Largest drop",
        date: biggestDrop.date,
        value: biggestDrop.value,
        deviation: biggestDrop.deviation,
        direction: "down",
        tone: biggestDrop.severity === "CRITICAL" ? "critical" : "warning",
      });
    }

    if (mostRecent) {
      const n = daysAgo(mostRecent.date, today);
      out.push({
        label: `Most recent · ${relativeDays(n)}`,
        date: mostRecent.date,
        value: mostRecent.value,
        deviation: mostRecent.deviation,
        direction: mostRecent.deviation > 0 ? "up" : mostRecent.deviation < 0 ? "down" : "neutral",
        tone: mostRecent.severity === "CRITICAL" ? "critical" : "warning",
      });
    }

    return out;
  }, [records]);

  // Monthly distribution of critical+warning anomalies
  const monthlyDist = useMemo(() => {
    const buckets = new Map<string, number>();
    records.forEach((r) => {
      if (r.severity === "NORMAL") return;
      const ym = r.date.slice(0, 7); // YYYY-MM
      buckets.set(ym, (buckets.get(ym) ?? 0) + 1);
    });
    const entries = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [records]);

  if (highlights.length === 0) {
    return (
      <div className="rounded-panel border border-border bg-bg-surface px-5 py-4 text-sm text-text-secondary">
        No anomalies or warnings detected in this series.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Highlight tiles */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {highlights.map((h, i) => (
          <HighlightTile key={`${h.label}-${i}`} h={h} />
        ))}
      </div>

      {/* Monthly distribution */}
      {monthlyDist.length > 1 && (
        <div className="rounded-panel border border-border bg-bg-surface p-5">
          <h3 className="mb-3 font-display text-xs font-medium uppercase tracking-widest text-text-muted">
            Anomalies by month
          </h3>
          <MonthlyDistributionChart data={monthlyDist} />
        </div>
      )}
    </div>
  );
}

function HighlightTile({ h }: { h: Highlight }) {
  const toneClass =
    h.tone === "critical"
      ? "border-anomaly/30 bg-anomaly/5"
      : h.tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : "border-border bg-bg-surface";

  const arrow = h.direction === "up" ? "▲" : h.direction === "down" ? "▼" : "·";
  const devText =
    h.direction === "up"
      ? `+${h.deviation.toFixed(0)}% vs expected`
      : h.direction === "down"
        ? `${h.deviation.toFixed(0)}% vs expected`
        : `${h.deviation.toFixed(0)}% vs expected`;
  const arrowColor =
    h.direction === "up" ? "text-anomaly" : h.direction === "down" ? "text-neutral" : "text-text-muted";

  return (
    <div className={`rounded-panel border border-l-2 border-l-accent-2 px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-xs uppercase tracking-widest text-accent-2">
        {h.label}
      </p>
      <p className="mt-1 font-mono text-sm text-text-primary">{h.date}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-2xl font-medium ${arrowColor}`}>{arrow}</span>
        <span className="font-display text-2xl font-medium text-text-primary">
          {formatNumber(h.value)}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-text-secondary">{devText}</p>
    </div>
  );
}

function MonthlyDistributionChart({ data }: { data: [string, number][] }) {
  const t = useChartTheme();
  const chartRef = useRef<ReactECharts>(null);
  const { export: exportChart } = useChartExport(chartRef, {
    filename: "anomaly-distribution",
  });

  const option = {
    backgroundColor: "transparent",
    grid: { left: 36, right: 8, top: 8, bottom: 32, containLabel: false },
    xAxis: {
      type: "category",
      data: data.map((d) => d[0]),
      axisLine: { lineStyle: { color: t.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: t.axisLabel,
        fontFamily: "JetBrains Mono",
        fontSize: 10,
        rotate: 30,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
      splitLine: { lineStyle: { color: t.grid } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.bgElevated,
      borderColor: t.grid,
      textStyle: { color: t.textPrimary, fontFamily: "JetBrains Mono", fontSize: 11 },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        return `${p.name}<br/>${p.value} anomal${p.value === 1 ? "y" : "ies"}`;
      },
    },
    series: [
      {
        type: "bar",
        data: data.map((d) => d[1]),
        itemStyle: { color: t.anomaly, opacity: 0.55, borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 18,
      },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportChartButton onExport={exportChart} className="-mt-8" />
      </div>
      <ReactECharts ref={chartRef} option={option} style={{ height: 120, width: "100%" }} notMerge />
    </div>
  );
}
