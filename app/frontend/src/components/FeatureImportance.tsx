import type { FeatureImportanceItem } from"@/types/comparison";

interface FeatureImportanceProps {
  items: FeatureImportanceItem[];
}

export function FeatureImportance({ items }: FeatureImportanceProps) {
  const top = items.slice(0, 5);
  const max = top[0]?.weight ?? 1;

  return (
    <div className="space-y-3">
      <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
        What's driving this forecast
      </p>
      {top.map((item) => {
        const pct = Math.round((item.weight / max) * 100);
        return (
          <div key={item.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{item.category}</span>
              <span className="font-mono text-text-muted">
                {Math.round(item.weight * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-bg-base overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
