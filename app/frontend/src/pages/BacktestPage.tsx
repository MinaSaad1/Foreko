import { useRef } from"react";
import { useParams } from"react-router-dom";
import { api } from"@/api/endpoints";
import { ColumnMapper } from"@/components/ColumnMapper";
import { JobProgress } from"@/components/common/JobProgress";
import { FoldResultsTable } from"@/components/backtest/FoldResultsTable";
import { PerHorizonMAPE, type PerHorizonMAPEHandle } from"@/components/backtest/PerHorizonMAPE";
import { CalibrationPlot, type CalibrationPlotHandle } from"@/components/backtest/CalibrationPlot";
import { PageIntro } from"@/components/common/PageIntro";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import { HelpHint } from"@/components/common/HelpHint";
import { DownloadPdfButton, type PdfSection } from"@/components/common/DownloadPdfButton";
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
import { useDocumentTitle } from"@/utils/useDocumentTitle";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import { useHealth } from"@/hooks/useHealth";
import { useBacktestOrchestrator } from"@/hooks/useBacktestOrchestrator";
import type { BacktestResult, CalibrationResult } from"@/types/phases";

const ALL_MODELS = ["timesfm", "lightgbm", "seasonal_naive", "ets"];

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
 const winner = result.winner ?? byMape[0]?.m ?? "-";
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
 heading: "Executive summary",
 body: best
 ? `${winner} is the best performer with ${formatPct(best.mape)} MAPE across ${ctx.folds} expanding-window folds, beating the next-best model by ${liftPct.toFixed(1)}%.`
 : "No model produced usable backtest metrics.",
 kv: [
 ["Winner model", winner],
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

 const winnerFolds = result.fold_details[winner] ?? [];
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

 return (
   <ThreeRailLayout
     left={
       <LeftRail ariaLabel="Backtest configuration">
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
             options={[
               { value: 4, label: "4" },
               { value: 8, label: "8" },
               { value: 12, label: "12" },
               { value: 24, label: "24" },
               { value: 52, label: "52" },
             ]}
             value={horizon}
             onChange={setHorizon}
             disabled={!!result || !!jobId}
             columns={3}
           />
         </RailSection>

         <RailSection label="Folds">
           <RailChoiceGrid
             options={[
               { value: 3, label: "3" },
               { value: 5, label: "5" },
               { value: 7, label: "7" },
               { value: 10, label: "10" },
             ]}
             value={folds}
             onChange={setFolds}
             disabled={!!result || !!jobId}
             columns={2}
           />
         </RailSection>

         <RailSection label="Models">
           <div className="flex flex-wrap gap-1">
             {ALL_MODELS.map((m) => (
               <button
                 key={m}
                 onClick={() => toggleModel(m)}
                 disabled={!!result || !!jobId}
                 className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                   models.includes(m)
                     ? "border-accent bg-accent/10 text-accent"
                     : "border-border-strong/60 text-text-secondary hover:border-text-primary hover:text-text-primary"
                 } ${result || jobId ? "opacity-50 cursor-not-allowed" : ""}`}
               >
                 {m}
               </button>
             ))}
           </div>
         </RailSection>

         {result && <RailResetButton onClick={reset} />}
       </LeftRail>
     }
     right={
       <RightRail ariaLabel="Backtest insights">
         {!result && (
           <WhatYoullGet
             summary="Walk-forward evaluation across multiple expanding-window folds. Surfaces MAPE, RMSE, MASE, pinball loss, per-horizon accuracy, and prediction-interval calibration."
             reading={[
               "Lower MAPE / RMSE / MASE is better. Pinball measures P10/P50/P90 sharpness.",
               "Flat per-horizon line = the model holds up across the full horizon.",
               "Calibration dots on the diagonal = honest uncertainty bands.",
             ]}
           />
         )}
         {result && (
           <>
             <RailSection label="Winner">
               <RailRow k="Model" v={winnerName ?? "-"} tone="accent" />
               <RailRow k="MAPE (mean)" v={winnerAgg ? formatPct(winnerAgg.mape_mean) : "-"} tone="ok" />
               <RailRow k="MAPE (std)" v={winnerAgg ? formatPct(winnerAgg.mape_std) : "-"} />
               <RailRow k="RMSE" v={winnerAgg ? formatNumber(winnerAgg.rmse_mean) : "-"} />
               <RailRow k="MASE" v={winnerAgg ? formatNumber(winnerAgg.mase_mean) : "-"} />
             </RailSection>
             <RailSection label="Run">
               <RailRow k="Folds" v={String(folds)} />
               <RailRow k="Horizon" v={`${horizon} periods`} />
               <RailRow k="Models" v={String(models.length)} />
             </RailSection>
           </>
         )}
       </RightRail>
     }
   >
     <PageHeader
       kicker="Validate"
       title={displayName}
       subtitle={preview ? `${preview.row_count.toLocaleString()} rows · ${folds} folds · horizon ${horizon}` : undefined}
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

     <div className="lg:hidden">
       <PageIntro pageKey="backtest" />
     </div>

     {!result && !jobId && (
       <div className="border border-border-strong/70 bg-bg-surface px-6 py-6 space-y-5 shadow-[var(--shadow-elev-1)]">
         <div className="flex items-center gap-2">
           <span className="text-accent leading-none" aria-hidden>▣</span>
           <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
             Set up the backtest
           </h2>
         </div>

         {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

         <button
           onClick={startBacktest}
           disabled={!mapping || models.length === 0 || isStartPending || !!jobId || !modelReady}
           className="w-full btn-terminal-primary"
         >
           {isStartPending ? "Starting..." : "Run walk-forward backtest"}
         </button>

         {!modelReady && (
           <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted text-center">
             Model still loading; the Run button enables when it's ready.
           </p>
         )}

         {(jobError || isStartError) && (
           <p className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
             {jobError ?? String(startError)}
           </p>
         )}
       </div>
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
       <div className="space-y-6">
         <FoldResultsTable result={result} />

         <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
           <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary flex items-center">
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
               <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary flex items-center">
                 Prediction-interval calibration <HelpHint termKey="calibration" />
               </h3>
               <p className="text-xs text-text-muted">
                 If dots sit on the dashed diagonal, stated confidence intervals are trustworthy.
               </p>
             </div>
             {!calibration && (
               <button
                 onClick={runCalibration}
                 disabled={isCalibrationPending}
                 className="border border-accent/30 bg-accent-dim px-3 py-1.5 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40"
               >
                 {isCalibrationPending ? "Running…" : "Compute calibration"}
               </button>
             )}
           </div>
           {calibration && <CalibrationPlot ref={calibrationRef} data={calibration} />}
         </div>
       </div>
     )}
   </ThreeRailLayout>
 );
}
