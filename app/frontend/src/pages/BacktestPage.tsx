import { useCallback, useRef, useState } from"react";
import { useParams } from"react-router-dom";
import { useMutation } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import { useBacktestStore } from"@/stores/backtestStore";
import { ColumnMapper } from"@/components/ColumnMapper";
import { JobProgress } from"@/components/common/JobProgress";
import { FoldResultsTable } from"@/components/backtest/FoldResultsTable";
import { PerHorizonMAPE, type PerHorizonMAPEHandle } from"@/components/backtest/PerHorizonMAPE";
import { CalibrationPlot, type CalibrationPlotHandle } from"@/components/backtest/CalibrationPlot";
import { PageIntro } from"@/components/common/PageIntro";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import { HelpHint } from"@/components/common/HelpHint";
import { Term } from"@/components/common/Term";
import { DownloadPdfButton, type PdfSection } from"@/components/common/DownloadPdfButton";
import { useDocumentTitle } from"@/utils/useDocumentTitle";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import { useHealth } from"@/hooks/useHealth";
import type { ColumnMapping } from"@/types/dataset";
import type { BacktestResult, CalibrationResult } from"@/types/phases";

const ALL_MODELS = ["timesfm","lightgbm","seasonal_naive","ets"];

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return"-";
  return `${(v * 100).toFixed(2)}%`;
}

function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return"-";
  return v.toFixed(digits);
}

