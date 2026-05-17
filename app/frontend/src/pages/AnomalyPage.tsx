import { useRef } from "react";
import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import { AnomalyChart, type AnomalyChartHandle } from "@/components/AnomalyChart";
import { AnomalyInsights } from "@/components/AnomalyInsights";
import { AnomalyTable } from "@/components/AnomalyTable";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { Term } from "@/components/common/Term";
import { HelpHint } from "@/components/common/HelpHint";
import { DownloadPdfButton, type PdfSection } from "@/components/common/DownloadPdfButton";
import { useDocumentTitle } from "@/utils/useDocumentTitle";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import { useAnomalyOrchestrator } from "@/hooks/useAnomalyOrchestrator";
import type {
  AnomalyResponse,
  AnomalySummary,
  ContextAnomalyRecord,
  SeriesAnomalyResult,
} from "@/types/anomaly";

function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className={`border px-4 py-2 text-center ${color}`}>
      <div className="font-mono text-xl font-medium">{count}</div>
      <div className="text-xs text-text-muted uppercase tracking-widest">{label}</div>
    </div>
  );
}

function buildSummary(data: AnomalyResponse): AnomalySummary {
  return data.results.reduce(
    (acc, r) => ({
      total: acc.total + r.context_summary.total,
      critical: acc.critical + r.context_summary.critical,
      warning: acc.warning + r.context_summary.warning,
      normal: acc.normal + r.context_summary.normal,
    }),
    { total: 0, critical: 0, warning: 0, normal: 0 },
  );
}

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toFixed(2);
}

function monthOf(dateStr: string): string {
  return dateStr.length >= 7 ? dateStr.slice(0, 7) : dateStr;
}

