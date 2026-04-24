import type { PreflightResult } from "@/types/phases";

interface Props {
  data: PreflightResult;
}

export function DataQualityCard({ data }: Props) {
  const score = data.quality_score;
  const scoreTone =
    score >= 85
      ? "text-positive border-positive/40"
      : score >= 60
        ? "text-warning border-warning/40"
        : "text-anomaly border-anomaly/40";
  const stripe =
    score >= 85 ? "bg-positive" : score >= 60 ? "bg-warning" : "bg-anomaly";

  return (
    <div className="rounded-panel border border-border bg-bg-surface overflow-hidden">
      <div className="flex">
        <span className={`w-1 shrink-0 ${stripe}`} aria-hidden />
        <div className="flex-1 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                Data quality preflight
              </p>
              <p className="mt-1 font-mono text-xs text-text-secondary">
                {data.n_points.toLocaleString()} observations · {data.freq}
                {data.first_date && data.last_date ? ` · ${data.first_date} → ${data.last_date}` : ""}
              </p>
            </div>
            <div className={`rounded-md border px-3 py-1.5 text-right ${scoreTone}`}>
              <p className="font-display text-2xl font-semibold">{score}</p>
              <p className="font-mono text-[9px] uppercase tracking-widest">score</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Missing" value={`${(data.missing_rate * 100).toFixed(1)}%`} sub={`${data.missing_count} rows`} />
            <Stat label="Outliers" value={data.outlier_count.toString()} sub={`${(data.outlier_count * 100 / Math.max(data.n_points, 1)).toFixed(1)}%`} />
            <Stat
              label="Stationarity"
              value={data.adf.stationary ? "Stationary" : "Non-stationary"}
              sub={`p=${data.adf.p_value.toFixed(3)}`}
              tone={data.adf.stationary ? "good" : "warn"}
            />
            <Stat
              label="Seasonality"
              value={`${(data.seasonality.seasonal_strength * 100).toFixed(0)}%`}
              sub={`trend: ${(data.seasonality.trend_strength * 100).toFixed(0)}%`}
            />
          </div>

          {data.warnings.length > 0 && (
            <div className="space-y-1">
              {data.warnings.map((w, i) => (
                <p key={i} className="font-mono text-xs text-warning">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          {data.recommended_transforms.length > 0 && (
            <div className="rounded-md border border-border bg-bg-elevated p-3">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-text-muted">
                Recommended transforms
              </p>
              <div className="space-y-1">
                {data.recommended_transforms.map((t, i) => (
                  <p key={i} className="text-sm text-text-secondary">
                    <span className="font-mono text-accent">{t.transform}</span>
                    <span className="ml-2 text-text-muted">— {t.reason}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn";
}) {
  const valueColor =
    tone === "good" ? "text-positive" : tone === "warn" ? "text-warning" : "text-text-primary";
  return (
    <div className="rounded-md border border-border bg-bg-elevated p-3">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className={`mt-1 font-display text-lg font-medium ${valueColor}`}>{value}</p>
      {sub && <p className="font-mono text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
