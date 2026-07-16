import { useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ColumnMapper } from "@/components/ColumnMapper";
import { JobProgress } from "@/components/common/JobProgress";
import { FoldResultsTable } from "@/components/backtest/FoldResultsTable";
import { PerHorizonMAPE, type PerHorizonMAPEHandle } from "@/components/backtest/PerHorizonMAPE";
import { CalibrationPlot, type CalibrationPlotHandle } from "@/components/backtest/CalibrationPlot";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { HelpHint } from "@/components/common/HelpHint";
import { RunError } from "@/components/common/RunError";
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
import { useBacktestOrchestrator } from "@/hooks/useBacktestOrchestrator";
import type { BacktestResult, CalibrationResult } from "@/types/phases";

const ALL_MODELS = ["timesfm", "lightgbm", "seasonal_naive", "ets"];

const HORIZON_OPTIONS = [
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 12, label: "12" },
  { value: 24, label: "24" },
  { value: 52, label: "52" },
];

const FOLD_OPTIONS = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 7, label: "7" },
  { value: 10, label: "10" },
];

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

 const byMape = modelNames
 .map((m) => ({ m, mape: result.aggregate[m].mape_mean }))
 .sort((a, b) => a.mape - b.mape);
 // The backend returns a null winner when no candidate completed every fold.
 // Do not fall back to the lowest MAPE: that model's surviving folds are a
 // biased sample of the ones it happened to survive, and crowning it here would
 // state a champion in an exported document that the evidence does not support.
 const winner = result.winner;
 const best = winner ? byMape.find((entry) => entry.m === winner) : undefined;
 const second = winner ? byMape.filter((entry) => entry.m !== winner)[0] : undefined;
 const winnerAgg = winner ? result.aggregate[winner] : null;
 const liftPct = best && second && second.mape > 0
 ? ((second.mape - best.mape) / second.mape) * 100
 : 0;

 // Per-horizon degradation for the winner: first → last horizon.
 const winnerPerH = (winner ? result.per_horizon_mape[winner] : undefined) ?? [];
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
 heading: "Executive summary",
 body: best && second
 ? `${winner} is the best performer with ${formatPct(best.mape)} MAPE across ${ctx.folds} expanding-window folds, beating the next-best model by ${liftPct.toFixed(1)}%.`
 : best
 ? `${winner} is the best performer with ${formatPct(best.mape)} MAPE across ${ctx.folds} expanding-window folds.`
 : "No model completed every fold, so there is no eligible winner. Check the failures before relying on these metrics.",
 kv: [
 ["Winner model", winner ?? "None: no model completed every fold"],
 ["Winner MAPE (mean)", winnerAgg ? formatPct(winnerAgg.mape_mean) : "-"],
 ["Winner MAPE (std)", winnerAgg ? formatPct(winnerAgg.mape_std) : "-"],
 ["Winner RMSE", winnerAgg ? formatNumber(winnerAgg.rmse_mean) : "-"],
 ["Winner MASE", winnerAgg ? formatNumber(winnerAgg.mase_mean) : "-"],
 ["Lift vs 2nd best", best && second ? `+${liftPct.toFixed(1)}%` : "-"],
 ["Models evaluated", ctx.models.length ? ctx.models.join(",") : "-"],
 ["Folds", `${ctx.folds}`],
 ["Horizon", `${ctx.horizon} periods`],
 ["Horizon degradation (winner)", winnerPerH.length >= 2 ? `${degradation >= 0 ? "+" : ""}${degradation.toFixed(1)}%` : "-"],
 ["PI miscalibration (mean gap)", calibration ? `${(miscalibration * 100).toFixed(2)} pp` : "not computed"],
 ["Calibration observations", calibration ? calibration.n_observations.toString() : "-"],
 ["Dataset", ctx.datasetName ?? "-"],
 ["Historical rows", ctx.rowCount ? ctx.rowCount.toLocaleString() : "-"],
 ],
 });

 sections.push({
 heading: "Aggregate metrics by model",
 body: "Averages across all folds. Lower MAPE / RMSE / MASE are better; pinball losses quantify P10/P50/P90 accuracy.",
 table: {
 headers: ["Model", "MAPE", "± std", "RMSE", "MAE", "MASE", "Pinball 10/50/90"],
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
 heading: "Accuracy by forecast horizon",
 image_base64: ctx.perHorizonPng,
 caption: "MAPE at each step h+1 through h+N. A flat line means the model is stable out to the full horizon.",
 });
 }

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
 heading: `Per-horizon MAPE${winnerPerH.length > 12 ? ` (every ${step} steps)` : ""}`,
 table: { headers, rows },
 });
 }

 const winnerFolds = (winner ? result.fold_details[winner] : undefined) ?? [];
 if (winnerFolds.length > 0) {
 sections.push({
 heading: `Fold details, ${winner}`,
 body: `Per-fold breakdown shows variance across time windows. High fold-to-fold swings suggest instability.`,
 table: {
 headers: ["Fold", "MAPE", "sMAPE", "RMSE", "MASE", "Pinball 50"],
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

 if (calibration) {
 if (ctx.calibrationPng) {
 sections.push({
 heading: "Prediction-interval calibration",
 image_base64: ctx.calibrationPng,
 caption: "Dots on the dashed diagonal ⇒ stated confidence intervals are honest; below ⇒ over-confident, above ⇒ under-confident.",
 });
 }
 sections.push({
 heading: "Reliability table",
 table: {
 headers: ["Nominal", "Empirical", "Gap"],
 rows: calibration.reliability.map((r) => [
 `${(r.nominal * 100).toFixed(0)}%`,
 `${(r.empirical * 100).toFixed(1)}%`,
 `${((r.empirical - r.nominal) * 100).toFixed(1)} pp`,
 ]),
 },
 });
 }

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
 `Error ${degradation > 0 ? "grows" : "shrinks"} by ${Math.abs(degradation).toFixed(0)}% from the first to the last forecast step, ${degradation > 0 ? "consider a shorter operating horizon" : "the model holds up well over long horizons"}.`,
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
 heading: "Takeaways",
 body: takeaways.map((t, i) => `${i + 1}. ${t}`).join("\n"),
 });

 return sections;
}

export function BacktestPage() {
 useDocumentTitle("Backtest");
 const { datasetId } = useParams<{ datasetId?: string }>();
 const { activeId, preview } = useSyncedDataset(datasetId);
 const { data: health } = useHealth();
 const modelReady = health?.model_status === "ready";

 const perHorizonRef = useRef<PerHorizonMAPEHandle | null>(null);
 const calibrationRef = useRef<CalibrationPlotHandle | null>(null);

 const {
 mapping,
 handleMappingChange,
 horizon,
 setHorizon,
 folds,
 setFolds,
 models,
 toggleModel,
 jobId,
 jobError,
 result,
 calibration,
 isStartPending,
 isStartError,
 startError,
 isCalibrationPending,
 startBacktest,
 runCalibration,
 handleJobDone,
 handleJobError,
 handleJobReset,
 reset,
 } = useBacktestOrchestrator(activeId);

 if (!activeId) {
 return (
 <EmptyDatasetState
 title="Walk-Forward Backtest"pageKey="backtest"basePath="/backtest"
 />
 );
 }

 const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Backtest";
 const winnerName = result?.winner ?? null;
 const winnerAgg = winnerName ? result?.aggregate[winnerName] : null;
 const configLocked = !!result || !!jobId;
 const noModels = models.length === 0;

 return (
   <div className="flex flex-col gap-6">
     <PageHeading
       kicker="Validate"
       title={displayName}
       intro="Walk-forward evaluation across multiple expanding-window folds. Surfaces MAPE, RMSE, MASE, pinball loss, per-horizon accuracy, and prediction-interval calibration."
       actions={
         result && (
           <DownloadPdfButton
             title="Foreko, Backtest report"
             filename="foreko-backtest.pdf"
             sections={() => buildBacktestReport(result, calibration, {
               horizon,
               folds,
               models,
               datasetName: preview?.filename,
               rowCount: preview?.row_count,
               perHorizonPng: perHorizonRef.current?.getPng({ backgroundColor: "#ffffff", pixelRatio: 3 }) ?? null,
               calibrationPng: calibrationRef.current?.getPng({ backgroundColor: "#ffffff", pixelRatio: 3 }) ?? null,
             })}
           />
         )
       }
     />

     <FactGrid>
       <Fact label="File" value={preview ? preview.filename : "Loading..."} />
       <Fact label="Rows" value={preview ? preview.row_count.toLocaleString() : "-"} />
       <Fact label="Folds" value={String(folds)} />
       <Fact label="Horizon" value={`${horizon} periods`} />
     </FactGrid>

     {result && (
       <FactGrid columns={3}>
         <Fact label="Winner" value={winnerName ?? "None, no model completed every fold"} />
         <Fact label="MAPE (mean)" value={winnerAgg ? formatPct(winnerAgg.mape_mean) : "-"} />
         <Fact label="MAPE (std)" value={winnerAgg ? formatPct(winnerAgg.mape_std) : "-"} />
         <Fact label="RMSE" value={winnerAgg ? formatNumber(winnerAgg.rmse_mean) : "-"} />
         <Fact label="MASE" value={winnerAgg ? formatNumber(winnerAgg.mase_mean) : "-"} />
         <Fact label="Models evaluated" value={String(models.length)} />
       </FactGrid>
     )}

     {!result && !jobId && (
       <Section title="Set up the backtest">
         <div className="flex flex-col gap-5">
           {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

           {/* Horizon, folds, and models all lived in a rail that did not exist
               below 1024px, so on a laptop-width window the run button was the
               only control on the page. They configure this run, so they sit on
               it. */}
           <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
             <div>
               <div className="flex items-center gap-1.5">
                 <span className="text-[13px] font-medium text-text-primary">Horizon</span>
                 <HelpHint termKey="horizon" />
               </div>
               <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                 How many periods each fold forecasts ahead.
               </p>
               <div className="mt-2">
                 <ChoiceGrid
                   options={HORIZON_OPTIONS}
                   value={horizon}
                   onChange={setHorizon}
                   disabled={configLocked}
                   columns={3}
                 />
               </div>
             </div>

             <div>
               <span className="text-[13px] font-medium text-text-primary">Folds</span>
               <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                 How many expanding windows to test across. More folds, more evidence.
               </p>
               <div className="mt-2">
                 <ChoiceGrid
                   options={FOLD_OPTIONS}
                   value={folds}
                   onChange={setFolds}
                   disabled={configLocked}
                   columns={2}
                 />
               </div>
             </div>

             <div>
               <span className="text-[13px] font-medium text-text-primary">Models</span>
               {/* The run button's gate includes models.length === 0. Without
                   this line the primary just goes dead and says nothing. */}
               <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                 {noModels
                   ? "Select at least one model. The Run button enables once one is on."
                   : "Every selected model is evaluated on every fold."}
               </p>
               <div className="mt-2 flex flex-wrap gap-1">
                 {ALL_MODELS.map((m) => (
                   <button
                     key={m}
                     onClick={() => toggleModel(m)}
                     disabled={configLocked}
                     aria-pressed={models.includes(m)}
                     className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                       models.includes(m)
                         ? "border-accent bg-accent/10 text-accent"
                         : "border-border-strong/60 text-text-secondary hover:border-text-primary hover:text-text-primary"
                     } ${configLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                   >
                     {m}
                   </button>
                 ))}
               </div>
             </div>
           </div>

           <button
             onClick={startBacktest}
             disabled={!mapping || noModels || isStartPending || !!jobId || !modelReady}
             className="w-full btn-terminal-primary"
           >
             {isStartPending ? "Starting..." : "Run walk-forward backtest"}
           </button>

           {!modelReady && (
             <p className="text-[13px] leading-relaxed text-text-secondary">
               Model still loading, the Run button enables when it's ready.
             </p>
           )}

           {jobError && <RunError error={jobError} label="Backtest" />}
           {isStartError && (
             <RunError error={startError ?? "Could not start the run."} label="Backtest" />
           )}
         </div>
       </Section>
     )}

     {jobId && !result && (
       <JobProgress
         jobId={jobId}
         kind="backtest"
         eventStreamUrl={api.backtestEventStreamUrl(jobId)}
         onDone={handleJobDone}
         onError={handleJobError}
         onReset={handleJobReset}
       />
     )}

     {result && (
       <>
         <FoldResultsTable result={result} />

         {/* Shared-border seam grid, not three stacked cards around a table that
             already draws its own border. */}
         <div className="grid grid-cols-1 border-l border-t border-border-strong/70">
           <section className="border-r border-b border-border-strong/70 p-5">
             <h3 className="flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
               Accuracy by forecast horizon <HelpHint termKey="horizon" />
             </h3>
             <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
               How does forecast error grow with horizon depth? A flat line means stable
               long-range forecasts.
             </p>
             <div className="mt-3">
               <PerHorizonMAPE ref={perHorizonRef} perHorizon={result.per_horizon_mape} />
             </div>
           </section>

           <section className="border-r border-b border-border-strong/70 p-5">
             <div className="flex flex-wrap items-start justify-between gap-3">
               <div className="min-w-0">
                 <h3 className="flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
                   Prediction-interval calibration <HelpHint termKey="calibration" />
                 </h3>
                 <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                   If dots sit on the dashed diagonal, stated confidence intervals are
                   trustworthy.
                 </p>
               </div>
               {!calibration && (
                 <button
                   onClick={runCalibration}
                   disabled={isCalibrationPending}
                   className="shrink-0 border border-accent/30 bg-accent-dim px-3 py-1.5 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40"
                 >
                   {isCalibrationPending ? "Running…" : "Compute calibration"}
                 </button>
               )}
             </div>
             {calibration && (
               <div className="mt-3">
                 <CalibrationPlot ref={calibrationRef} data={calibration} />
               </div>
             )}
           </section>
         </div>
       </>
     )}

     <Depth label="Reading the result">
       <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
         <li className="flex gap-2">
           <span className="text-accent" aria-hidden>
             ▸
           </span>
           <span>
             Lower MAPE / RMSE / MASE is better. Pinball measures P10/P50/P90 sharpness.
           </span>
         </li>
         <li className="flex gap-2">
           <span className="text-accent" aria-hidden>
             ▸
           </span>
           <span>
             A flat per-horizon line means the model holds up across the full horizon.
           </span>
         </li>
         <li className="flex gap-2">
           <span className="text-accent" aria-hidden>
             ▸
           </span>
           <span>Calibration dots on the diagonal mean honest uncertainty bands.</span>
         </li>
       </ul>
     </Depth>

     {result && (
       <SecondaryActions>
         <button type="button" onClick={reset} className="btn-terminal">
           Change settings
         </button>
       </SecondaryActions>
     )}
   </div>
 );
}