function buildAnomalyReport(
  series: SeriesAnomalyResult,
  summary: AnomalySummary,
  ctx: { horizon: number; datasetName?: string; rowCount?: number; chartPng: string | null },
): PdfSection[] {
  const records = series.context_records;
  const anomalies = records.filter((r) => r.severity === "CRITICAL");
  const warnings = records.filter((r) => r.severity === "WARNING");
  const flagged: ContextAnomalyRecord[] = [...anomalies, ...warnings];

  const anomalyRate = summary.total > 0 ? (summary.critical / summary.total) * 100 : 0;
  const warningRate = summary.total > 0 ? (summary.warning / summary.total) * 100 : 0;

  const worst = flagged.length
    ? flagged.reduce((best, r) => (Math.abs(r.z_score) > Math.abs(best.z_score) ? r : best))
    : null;
  const latest = flagged.length
    ? flagged.reduce((best, r) => (r.date > best.date ? r : best))
    : null;

  const avgAnomalyValue = anomalies.length
    ? anomalies.reduce((s, r) => s + r.value, 0) / anomalies.length
    : 0;
  const baselineAvg = records.length
    ? records.reduce((s, r) => s + r.value, 0) / records.length
    : 0;
  const deltaPct = baselineAvg > 0 ? ((avgAnomalyValue - baselineAvg) / baselineAvg) * 100 : 0;

  const byMonth = new Map<string, number>();
  for (const r of flagged) {
    const m = monthOf(r.date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const topMonths = [...byMonth.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const sections: PdfSection[] = [];

  sections.push({
    heading: "Executive summary",
    body: summary.critical > 0
      ? `Detected ${summary.critical} critical ${summary.critical === 1 ? "anomaly" : "anomalies"} and ${summary.warning} warnings across ${summary.total} observations (${anomalyRate.toFixed(1)}% critical rate).`
      : summary.warning > 0
        ? `No critical anomalies, but ${summary.warning} warning-level points (${warningRate.toFixed(1)}%) deviate more than 2 sigma from expected.`
        : "All observations fell within normal bounds, no anomalies or warnings detected.",
    kv: [
      ["Anomalies (critical)", summary.critical.toString()],
      ["Warnings", summary.warning.toString()],
      ["Normal observations", summary.normal.toString()],
      ["Critical rate", `${anomalyRate.toFixed(1)}%`],
      ["Warning rate", `${warningRate.toFixed(1)}%`],
      ["Residual std (σ)", series.res_std.toFixed(4)],
      ["Anomaly mean vs baseline", baselineAvg > 0 ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%` : "-"],
      ["Look-ahead horizon", `${ctx.horizon} periods`],
      ["Worst z-score", worst ? worst.z_score.toFixed(2) : "-"],
      ["Worst date", worst ? worst.date : "-"],
      ["Most recent flag", latest ? `${latest.date} (${latest.severity.toLowerCase()})` : "-"],
      ["Observation range", records.length ? `${records[0].date} → ${records[records.length - 1].date}` : "-"],
      ["Dataset", ctx.datasetName ?? "-"],
      ["Historical rows", ctx.rowCount ? ctx.rowCount.toLocaleString() : `${records.length}`],
    ],
  });

  if (ctx.chartPng) {
    sections.push({
      heading: "Time-series with flagged points",
      image_base64: ctx.chartPng,
      caption: "Red = critical anomaly (|z| ≥ 3). Orange = warning (|z| ≥ 2). Dashed line = underlying trend.",
    });
  }

  if (flagged.length > 0) {
    const ranked = [...flagged].sort((a, b) => {
      const sev = (r: ContextAnomalyRecord) => (r.severity === "CRITICAL" ? 1 : 0);
      if (sev(b) !== sev(a)) return sev(b) - sev(a);
      return Math.abs(b.z_score) - Math.abs(a.z_score);
    });
    const rowLimit = Math.min(20, ranked.length);
    const rows: (string | number)[][] = [];
    for (let i = 0; i < rowLimit; i++) {
      const r = ranked[i];
      const vsBaseline = baselineAvg > 0 ? ((r.value - baselineAvg) / baselineAvg) * 100 : 0;
      rows.push([
        i + 1,
        r.date,
        r.severity,
        formatValue(r.value),
        r.z_score.toFixed(2),
        `${vsBaseline >= 0 ? "+" : ""}${vsBaseline.toFixed(1)}%`,
      ]);
    }
    sections.push({
      heading: `Flagged observations${ranked.length > rowLimit ? ` (top ${rowLimit} of ${ranked.length})` : ""}`,
      table: {
        headers: ["Rank", "Date", "Severity", "Value", "Z-score", "vs baseline"],
        rows,
      },
    });
  }

  if (topMonths.length > 0) {
    sections.push({
      heading: "Flag concentration by month",
      body: "Months with the most flagged observations, useful for spotting recurring patterns.",
      table: {
        headers: ["Month", "Flagged count"],
        rows: topMonths.map(([m, n]) => [m, n]),
      },
    });
  }

  const takeaways: string[] = [];
  if (summary.critical === 0 && summary.warning === 0) {
    takeaways.push("Series is stable, no points exceed the 2-sigma warning threshold, so forecasts can be trusted without scrubbing.");
  } else {
    if (summary.critical > 0) {
      takeaways.push(
        `Investigate the ${summary.critical} critical ${summary.critical === 1 ? "point" : "points"} first (|z| ≥ 3 means a <0.3% chance under the residual distribution).`,
      );
    }
    if (worst) {
      const direction = worst.value > worst.trend ? "above" : "below";
      takeaways.push(
        `The sharpest outlier is ${worst.date} (value ${formatValue(worst.value)}, z=${worst.z_score.toFixed(2)}, ${direction} the trend of ${formatValue(worst.trend)}).`,
      );
    }
    if (topMonths.length && topMonths[0][1] >= 2) {
      takeaways.push(
        `${topMonths[0][0]} has the most flags (${topMonths[0][1]}), check whether a known event or recurring pattern explains the clustering.`,
      );
    }
    if (summary.warning > summary.critical * 3 && summary.critical > 0) {
      takeaways.push("Warnings outnumber criticals by ~3×, consider tightening the warning threshold if this series is noisy by nature.");
    }
  }

  sections.push({
    heading: "Takeaways",
    body: takeaways.map((t, i) => `${i + 1}. ${t}`).join("\n"),
  });

  return sections;
}

export function AnomalyPage() {
  useDocumentTitle("Anomalies");
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";
  const chartHandleRef = useRef<AnomalyChartHandle | null>(null);

  const { mapping, handleMappingChange, horizon, setHorizon, data, isPending, isError, error, mutate, reset } =
    useAnomalyOrchestrator(activeId);

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Anomaly Detection"
        pageKey="anomaly"
        basePath="/anomaly"
      />
    );
  }

  const result = data;
  const seriesResult = result?.results[0];
  const summary = result ? buildSummary(result) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">
          Anomaly Detection
        </h1>
        {preview && (
          <p className="mt-1 text-sm text-text-muted font-mono">
            {preview.filename} · {preview.row_count.toLocaleString()} rows
          </p>
        )}
      </div>

      <PageIntro pageKey="anomaly" />

      {summary && seriesResult && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <SummaryPill count={summary.critical} label="Anomalies" color="border-anomaly/20 bg-anomaly/10 text-anomaly" />
            <SummaryPill count={summary.warning} label="Warnings" color="border-warning/20 bg-warning/10 text-warning" />
            <SummaryPill count={summary.normal} label="Normal" color="border-positive/20 bg-positive/10 text-positive" />
          </div>
          <DownloadPdfButton
            title="Foreko, Anomaly report"
            filename="foreko-anomalies.pdf"
            sections={() => buildAnomalyReport(seriesResult, summary, {
              horizon,
              datasetName: preview?.filename,
              rowCount: preview?.row_count,
              chartPng: chartHandleRef.current?.getPng({ backgroundColor: "#ffffff", pixelRatio: 3 }) ?? null,
            })}
          />
        </div>
      )}

      {seriesResult && <AnomalyInsights records={seriesResult.context_records} />}

      {seriesResult && (
        <div className="rounded-panel border border-border bg-bg-surface p-5">
          <h2 className="mb-4 flex items-center font-display text-sm font-medium text-text-secondary uppercase tracking-widest">
            Unusual activity in your data <HelpHint termKey="z-score" />
          </h2>
          <AnomalyChart ref={chartHandleRef} records={seriesResult.context_records} />
          <p className="mt-3 text-xs text-text-muted">
            Red pulsing dots = <Term k="severity">anomalies</Term> (outside 3-sigma).
            Orange dots = warnings (2-sigma). The dashed line is the underlying{" "}
            <Term k="trend">trend</Term>.
          </p>
        </div>
      )}

      {seriesResult && preview && (
        <AnomalyTable records={seriesResult.context_records} filename={preview.filename} />
      )}

      {preview && !result && (
        <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
          <h2 className="font-display text-base font-medium text-text-primary">
            Configure detection
          </h2>

          <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />

          <div>
            <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
              Look-ahead periods
            </label>
            <input
              type="number"
              min={1}
              max={256}
              value={horizon}
              onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
              className="w-32 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
            />
          </div>

          {isError && (
            <p className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {error?.message}
            </p>
          )}

          <button
            onClick={() => mutate()}
            disabled={!mapping || isPending || !modelReady}
            className="w-full btn-terminal-primary"
          >
            {isPending ? "Detecting..." : "Detect Anomalies"}
          </button>
          {!modelReady && (
            <p className="text-xs text-text-muted text-center">Model still loading, the Run button will enable when it's ready.</p>
          )}
        </div>
      )}

      {result && (
        <button
          onClick={() => reset()}
          className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
        >
          ← Change settings
        </button>
      )}
    </div>
  );
}
