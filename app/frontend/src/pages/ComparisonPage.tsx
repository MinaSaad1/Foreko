import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useBacktestStore } from "@/stores/backtestStore";
import { ColumnMapper } from "@/components/ColumnMapper";
import { WinnerCard } from "@/components/WinnerCard";
import { AlternativeCard } from "@/components/AlternativeCard";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { HelpHint } from "@/components/common/HelpHint";
import { RunError } from "@/components/common/RunError";
import { Term } from "@/components/common/Term";
import { DownloadPdfButton, type PdfSection } from "@/components/common/DownloadPdfButton";
import {
  ChoiceGrid,
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
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

interface NextStepItem {
  to: string;
  title: string;
  description: string;
}

/**
 * Where to go once there is a forecast to defend. These were three stacked mono
 * eyebrows in the right rail; inside a labelled region they only added noise, so
 * the destinations now carry a sentence a user can actually read.
 */
function NextSteps({ datasetId }: { datasetId: string }) {
  const items: NextStepItem[] = [
    {
      to: `/backtest/${datasetId}`,
      title: "Backtest",
      description:
        "Validate the recommendation across several folds instead of one holdout window.",
    },
    {
      to: `/anomaly/${datasetId}`,
      title: "Anomalies",
      description: "Investigate the points in the history that the models had to fit around.",
    },
    {
      to: `/explain/${datasetId}`,
      title: "Explain",
      description: "Understand which factors are associated with the movements in this series.",
    },
  ];
  return (
    <div className="border-t border-border-strong/70">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="group flex items-center justify-between gap-4 border-b border-border-strong/70 px-3 py-3 transition-colors hover:bg-accent/10"
        >
          <div className="min-w-0">
            <p className="font-display text-sm text-text-primary transition-colors group-hover:text-accent">
              {it.title}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">
              {it.description}
            </p>
          </div>
          <span
            aria-hidden
            className="shrink-0 font-mono text-text-muted transition-colors group-hover:text-accent"
          >
            →
          </span>
        </Link>
      ))}
    </div>
  );
}

export function ComparisonPage() {
  // Not "Forecast": that name belongs to Forecast Studio, whose champion comes
  // from rolling validation. This page picks a winner from one holdout, and the
  // two can disagree.
  useDocumentTitle("Model Comparison");
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
        title="Model Comparison"
        pageKey="compare"
        basePath="/compare"
      />
    );
  }

  const resolved = result ? resolveRecommendation(result, backtestSummary) : null;
  const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Model Comparison";

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        kicker="Model Comparison"
        title={displayName}
        intro="A calibrated point forecast plus a P10/P90 uncertainty band, the recommended model with its confidence rating, and an alternative for comparison."
        actions={
          resolved && (
            <DownloadPdfButton
              title="Tempolith, Forecast report"
              filename="tempolith-forecast.pdf"
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

      <FactGrid>
        <Fact label="File" value={preview ? preview.filename : "Loading..."} />
        <Fact label="Rows" value={preview ? preview.row_count.toLocaleString() : "-"} />
        <Fact label="Primary model" value="TimesFM 2.5" />
        <Fact label="Challenger" value="LightGBM" />
      </FactGrid>

      {resolved && (
        <FactGrid>
          <Fact label="Winner" value={resolved.data.winner.display_name} />
          <Fact label="Accuracy" value={formatPct(resolved.data.winner.accuracy)} />
          <Fact label="MAPE" value={formatPct(resolved.data.winner.mape)} />
          <Fact label="Confidence" value={resolved.data.winner.confidence} />
          <Fact label="Horizon" value={`${horizon} periods`} />
          <Fact label="Alternative" value={resolved.data.alternative.display_name} />
          <Fact
            label="Alternative accuracy"
            value={formatPct(resolved.data.alternative.accuracy)}
          />
          <Fact label="Alternative MAPE" value={formatPct(resolved.data.alternative.mape)} />
        </FactGrid>
      )}

      {preview && !resolved && !isRunning && (
        <Section title="Set up your forecast">
          <div className="flex flex-col gap-5">
            <ColumnMapper
              preview={preview}
              value={mapping}
              onChange={handleMappingChange}
            />

            {/* The horizon picker used to live 260px away in a rail that did not
                exist below 1024px, and this block used to apologise for that in
                mono uppercase. It now sits on the run button it configures. */}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-text-primary">
                  Forecast <Term k="horizon">horizon</Term>
                </span>
                <HelpHint termKey="horizon" />
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                How many periods ahead to forecast. Currently {horizon} periods.
              </p>
              <div className="mt-2 max-w-md">
                <ChoiceGrid
                  options={HORIZON_OPTIONS}
                  value={horizon}
                  onChange={setHorizon}
                  columns={3}
                />
              </div>
            </div>

            <button
              onClick={() => startComparison()}
              disabled={!mapping || isRunning || !modelReady}
              className="w-full btn-terminal-primary"
            >
              {isRunning ? "Running comparison..." : "Run Forecast Comparison"}
            </button>

            {!modelReady && (
              <p className="text-[13px] leading-relaxed text-text-secondary">
                Model still loading, the Run button enables when it's ready.
              </p>
            )}
          </div>
        </Section>
      )}

      {isError && (
        <RunError
          error={error ?? "Check that the model is loaded."}
          label="Comparison"
        />
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

          <Section title="Next steps">
            <NextSteps datasetId={activeId} />
          </Section>
        </>
      )}

      <Depth label="Reading the result">
        <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>The cyan band is uncertainty. Wider means less certain.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              The recommended model is opinionated. Flip to the alternative inline.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              Defend the forecast by following the next-step links after running.
            </span>
          </li>
        </ul>
      </Depth>

      {resolved && (
        <SecondaryActions>
          <button type="button" onClick={reset} className="btn-terminal">
            Change settings
          </button>
        </SecondaryActions>
      )}
    </div>
  );
}
