import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useBacktestStore } from "@/stores/backtestStore";
import { ColumnMapper } from "@/components/ColumnMapper";
import { WinnerCard } from "@/components/WinnerCard";
import { AlternativeCard } from "@/components/AlternativeCard";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { HelpHint } from "@/components/common/HelpHint";
import { Term } from "@/components/common/Term";
import { DownloadPdfButton, type PdfSection } from "@/components/common/DownloadPdfButton";
import {
  LeftRail,
  PageHeader,
  RailChoiceGrid,
  RailResetButton,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
import { useDocumentTitle } from "@/utils/useDocumentTitle";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import { useComparisonOrchestrator } from "@/hooks/useComparisonOrchestrator";
import type { ComparisonResponse } from "@/types/comparison";
import type { ComparisonChartHandle } from "@/components/ComparisonChart";
import type { BacktestSummary } from "@/stores/backtestStore";

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

  if (base.winner.name === backtestWinnerName) {
    return {
      data: base,
      source: "backtest",
      note: `Confirmed by walk-forward backtest across ${backtest.folds} folds at horizon ${backtest.horizon}.`,
    };
  }

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

  return sections;
}

interface ForecastLeftRailProps {
  preview: { filename: string; row_count: number } | undefined;
  horizon: number;
  setHorizon: (h: number) => void;
  result: ComparisonResponse | null;
  isRunning: boolean;
  onReset: () => void;
}

function ForecastLeftRail({ preview, horizon, setHorizon, result, isRunning, onReset }: ForecastLeftRailProps) {
  const horizonLocked = !!result || isRunning;
  return (
    <LeftRail ariaLabel="Forecast configuration">
      <RailSection label="Dataset">
        {preview ? (
          <>
            <RailRow k="File" v={preview.filename} />
            <RailRow k="Rows" v={preview.row_count.toLocaleString()} />
          </>
        ) : (
          <p className="font-mono text-[10px] text-text-faint">Loading…</p>
        )}
      </RailSection>

      <RailSection label="Horizon">
        <RailChoiceGrid
          options={HORIZON_OPTIONS}
          value={horizon}
          onChange={setHorizon}
          disabled={horizonLocked}
          disabledTitle="Use ← Change settings to adjust"
        />
      </RailSection>

      <RailSection label="Models">
        <RailRow k="Primary" v="TimesFM 2.5" tone="accent" />
        <RailRow k="Challenger" v="LightGBM" />
      </RailSection>

      {result && <RailResetButton onClick={onReset} />}
    </LeftRail>
  );
}

interface NextStepsRailItem {
  to: string;
  eyebrow: string;
  title: string;
}

function NextStepsCompact({ datasetId }: { datasetId: string }) {
  const items: NextStepsRailItem[] = [
    { to: `/backtest/${datasetId}`, eyebrow: "Validate", title: "Backtest" },
    { to: `/anomaly/${datasetId}`, eyebrow: "Investigate", title: "Anomalies" },
    { to: `/explain/${datasetId}`, eyebrow: "Understand", title: "Explain" },
  ];
  return (
    <div className="border border-border-strong/70 divide-y divide-border-strong/70">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="group flex items-center justify-between px-3 py-3 hover:bg-accent/10 transition-colors"
        >
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">{it.eyebrow}</p>
            <p className="mt-0.5 font-display text-sm text-text-primary group-hover:text-accent transition-colors">{it.title}</p>
          </div>
          <span className="font-mono text-text-muted group-hover:text-accent transition-colors">→</span>
        </Link>
      ))}
    </div>
  );
}

interface ForecastRightRailProps {
  result: ComparisonResponse | null;
  datasetId: string;
  horizon: number;
}

function ForecastRightRail({ result, datasetId, horizon }: ForecastRightRailProps) {
  return (
    <RightRail ariaLabel="Forecast insights">
      {!result && (
        <WhatYoullGet
          summary="A calibrated point forecast plus a P10/P90 uncertainty band, the recommended model with its confidence rating, and an alternative for comparison."
          reading={[
            "Cyan band = uncertainty; wider = less certain.",
            "Recommended model is opinionated. Flip to the alternative inline.",
            "Defend the forecast by following the next-step links after running.",
          ]}
        />
      )}

      {result && (
        <>
          <RailSection label="Backtest metrics">
            <RailRow k="Winner" v={result.winner.display_name} tone="accent" />
            <RailRow k="Accuracy" v={formatPct(result.winner.accuracy)} tone="ok" />
            <RailRow k="MAPE" v={formatPct(result.winner.mape)} />
            <RailRow
              k="Confidence"
              v={result.winner.confidence}
              tone={result.winner.confidence === "High" ? "ok" : result.winner.confidence === "Low" ? "warn" : undefined}
            />
            <RailRow k="Horizon" v={`${horizon} periods`} />
          </RailSection>

          <RailSection label="Alternative">
            <RailRow k="Model" v={result.alternative.display_name} />
            <RailRow k="Accuracy" v={formatPct(result.alternative.accuracy)} />
            <RailRow k="MAPE" v={formatPct(result.alternative.mape)} tone="muted" />
          </RailSection>

          <RailSection label="Next steps">
            <NextStepsCompact datasetId={datasetId} />
          </RailSection>
        </>
      )}
    </RightRail>
  );
}

