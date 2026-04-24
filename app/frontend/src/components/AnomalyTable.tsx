import { useMemo, useState } from "react";
import type { ContextAnomalyRecord, Severity } from "@/types/anomaly";

interface AnomalyTableProps {
  records: ContextAnomalyRecord[];
  filename: string;
}

type SortKey = "date" | "value" | "deviation" | "z_score";
type SortDir = "asc" | "desc";
type SeverityFilter = "ALL" | Severity;

interface EnrichedRecord extends ContextAnomalyRecord {
  deviation: number;
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function AnomalyTable({ records, filename }: AnomalyTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");

  const enriched = useMemo<EnrichedRecord[]>(() => {
    return records
      .filter((r) => r.severity !== "NORMAL")
      .map((r) => {
        const expected = r.trend || 0;
        const deviation = expected !== 0 ? ((r.value - expected) / Math.abs(expected)) * 100 : 0;
        return { ...r, deviation };
      });
  }, [records]);

  const filtered = useMemo<EnrichedRecord[]>(() => {
    if (severityFilter === "ALL") return enriched;
    return enriched.filter((r) => r.severity === severityFilter);
  }, [enriched, severityFilter]);

  const sorted = useMemo<EnrichedRecord[]>(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "value") cmp = a.value - b.value;
      else if (sortKey === "deviation") cmp = Math.abs(a.deviation) - Math.abs(b.deviation);
      else if (sortKey === "z_score") cmp = Math.abs(a.z_score) - Math.abs(b.z_score);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const exportCsv = () => {
    const header = "date,value,expected,deviation_pct,z_score,severity";
    const rows = sorted.map(
      (r) =>
        `${r.date},${r.value},${r.trend.toFixed(4)},${r.deviation.toFixed(2)},${r.z_score.toFixed(4)},${r.severity}`,
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = filename.replace(/\.[^.]+$/, "");
    a.download = `${base}__anomalies.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const crit = enriched.filter((r) => r.severity === "CRITICAL").length;
    const warn = enriched.filter((r) => r.severity === "WARNING").length;
    return { crit, warn, total: enriched.length };
  }, [enriched]);

  if (enriched.length === 0) {
    return null;
  }

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="border border-border bg-bg-surface overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-elevated px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-medium text-text-primary">
            Detected anomalies
          </h3>
          <span className="font-mono text-xs text-text-muted">
            {filtered.length} of {counts.total} shown
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FilterChip
            label={`All (${counts.total})`}
            active={severityFilter === "ALL"}
            onClick={() => setSeverityFilter("ALL")}
            tone="neutral"
          />
          <FilterChip
            label={`Critical (${counts.crit})`}
            active={severityFilter === "CRITICAL"}
            onClick={() => setSeverityFilter("CRITICAL")}
            tone="critical"
          />
          <FilterChip
            label={`Warning (${counts.warn})`}
            active={severityFilter === "WARNING"}
            onClick={() => setSeverityFilter("WARNING")}
            tone="warning"
          />
          <button
            onClick={exportCsv}
            className="group/btn border border-accent/40 bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-widest text-accent transition-all hover:bg-accent hover:text-bg-base flex items-center justify-center min-w-[100px]"
          >
            EXPORT CSV <span className="opacity-0 group-hover/btn:opacity-100 absolute right-2 animate-[pulse_1s_infinite]">▌</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-border bg-bg-elevated">
            <tr>
              <th
                onClick={() => toggleSort("date")}
                className="cursor-pointer px-4 py-2 text-left font-mono text-xs uppercase tracking-widest text-text-muted hover:text-text-primary"
              >
                Date{sortIndicator("date")}
              </th>
              <th
                onClick={() => toggleSort("value")}
                className="cursor-pointer px-4 py-2 text-right font-mono text-xs uppercase tracking-widest text-text-muted hover:text-text-primary"
              >
                Value{sortIndicator("value")}
              </th>
              <th className="px-4 py-2 text-right font-mono text-xs uppercase tracking-widest text-text-muted">
                Expected
              </th>
              <th
                onClick={() => toggleSort("deviation")}
                className="cursor-pointer px-4 py-2 text-right font-mono text-xs uppercase tracking-widest text-text-muted hover:text-text-primary"
              >
                Deviation{sortIndicator("deviation")}
              </th>
              <th
                onClick={() => toggleSort("z_score")}
                className="cursor-pointer px-4 py-2 text-right font-mono text-xs uppercase tracking-widest text-text-muted hover:text-text-primary"
              >
                Z-score{sortIndicator("z_score")}
              </th>
              <th className="px-4 py-2 text-center font-mono text-xs uppercase tracking-widest text-text-muted">
                Severity
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isUp = r.deviation >= 0;
              const arrow = isUp ? "▲" : "▼";
              const arrowColor = isUp ? "text-anomaly" : "text-neutral";
              const sevColor =
                r.severity === "CRITICAL"
                  ? "border-anomaly/30 bg-anomaly/10 text-anomaly"
                  : "border-warning/30 bg-warning/10 text-warning";

              return (
                <tr
                  key={r.date}
                  className="border-b border-border/40 last:border-0 hover:bg-accent/5 transition-colors group"
                >
                  <td className="px-4 py-2 font-mono text-text-primary group-hover:text-accent transition-colors">{r.date}</td>
                  <td className="px-4 py-2 text-right font-mono text-text-primary">
                    {formatNumber(r.value)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-text-muted">
                    {formatNumber(r.trend)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${arrowColor}`}>
                    <span className="mr-1">{arrow}</span>
                    {r.deviation.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-text-secondary">
                    {r.z_score.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-xs uppercase tracking-widest ${sevColor}`}
                    >
                      {r.severity}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "critical" | "warning" | "neutral";
}) {
  const activeBase =
    tone === "critical"
      ? "border-anomaly/50 bg-anomaly/10 text-anomaly"
      : tone === "warning"
        ? "border-warning/50 bg-warning/10 text-warning"
        : "border-accent/50 bg-accent-dim text-accent";
  const inactive = "border-border text-text-secondary hover:border-border-strong hover:text-text-primary";

  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1 font-mono text-xs transition-colors ${active ? activeBase : inactive}`}
    >
      {label}
    </button>
  );
}
