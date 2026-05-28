import { useState, type Ref } from"react";
import type { ComparisonResponse, ModelName } from"@/types/comparison";
import { MetricBadge, ConfidencePill } from"./MetricBadge";
import { FeatureImportance } from"./FeatureImportance";
import { ComparisonChart, type ComparisonChartHandle } from"./ComparisonChart";

export type RecommendationSource ="holdout" |"backtest";

interface WinnerCardProps {
 data: ComparisonResponse;
 onSelectionChange?: (name: ModelName) => void;
 chartRef?: Ref<ComparisonChartHandle>;
 recommendationSource?: RecommendationSource;
 recommendationNote?: string;
}

export function WinnerCard({
 data,
 onSelectionChange,
 chartRef,
 recommendationSource ="holdout",
 recommendationNote,
}: WinnerCardProps) {
 const [selected, setSelected] = useState<ModelName>(data.winner.name);
 const [showBoth, setShowBoth] = useState(false);

 const winner = data.winner;
 const alternative = data.alternative;

 // Numbers, chart, and feature importance follow `active` (the viewed model);
 // the"Recommended"header always points to the winner.
 const viewingWinner = selected === winner.name;
 const active = viewingWinner ? winner : alternative;
 const activeKey:"winner" |"alternative" = viewingWinner ?"winner" :"alternative";

 const handleSelect = (name: ModelName) => {
 setSelected(name);
 onSelectionChange?.(name);
 };

 const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
 const fmtTotal = (n: number) =>
 n >= 1_000_000
 ? `${(n / 1_000_000).toFixed(1)}M`
 : n >= 1_000
 ? `${(n / 1_000).toFixed(1)}K`
 : n.toFixed(0);

 return (
 <div className="relative">
 <div className="relative border border-accent/40 bg-bg-surface p-6 space-y-6 shadow-[var(--shadow-elev-1)]">
 {/* Header, recommendation is constant */}
 <div className="flex items-start justify-between">
 <div className="space-y-1">
 <div className="flex items-center gap-2 text-accent-2 text-sm">
 <span>
 ★{""}
 {recommendationSource ==="backtest"
 ?"Recommended (backtest winner):"
 :"Best on most recent window:"}
 </span>
 <span className="font-semibold">{winner.display_name}</span>
 </div>
 <div className="flex items-baseline gap-3">
 <h2 className="font-display text-xl font-semibold text-text-primary">
 Viewing: {active.display_name}
 </h2>
 {!viewingWinner && (
 <span className="border border-neutral/40 bg-neutral/10 px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-neutral">
 Alternative
 </span>
 )}
 </div>
 </div>
 <ConfidencePill level={active.confidence} />
 </div>

 {/* Three headline numbers, from active model */}
 <div className="flex gap-8">
 <MetricBadge label="Expected total"value={fmtTotal(active.total_forecast)} />
 <MetricBadge label="Accuracy"value={fmtPct(active.accuracy)} sub="on recent data" />
 <MetricBadge label="Confidence"value={active.confidence} />
 </div>

 {/* Chart, primary line follows active, overlay is the other */}
 <ComparisonChart
 ref={chartRef}
 data={data}
 showBothModels={showBoth}
 activeModel={activeKey}
 />

 {/* Show comparison toggle */}
 <button
 onClick={() => setShowBoth((v) => !v)}
 className="text-xs text-accent hover:opacity-80 transition-opacity underline underline-offset-2"
 >
 {showBoth
 ? `▾ Hide ${viewingWinner ? alternative.display_name : winner.display_name} overlay`
 : `▸ Compare side by side with ${viewingWinner ? alternative.display_name : winner.display_name}`}
 </button>

 {/* Winner explanation, constant */}
 <p className="border border-border bg-bg-elevated px-4 py-3 text-sm text-text-secondary">
 {recommendationNote ?? data.winner_explanation}
 </p>

 {/* Feature importance, only when the active model has any (LightGBM) */}
 {active.feature_importance && active.feature_importance.length > 0 && (
 <FeatureImportance items={active.feature_importance} />
 )}

 {/* Model toggle, lets the user inspect either forecast */}
 <div className="space-y-2">
 <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
 Inspect forecast
 </p>
 <div className="flex gap-3">
 <button
 onClick={() => handleSelect(winner.name)}
 className={`flex-1 border px-4 py-2 font-mono text-xs tracking-widest uppercase transition-colors flex items-center justify-center gap-2 ${
 selected === winner.name
 ?"border-accent bg-accent text-on-accent"
 :"border-border text-text-secondary hover:border-accent/40 hover:text-accent"
 }`}
 >
 {selected === winner.name ? `[✓] ${winner.display_name}` : `[ ] ${winner.display_name}`}
 <span className={`${selected === winner.name ?"text-bg-elevated" :"text-accent/60"}`}>★</span>
 </button>
 <button
 onClick={() => handleSelect(alternative.name)}
 className={`flex-1 border px-4 py-2 font-mono text-xs tracking-widest uppercase transition-colors flex items-center justify-center gap-2 ${
 selected === alternative.name
 ?"border-neutral bg-neutral text-on-accent"
 :"border-border text-text-secondary hover:border-neutral/40 hover:text-neutral"
 }`}
 >
 {selected === alternative.name ? `[✓] ${alternative.display_name}` : `[ ] ${alternative.display_name}`}
 </button>
 </div>
 </div>

 {/* Error rate detail, constant */}
 <p className="text-xs text-text-muted font-mono">
 {winner.display_name} error rate: {fmtPct(winner.mape)} on holdout period
 {" ·"}
 {alternative.display_name}: {fmtPct(alternative.mape)}
 </p>
 </div>
 </div>
 );
}
