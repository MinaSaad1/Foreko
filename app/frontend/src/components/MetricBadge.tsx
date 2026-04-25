import type { Confidence } from"@/types/comparison";

interface MetricBadgeProps {
  label: string;
  value: string;
  sub?: string;
}

export function MetricBadge({ label, value, sub }: MetricBadgeProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs uppercase tracking-widest text-text-muted">{label}</span>
      <span className="font-mono text-2xl font-medium text-text-primary">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export function ConfidencePill({ level }: { level: Confidence }) {
  const styles: Record<Confidence, string> = {
    High:"bg-positive/10 text-positive border-positive/20",
    Medium:"bg-warning/10 text-warning border-warning/20",
    Low:"bg-anomaly/10 text-anomaly border-anomaly/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium ${styles[level]}`}
    >
      {level}
    </span>
  );
}
