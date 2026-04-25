import { useQuery } from"@tanstack/react-query";
import { api } from"@/api/endpoints";

function dot(color: string, isPulsing: boolean) {
  return (
    <span className="relative flex h-2 w-2">
      {isPulsing && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

export function ModelStatusBar() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 10_000,
    retry: 1,
  });

  const { data: modelInfo } = useQuery({
    queryKey: ["model-info"],
    queryFn: () => api.modelInfo(),
    refetchInterval: 10_000,
    retry: 1,
  });

  const status = health?.model_status ??"loading";
  const device = health?.device;

  const statusColor =
    status ==="ready"
      ?"bg-positive"
      : status ==="error"
        ?"bg-anomaly"
        :"bg-warning";
        
  const isPulsing = status !=="error";

  const statusLabel =
    status ==="ready" ?"Model loaded" : status ==="error" ?"Model error" :"Loading model";

  const modelId = modelInfo?.model_id ??"timesfm-2.5-200m";
  const shortId = modelId.replace("google/","");
  const deviceLabel = device?.kind ==="cuda" ?"GPU" :"CPU";
  const ramMb = device?.memory_total_mb;
  const ramLabel = ramMb ? `${(ramMb / 1024).toFixed(1)} GB` : null;

  return (
    <div className="flex items-center gap-3 font-mono text-xs text-text-muted bg-bg-surface/30 px-3 py-1.5 rounded-full border border-border/50 backdrop-blur shadow-[var(--shadow-elev-1)]">
      {dot(statusColor, isPulsing)}
      <span className="text-text-secondary">{statusLabel}</span>
      <span className="text-border-strong">|</span>
      <span>{shortId}</span>
      <span className="text-border-strong">|</span>
      <span>{deviceLabel}</span>
      {ramLabel && (
        <>
          <span className="text-border-strong">|</span>
          <span>RAM: {ramLabel}</span>
        </>
      )}
    </div>
  );
}