function buildBacktestReport(
  result: BacktestResult,
  calibration: CalibrationResult | null,
  ctx: {
    horizon: number;
    folds: number;
    models: string[];
    datasetName?: string;
    rowCount?: number;
    perHorizonPng: string | null;
    calibrationPng: string | null;
  },
): PdfSection[] {
  const sections: PdfSection[] = [];
  const modelNames = Object.keys(result.aggregate);

  // Winner = model with the lowest MAPE mean (fallback to result.winner).
  const byMape = modelNames
    .map((m) => ({ m, mape: result.aggregate[m].mape_mean }))
    .sort((a, b) => a.mape - b.mape);
  const winner = result.winner ?? byMape[0]?.m ??"-";
  const best = byMape[0];
  const second = byMape[1];
  const winnerAgg = best ? result.aggregate[best.m] : null;
  const liftPct = best && second && second.mape > 0
    ? ((second.mape - best.mape) / second.mape) * 100
    : 0;

  // Per-horizon degradation for the winner: first → last horizon.
  const winnerPerH = result.per_horizon_mape[winner] ?? [];
  const firstHMape = winnerPerH[0];
  const lastHMape = winnerPerH[winnerPerH.length - 1];
  const degradation = Number.isFinite(firstHMape) && Number.isFinite(lastHMape) && firstHMape > 0
    ? ((lastHMape - firstHMape) / firstHMape) * 100
    : 0;

  // Calibration miscalibration score (mean absolute gap).
  let miscalibration = 0;
  if (calibration) {
    const gaps = calibration.reliability.map((r) => Math.abs(r.empirical - r.nominal));
    miscalibration = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  }

  sections.push({
    heading:"Executive summary",
    body: best
      ? `${winner} is the best performer with ${formatPct(best.mape)} MAPE across ${ctx.folds} expanding-window folds, beating the next-best model by ${liftPct.toFixed(1)}%.`
      :"No model produced usable backtest metrics.",
    kv: [
      ["Winner model", winner],
      ["Winner MAPE (mean)", winnerAgg ? formatPct(winnerAgg.mape_mean) :"-"],
      ["Winner MAPE (std)", winnerAgg ? formatPct(winnerAgg.mape_std) :"-"],
      ["Winner RMSE", winnerAgg ? formatNumber(winnerAgg.rmse_mean) :"-"],
      ["Winner MASE", winnerAgg ? formatNumber(winnerAgg.mase_mean) :"-"],
      ["Lift vs 2nd best", best && second ? `+${liftPct.toFixed(1)}%` :"-"],
      ["Models evaluated", ctx.models.length ? ctx.models.join(",") :"-"],
      ["Folds", `${ctx.folds}`],
      ["Horizon", `${ctx.horizon} periods`],
      ["Horizon degradation (winner)", winnerPerH.length >= 2 ? `${degradation >= 0 ?"+" :""}${degradation.toFixed(1)}%` :"-"],
      ["PI miscalibration (mean gap)", calibration ? `${(miscalibration * 100).toFixed(2)} pp` :"not computed"],
      ["Calibration observations", calibration ? calibration.n_observations.toString() :"-"],
      ["Dataset", ctx.datasetName ??"-"],
      ["Historical rows", ctx.rowCount ? ctx.rowCount.toLocaleString() :"-"],
    ],
  });

  // Aggregate metrics table (one row per model).
  sections.push({
    heading:"Aggregate metrics by model",
    body:"Averages across all folds. Lower MAPE / RMSE / MASE are better; pinball losses quantify P10/P50/P90 accuracy.",
    table: {
      headers: ["Model","MAPE","± std","RMSE","MAE","MASE","Pinball 10/50/90"],
      rows: byMape.map(({ m }) => {
        const a = result.aggregate[m];
        return [
          m === winner ? `${m} ★` : m,
          formatPct(a.mape_mean),
          formatPct(a.mape_std),
          formatNumber(a.rmse_mean),
          formatNumber(a.mae_mean),
          formatNumber(a.mase_mean),
          `${formatNumber(a.pinball_10_mean, 2)} / ${formatNumber(a.pinball_50_mean, 2)} / ${formatNumber(a.pinball_90_mean, 2)}`,
        ];
      }),
    },
  });

  if (ctx.perHorizonPng) {
    sections.push({
      heading:"Accuracy by forecast horizon",
      image_base64: ctx.perHorizonPng,
      caption:"MAPE at each step h+1 through h+N. A flat line means the model is stable out to the full horizon.",
    });
  }

  // Per-horizon MAPE table, helpful when chart is absent or small.
  if (winnerPerH.length > 0) {
    const step = Math.max(1, Math.ceil(winnerPerH.length / 12));
    const headers = ["Model", ...Array.from({ length: Math.ceil(winnerPerH.length / step) }, (_, i) => `h+${i * step + 1}`)];
    const rows: (string | number)[][] = [];
    for (const m of byMape.map((x) => x.m)) {
      const series = result.per_horizon_mape[m] ?? [];
      const row: (string | number)[] = [m === winner ? `${m} ★` : m];
      for (let i = 0; i < series.length; i += step) row.push(formatPct(series[i]));
      rows.push(row);
    }
    sections.push({
      heading: `Per-horizon MAPE${winnerPerH.length > 12 ? ` (every ${step} steps)` :""}`,
      table: { headers, rows },
    });
  }

  // Fold-level details for the winning model.
  const winnerFolds = result.fold_details[winner] ?? [];
  if (winnerFolds.length > 0) {
    sections.push({
      heading: `Fold details, ${winner}`,
      body: `Per-fold breakdown shows variance across time windows. High fold-to-fold swings suggest instability.`,
      table: {
        headers: ["Fold","MAPE","sMAPE","RMSE","MASE","Pinball 50"],
        rows: winnerFolds.map((f) => [
          f.fold,
          formatPct(f.mape),
          formatPct(f.smape),
          formatNumber(f.rmse),
          formatNumber(f.mase),
          formatNumber(f.pinball_50, 2),
        ]),
      },
    });
  }

  // Calibration block (chart + table).
  if (calibration) {
    if (ctx.calibrationPng) {
      sections.push({
        heading:"Prediction-interval calibration",
        image_base64: ctx.calibrationPng,
        caption:"Dots on the dashed diagonal ⇒ stated confidence intervals are honest; below ⇒ over-confident, above ⇒ under-confident.",
      });
    }
    sections.push({
      heading:"Reliability table",
      table: {
        headers: ["Nominal","Empirical","Gap"],
        rows: calibration.reliability.map((r) => [
          `${(r.nominal * 100).toFixed(0)}%`,
          `${(r.empirical * 100).toFixed(1)}%`,
          `${((r.empirical - r.nominal) * 100).toFixed(1)} pp`,
        ]),
      },
    });
  }

  // Takeaways.
  const takeaways: string[] = [];
  if (best) {
    takeaways.push(
      `Use ${winner} in production, it leads on MAPE with ${formatPct(best.mape)} error across ${ctx.folds} folds.`,
    );
  }
  if (winnerAgg && winnerAgg.mape_std > winnerAgg.mape_mean * 0.5) {
    takeaways.push(
      `Fold-to-fold MAPE std (${formatPct(winnerAgg.mape_std)}) is large relative to the mean, the model is sensitive to which window you train on.`,
    );
  }
  if (Math.abs(degradation) > 25 && winnerPerH.length >= 2) {
    takeaways.push(
      `Error ${degradation > 0 ?"grows" :"shrinks"} by ${Math.abs(degradation).toFixed(0)}% from the first to the last forecast step, ${degradation > 0 ?"consider a shorter operating horizon" :"the model holds up well over long horizons"}.`,
    );
  }
  if (calibration) {
    if (miscalibration < 0.03) {
      takeaways.push("Prediction intervals are well calibrated (mean gap < 3 pp), P10/P90 can be used directly for planning bounds.");
    } else if (miscalibration > 0.08) {
      takeaways.push(`Prediction intervals are miscalibrated by ~${(miscalibration * 100).toFixed(1)} pp on average, widen planning buffers or recalibrate before using P10/P90 for decisions.`);
    }
  }
  if (second && liftPct < 2 && best) {
    takeaways.push(
      `${winner} only beats ${second.m} by ${liftPct.toFixed(1)}%, an ensemble or a simpler model may be more robust in practice.`,
    );
  }

  sections.push({
    heading:"Takeaways",
    body: takeaways.map((t, i) => `${i + 1}. ${t}`).join("\n"),
  });

  return sections;
}

