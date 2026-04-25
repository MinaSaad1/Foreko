import { useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { useBacktestStore } from "@/stores/backtestStore";
import { ColumnMapper } from "@/components/ColumnMapper";
import { WinnerCard } from "@/components/WinnerCard";
import { AlternativeCard } from "@/components/AlternativeCard";
import { NextStepsCallout } from "@/components/NextStepsCallout";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { HelpHint } from "@/components/common/HelpHint";
import { Term } from "@/components/common/Term";
import { DownloadPdfButton, type PdfSection } from "@/components/common/DownloadPdfButton";
import { useDocumentTitle } from "@/utils/useDocumentTitle";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import type { ColumnMapping } from "@/types/dataset";
import type { ComparisonResponse } from "@/types/comparison";
import type { ComparisonChartHandle } from "@/components/ComparisonChart";
import type { BacktestSummary } from "@/stores/backtestStore";

// Comparison response uses ModelName ("global_model" | "your_model"),
// the backtest stores a model id ("timesfm" | "lightgbm" | ...). This
// maps backtest ids onto comparison-card model names so we can decide
// whether the backtest winner should override the holdout winner.
const BACKTEST_TO_COMPARISON_NAME: Record<string, "global_model" | "your_model"> = {
  timesfm: "global_model",
  lightgbm: "your_model",
};

interface ResolvedRecommendation {
  data: ComparisonResponse;
  source: "holdout" | "backtest";
  note?: string;
}

function resolveRecommendation(
  base: ComparisonResponse,
  backtest: BacktestSummary | undefined,
): ResolvedRecommendation {
  if (!backtest) return { data: base, source: "holdout" };

  const backtestWinnerName = BACKTEST_TO_COMPARISON_NAME[backtest.winner];
  if (!backtestWinnerName) return { data: base, source: "holdout" };

  // Already in agreement, just upgrade the source label so the user knows
  // it's been confirmed by walk-forward backtest.
  if (base.winner.name === backtestWinnerName) {
    return {
      data: base,
      source: "backtest",
      note:
        `Confirmed by walk-forward backtest across ${backtest.folds} folds at horizon ${backtest.horizon}.`,
    };
  }

  // Disagreement, swap winner and alternative so the recommended model
  // matches the more reliable multi-fold result.
  if (base.alternative.name === backtestWinnerName) {
    return {
      data: { ...base, winner: base.alternative, alternative: base.winner },
      source: "backtest",
      note:
        `${base.alternative.display_name} won the walk-forward backtest across ${backtest.folds} folds at horizon ${backtest.horizon}, ` +
        `even though ${base.winner.display_name} fit the most recent window better. The multi-fold result is the more reliable signal.`,
    };
  }

  return { data: base, source: "holdout" };
}

const HORIZON_OPTIONS = [
  { value: 4, label: "4 periods" },
  { value: 8, label: "8 periods" },
  { value: 12, label: "12 periods" },
  { value: 24, label: "24 periods" },
  { value: 52, label: "52 periods" },
];

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function buildForecastReport(
  result: ComparisonResponse,
  ctx: { horizon: number; datasetName?: string; rowCount?: number; chartPng: string | null },
): PdfSection[] {
  const { winner, alternative, dates, historical_values, historical_dates, backtest_holdout } = result;

  const lift = alternative.mape > 0
    ? ((alternative.mape - winner.mape) / alternative.mape) * 100
    : 0;

  const last = historical_values[historical_values.length - 1] ?? 0;
  const firstForecast = winner.point_forecast[0] ?? 0;
  const lastForecast = winner.point_forecast[winner.point_forecast.length - 1] ?? 0;
  const deltaVsLast = last > 0 ? ((firstForecast - last) / last) * 100 : 0;
  const trendPct = firstForecast > 0 ? ((lastForecast - firstForecast) / firstForecast) * 100 : 0;

  const sections: PdfSection[] = [];

  sections.push({
    heading: "Executive summary",
    body:
      `${winner.display_name} is the recommended forecast, with ${formatPct(winner.accuracy)} accuracy ` +
      `on the ${backtest_holdout}-period holdout. ${result.winner_explanation ?? ""}`.trim(),
    kv: [
      ["Recommended model", winner.display_name],
      ["Confidence", winner.confidence],
      ["Forecast horizon", `${ctx.horizon} periods`],
      ["Expected total", formatNumber(winner.total_forecast)],
      ["Winner accuracy", formatPct(winner.accuracy)],
      ["Winner error (MAPE)", formatPct(winner.mape)],
      ["Alternative", `${alternative.display_name} · ${formatPct(alternative.accuracy)}`],
      ["Accuracy lift vs alternative", lift >= 0 ? `+${lift.toFixed(1)}%` : `${lift.toFixed(1)}%`],
      ["First-period change vs last actual", `${deltaVsLast >= 0 ? "+" : ""}${deltaVsLast.toFixed(1)}%`],
      ["Trend across horizon", `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`],
      ["Historical rows", ctx.rowCount ? ctx.rowCount.toLocaleString() : `${historical_values.length}`],
      ["Dataset", ctx.datasetName ?? "-"],
      ["Holdout size", `${backtest_holdout} periods`],
      ["Forecast range", dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "-"],
      ["Historical range", historical_dates.length
        ? `${historical_dates[0]} → ${historical_dates[historical_dates.length - 1]}`
        : "-"],
    ],
  });

  if (ctx.chartPng) {
    sections.push({
      heading: "Forecast vs. history",
      image_base64: ctx.chartPng,
      caption:
        `Historical ${historical_dates.length ? `${historical_dates[0]} → ${historical_dates[historical_dates.length - 1]}` : ""}` +
        ` · Forecast ${dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : ""}`,
    });
  }

  sections.push({
    heading: "Model comparison",
    body: `Both models were trained on the same history and evaluated on a ${backtest_holdout}-period holdout.`,
    table: {
      headers: ["Metric", winner.display_name, alternative.display_name, "Delta"],
      rows: [
        [
          "Accuracy",
          formatPct(winner.accuracy),
          formatPct(alternative.accuracy),
          `${((winner.accuracy - alternative.accuracy) * 100).toFixed(1) } pp`,
        ],
        [
          "MAPE (lower is better)",
          formatPct(winner.mape),
          formatPct(alternative.mape),
          `${((winner.mape - alternative.mape) * 100).toFixed(1) } pp`,
        ],
        [
          "Confidence",
          winner.confidence,
          alternative.confidence,
          winner.confidence === alternative.confidence ? "-" : "differ",
        ],
        [
          "Expected total",
          formatNumber(winner.total_forecast),
          formatNumber(alternative.total_forecast),
          formatNumber(winner.total_forecast - alternative.total_forecast),
        ],
      ],
    },
  });

  // Point-forecast table (first 12 rows to keep the PDF compact).
  const rowLimit = Math.min(12, dates.length);
  if (rowLimit > 0) {
    const rows: (string | number)[][] = [];
    for (let i = 0; i < rowLimit; i++) {
      rows.push([
        dates[i],
        formatNumber(winner.point_forecast[i]),
        formatNumber(winner.p10[i]),
        formatNumber(winner.p90[i]),
        formatNumber(alternative.point_forecast[i]),
      ]);
    }
    sections.push({
      heading: `Forecast values${dates.length > rowLimit ? ` (first ${rowLimit} of ${dates.length})` : ""}`,
      table: {
        headers: [
          "Date",
          `${winner.display_name} point`,
          "P10 (low)",
          "P90 (high)",
          `${alternative.display_name} point`,
        ],
        rows,
      },
    });
  }

  const fi = winner.feature_importance ?? alternative.feature_importance;
  if (fi && fi.length > 0) {
    const top = [...fi]
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 10);
    sections.push({
      heading: "What drives the forecast",
      body: "Top signals ranked by their contribution to the model.",
      table: {
        headers: ["Rank", "Driver", "Weight"],
        rows: top.map((item, idx) => [
          idx + 1,
          item.category,
          item.weight.toFixed(4),
        ]),
      },
    });
  }

  const takeaways: string[] = [];
  takeaways.push(
    `Use ${winner.display_name} as the primary forecast, it beats ${alternative.display_name} by ${lift.toFixed(1)}% on holdout error.`,
  );
  takeaways.push(
    `Expect roughly ${formatNumber(winner.total_forecast)} total across the next ${ctx.horizon} periods, ` +
    `with the P10–P90 band widening as the horizon grows.`,
  );
  if (Math.abs(trendPct) >= 5) {
    takeaways.push(
      `The winner projects a ${trendPct >= 0 ? "rising" : "declining"} trend of ${Math.abs(trendPct).toFixed(1)}% from the first to the last forecasted period.`,
    );
  }
  if (winner.confidence === "Low" || alternative.confidence === "Low") {
    takeaways.push(
      "One or both models flagged Low confidence, treat the point forecasts as directional and use the P10/P90 band for planning bounds.",
    );
  }

  sections.push({
    heading: "Takeaways",
    body: takeaways.map((t, i) => `${i + 1}. ${t}`).join("\n"),
  });

  return sections;
}

