import type { BacktestResult } from"@/types/phases";

interface FoldResultsTableProps {
  result: BacktestResult;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNum(n: number, digits: number = 2): string {
  if (!isFinite(n)) return"-";
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(digits);
}

export function FoldResultsTable({ result }: FoldResultsTableProps) {
  const models = result.models;
  const metrics = ["mape","smape","rmse","mae","mase","pinball_50"] as const;
  const metricLabels: Record<string, string> = {
    mape:"MAPE",
    smape:"sMAPE",
    rmse:"RMSE",
    mae:"MAE",
    mase:"MASE",
    pinball_50:"Pinball p50",
  };

  return (
    <div className="rounded-panel border border-border bg-bg-surface overflow-hidden">
      <div className="border-b border-border bg-bg-elevated px-5 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-medium text-text-primary">
            Walk-forward results
          </h3>
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            {result.folds} folds · horizon {result.horizon}
            {result.winner && (
              <span className="ml-2 border border-accent/40 bg-accent-dim px-2 py-0.5 text-accent">
                winner: {result.winner}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="terminal-table">
          <thead className="border-border">
            <tr>
              <th className="px-4 py-2 text-left font-mono text-xs uppercase tracking-widest">
                Model
              </th>
              {metrics.map((m) => (
                <th
                  key={m}
                  className="px-4 py-2 text-right font-mono text-xs uppercase tracking-widest"
                >
                  {metricLabels[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const agg = result.aggregate[m];
              if (!agg) return null;
              const isWinner = m === result.winner;
              return (
                <tr
                  key={m}
                  className={`border-b border-border last:border-0 transition-colors ${
                    isWinner ?"bg-accent-dim/30" :"hover:bg-bg-elevated"
                  }`}
                >
                  <td className={`px-4 py-2 font-mono ${isWinner ?"text-accent" :"text-text-primary"}`}>
                    {isWinner && <span className="mr-1">★</span>}
                    {m}
                  </td>
                  <td className="px-4 py-2 text-right text-text-secondary">{fmtPct(agg.mape_mean)}</td>
                  <td className="px-4 py-2 text-right text-text-secondary">{fmtPct(agg.smape_mean)}</td>
                  <td className="px-4 py-2 text-right text-text-secondary">{fmtNum(agg.rmse_mean)}</td>
                  <td className="px-4 py-2 text-right text-text-secondary">{fmtNum(agg.mae_mean)}</td>
                  <td className="px-4 py-2 text-right text-text-secondary">
                    {isFinite(agg.mase_mean) ? fmtNum(agg.mase_mean, 3) :"-"}
                  </td>
                  <td className="px-4 py-2 text-right text-text-secondary">{fmtNum(agg.pinball_50_mean)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
