import type { ModelResult } from"@/types/comparison";

interface AlternativeCardProps {
 model: ModelResult;
 winnerAccuracy: number;
}

export function AlternativeCard({ model, winnerAccuracy }: AlternativeCardProps) {
 const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
 const fmtTotal = (n: number) =>
 n >= 1_000_000
 ? `${(n / 1_000_000).toFixed(1)}M`
 : n >= 1_000
 ? `${(n / 1_000).toFixed(1)}K`
 : n.toFixed(0);

 const diff = Math.abs(model.accuracy - winnerAccuracy);
 const diffLabel = `${Math.round(diff * 100)} pp ${model.accuracy > winnerAccuracy ?"better" :"worse"}`;

 return (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-4">
 <div>
 <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
 Alternative Forecast
 </p>
 <h3 className="mt-1 font-display text-base font-medium text-text-secondary">
 {model.display_name}
 </h3>
 </div>

 <div className="flex gap-6">
 <div>
 <span className="block font-mono text-xs text-text-muted uppercase tracking-widest">
 Expected total
 </span>
 <span className="font-mono text-lg text-text-primary">{fmtTotal(model.total_forecast)}</span>
 </div>
 <div>
 <span className="block font-mono text-xs text-text-muted uppercase tracking-widest">
 Accuracy
 </span>
 <span className="font-mono text-lg text-text-primary">{fmtPct(model.accuracy)}</span>
 </div>
 <div>
 <span className="block font-mono text-xs text-text-muted uppercase tracking-widest">
 vs winner
 </span>
 <span className={`font-mono text-lg ${model.accuracy > winnerAccuracy ?"text-positive" :"text-text-muted"}`}>
 {diffLabel}
 </span>
 </div>
 </div>
 </div>
 );
}