export function ComparisonPage() {
  useDocumentTitle("Forecast");
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";
  const backtestSummary = useBacktestStore((s) =>
    activeId ? s.results[activeId] : undefined,
  );
  const chartHandleRef = useRef<ComparisonChartHandle | null>(null);

  const {
    mapping,
    handleMappingChange,
    horizon,
    setHorizon,
    result,
    isRunning,
    isError,
    error,
    startComparison,
    reset,
  } = useComparisonOrchestrator(activeId);

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Forecast"
        pageKey="compare"
        basePath="/compare"
      />
    );
  }

  const resolved = result ? resolveRecommendation(result, backtestSummary) : null;
  const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Forecast";

  return (
    <ThreeRailLayout
      left={
        <ForecastLeftRail
          preview={preview}
          horizon={horizon}
          setHorizon={setHorizon}
          result={resolved?.data ?? null}
          isRunning={isRunning}
          onReset={reset}
        />
      }
      right={
        <ForecastRightRail
          result={resolved?.data ?? null}
          datasetId={activeId}
          horizon={horizon}
        />
      }
    >
      <PageHeader
        kicker="Forecast"
        title={displayName}
        subtitle={preview ? `${preview.row_count.toLocaleString()} rows · horizon ${horizon}` : undefined}
        actions={
          resolved && (
            <DownloadPdfButton
              title="Foreko, Forecast report"
              filename="foreko-forecast.pdf"
              sections={() => buildForecastReport(resolved.data, {
                horizon,
                datasetName: preview?.filename,
                rowCount: preview?.row_count,
                chartPng: chartHandleRef.current?.getPng({ backgroundColor: "#ffffff", pixelRatio: 3 }) ?? null,
              })}
            />
          )
        }
      />

      <div className="lg:hidden">
        <PageIntro pageKey="compare" />
      </div>

      {preview && !resolved && !isRunning && (
        <div className="border border-border-strong/70 bg-bg-surface px-6 py-6 space-y-5 shadow-[var(--shadow-elev-1)]">
          <div className="flex items-center gap-2">
            <span className="text-accent leading-none" aria-hidden>▣</span>
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
              Set up your forecast
            </h2>
          </div>

          <ColumnMapper
            preview={preview}
            value={mapping}
            onChange={handleMappingChange}
          />

          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            <span>Horizon (<Term k="horizon">horizon</Term>)</span>
            <HelpHint termKey="horizon" />
            <span className="text-text-faint">|</span>
            <span className="text-accent">{horizon} periods</span>
            <span className="text-text-faint">·</span>
            <span className="text-text-faint">change in the left rail</span>
          </div>

          {isError && (
            <p className="border border-anomaly/40 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {error instanceof Error
                ? error.message
                : "Comparison failed. Check that the model is loaded."}
            </p>
          )}

          <button
            onClick={() => startComparison()}
            disabled={!mapping || isRunning || !modelReady}
            className="w-full btn-terminal-primary"
          >
            {isRunning ? "Running comparison..." : "Run Forecast Comparison"}
          </button>

          {!modelReady && (
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted text-center">
              Model still loading; the Run button enables when it's ready.
            </p>
          )}
        </div>
      )}

      {isRunning && (
        <div className="border border-accent/40 bg-bg-surface px-6 py-12 text-center space-y-4 shadow-[var(--shadow-elev-1)]">
          <div className="mx-auto h-8 w-8 border-2 border-border/60 border-t-accent rounded-full animate-spin" />
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            Running comparison…
          </p>
          <p className="text-[13px] text-text-secondary max-w-[48ch] mx-auto leading-relaxed">
            Training and comparing both models on your data. This takes 10-30 seconds.
          </p>
        </div>
      )}

      {resolved && (
        <>
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
        </>
      )}
    </ThreeRailLayout>
  );
}