export function ComparisonPage() {
  useDocumentTitle("Forecast");
  const { datasetId } = useParams<{ datasetId?: string }>();
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [horizon, setHorizon] = useState(12);
  const [result, setResult] = useState<ComparisonResponse | null>(null);
  const chartHandleRef = useRef<ComparisonChartHandle | null>(null);

  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";
  const backtestSummary = useBacktestStore((s) =>
    activeId ? s.results[activeId] : undefined,
  );

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const compareMutation = useMutation({
    mutationFn: () =>
      api.runComparison({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
      }),
    onSuccess: (data) => setResult(data),
  });

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Forecast"
        pageKey="compare"
        basePath="/compare"
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Forecast</h1>
        {preview && (
          <p className="mt-1 text-sm text-text-muted font-mono">
            {preview.filename} · {preview.row_count.toLocaleString()} rows
          </p>
        )}
      </div>

      <PageIntro pageKey="compare" />

      {preview && !result && (
        <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-6">
          <h2 className="font-display text-base font-medium text-text-primary">
            Set up your forecast
          </h2>

          <ColumnMapper
            preview={preview}
            value={mapping}
            onChange={handleMappingChange}
          />

          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2 flex items-center">
              How far ahead (<Term k="horizon">horizon</Term>)
              <HelpHint termKey="horizon" />
            </label>
            <div className="flex flex-wrap gap-2">
              {HORIZON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHorizon(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    horizon === opt.value
                      ? "border-accent bg-accent-dim text-accent"
                      : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {compareMutation.isError && (
            <p className="rounded-md border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {compareMutation.error instanceof Error
                ? compareMutation.error.message
                : "Comparison failed. Check that the model is loaded."}
            </p>
          )}

          <button
            onClick={() => compareMutation.mutate()}
            disabled={!mapping || compareMutation.isPending || !modelReady}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {compareMutation.isPending
              ? "Running comparison..."
              : "Run Forecast Comparison"}
          </button>

          {!modelReady && (
            <p className="text-xs text-text-muted text-center">
              Model still loading, the Run button will enable when it's ready.
            </p>
          )}

          {compareMutation.isPending && (
            <p className="text-xs text-text-muted text-center">
              Training and comparing both models on your data. This takes 10-30 seconds.
            </p>
          )}
        </div>
      )}

      {result && (() => {
        const resolved = resolveRecommendation(result, backtestSummary);
        return (
        <div className="space-y-4">
          <div className="flex justify-end">
            <DownloadPdfButton
              title="Foresee, Forecast report"
              filename="foresee-forecast.pdf"
              sections={() => buildForecastReport(resolved.data, {
                horizon,
                datasetName: preview?.filename,
                rowCount: preview?.row_count,
                chartPng: chartHandleRef.current?.getPng({ backgroundColor: "#ffffff", pixelRatio: 3 }) ?? null,
              })}
            />
          </div>
          <WinnerCard
            data={resolved.data}
            chartRef={chartHandleRef}
            recommendationSource={resolved.source}
            recommendationNote={resolved.note}
          />
          <AlternativeCard
            model={resolved.data.alternative}
            winnerAccuracy={resolved.data.winner.accuracy}
          />
          <NextStepsCallout datasetId={activeId} />
          <button
            onClick={() => setResult(null)}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change settings
          </button>
        </div>
        );
      })()}
    </div>
  );
}