export function BacktestPage() {
  useDocumentTitle("Backtest");
  const { datasetId } = useParams<{ datasetId?: string }>();
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [horizon, setHorizon] = useState(12);
  const [folds, setFolds] = useState(3);
  const [models, setModels] = useState<string[]>(["timesfm","lightgbm","seasonal_naive"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const perHorizonRef = useRef<PerHorizonMAPEHandle | null>(null);
  const calibrationRef = useRef<CalibrationPlotHandle | null>(null);

  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status ==="ready";
  const setBacktestSummary = useBacktestStore((s) => s.setResult);

  const persistBacktestSummary = useCallback(
    (r: BacktestResult) => {
      if (!activeId || !r.winner) return;
      const mapeByModel: Record<string, number> = {};
      for (const [model, agg] of Object.entries(r.aggregate)) {
        mapeByModel[model] = agg.mape_mean;
      }
      setBacktestSummary({
        datasetId: activeId,
        winner: r.winner,
        mapeByModel,
        horizon: r.horizon,
        folds: r.folds,
        completedAt: Date.now(),
      });
    },
    [activeId, setBacktestSummary],
  );

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const startMutation = useMutation({
    mutationFn: async () => {
      const handle = await api.startBacktest({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        folds,
        models,
      });
      return handle;
    },
    onSuccess: (handle) => {
      if (handle.status ==="done") {
        api.getBacktestJob(handle.job_id).then((j) => {
          setResult(j.result);
          if (j.result) persistBacktestSummary(j.result);
        });
      } else {
        setJobId(handle.job_id);
      }
    },
  });

  const calibrationMutation = useMutation({
    mutationFn: () =>
      api.runCalibration({
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        folds,
      }),
    onSuccess: (c) => setCalibration(c),
  });

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Walk-Forward Backtest"
        pageKey="backtest"
        basePath="/backtest"
      />
    );
  }

  const toggleModel = (m: string) => {
    setModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Walk-Forward Backtest</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Evaluate multiple models across {folds} expanding-window <Term k="fold">folds</Term> with{""}
          <Term k="mape">MAPE</Term>, <Term k="rmse">RMSE</Term>, <Term k="mase">MASE</Term>, and{""}
          <Term k="pinball-loss">pinball loss</Term>.
        </p>
        {preview && (
          <p className="mt-1 text-sm text-text-muted font-mono">
            {preview.filename} · {preview.row_count.toLocaleString()} rows
          </p>
        )}
      </div>

      <PageIntro pageKey="backtest" />

      {!result && (
        <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
          {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

          <div className="flex items-end gap-4">
            <div>
              <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
                Horizon
              </label>
              <input
                type="number"
                min={1}
                max={256}
                value={horizon}
                onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
                className="w-24 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
              />
            </div>
            <div>
              <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
                Folds
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={folds}
                onChange={(e) => setFolds(Math.max(1, Number(e.target.value)))}
                className="w-20 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
              Models
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleModel(m)}
                  className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
                    models.includes(m)
                      ?"border-accent bg-accent-dim text-accent"
                      :"border-border text-text-secondary hover:border-border-strong"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => startMutation.mutate()}
            disabled={!mapping || models.length === 0 || startMutation.isPending || !!jobId || !modelReady}
            className="w-full btn-terminal-primary"
          >
            {startMutation.isPending ?"Starting..." :"Run walk-forward backtest"}
          </button>

          {!modelReady && (
            <p className="text-xs text-text-muted text-center">Model still loading, the Run button will enable when it's ready.</p>
          )}

          {startMutation.isError && (
            <p className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
              {String(startMutation.error)}
            </p>
          )}
        </div>
      )}

      {jobId && !result && (
        <JobProgress
          jobId={jobId}
          kind="backtest"
          eventStreamUrl={api.backtestEventStreamUrl(jobId)}
          onDone={(r) => {
            const br = r as BacktestResult;
            setResult(br);
            persistBacktestSummary(br);
            setJobId(null);
          }}
          onError={async () => {
            // Defense-in-depth: SSE may drop right at the finish line. Poll once
            // for the final job state before giving up so the user doesn't see
            // a stuck progress bar after a successful run.
            try {
              const j = await api.getBacktestJob(jobId);
              if (j.status ==="done" && j.result) {
                const br = j.result as BacktestResult;
                setResult(br);
                persistBacktestSummary(br);
              }
            } catch {
              // swallow, fall through to clearing the job
            } finally {
              setJobId(null);
            }
          }}
        />
      )}

      {result && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <DownloadPdfButton
              title="Foresee, Backtest report"
              filename="foresee-backtest.pdf"
              sections={() => buildBacktestReport(result, calibration, {
                horizon,
                folds,
                models,
                datasetName: preview?.filename,
                rowCount: preview?.row_count,
                perHorizonPng: perHorizonRef.current?.getPng({ backgroundColor:"#ffffff", pixelRatio: 3 }) ?? null,
                calibrationPng: calibrationRef.current?.getPng({ backgroundColor:"#ffffff", pixelRatio: 3 }) ?? null,
              })}
            />
          </div>
          <FoldResultsTable result={result} />

          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
            <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary flex items-center">
              Accuracy by forecast horizon <HelpHint termKey="horizon" />
            </h3>
            <p className="text-xs text-text-muted">
              How does forecast error grow with horizon depth? A flat line means stable long-range forecasts.
            </p>
            <PerHorizonMAPE ref={perHorizonRef} perHorizon={result.per_horizon_mape} />
          </div>

          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary flex items-center">
                  Prediction-interval calibration <HelpHint termKey="calibration" />
                </h3>
                <p className="text-xs text-text-muted">
                  If dots sit on the dashed diagonal, stated confidence intervals are trustworthy.
                </p>
              </div>
              {!calibration && (
                <button
                  onClick={() => calibrationMutation.mutate()}
                  disabled={calibrationMutation.isPending}
                  className="border border-accent/30 bg-accent-dim px-3 py-1.5 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40"
                >
                  {calibrationMutation.isPending ?"Running…" :"Compute calibration"}
                </button>
              )}
            </div>
            {calibration && <CalibrationPlot ref={calibrationRef} data={calibration} />}
          </div>

          <button
            onClick={() => {
              setResult(null);
              setJobId(null);
              setCalibration(null);
            }}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change settings
          </button>
        </div>
      )}
    </div>
  );
}
