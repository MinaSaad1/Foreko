import { useEffect, useRef, useState } from"react";
import { useQuery } from"@tanstack/react-query";
import { useHealth } from"@/hooks/useHealth";
import { api } from"@/api/endpoints";

export function DeviceBadge() {
 const { data, isError } = useHealth();
 const [open, setOpen] = useState(false);
 const { data: modelInfo } = useQuery({
 queryKey: ["model-info"],
 queryFn: api.modelInfo,
 refetchInterval: 5000,
 });
 const containerRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (!open) return;
 const handler = (e: MouseEvent) => {
 if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
 setOpen(false);
 }
 };
 document.addEventListener("mousedown", handler);
 return () => document.removeEventListener("mousedown", handler);
 }, [open]);

 if (isError || !data) {
 return (
 <span className="inline-flex items-center gap-2 border border-border bg-bg-elevated px-3 py-1 text-xs font-medium text-text-secondary">
 <span className="h-2 w-2 bg-anomaly" />
 Backend offline
 </span>
 );
 }

 const { device, model_status } = data;
 const kindLabel =
 device.kind ==="cuda"
 ? `GPU: ${device.name}`
 :"CPU (no GPU detected)";
 const tone =
 device.kind ==="cuda"
 ?"border-positive/40 bg-positive/10 text-positive"
 :"border-warning/40 bg-warning/10 text-warning";
 const statusDot =
 model_status ==="ready"
 ?"bg-positive"
 : model_status ==="loading"
 ?"bg-warning animate-pulse"
 :"bg-anomaly";

 return (
 <div className="relative"ref={containerRef}>
 <button
 onClick={() => setOpen((o) => !o)}
 className={`inline-flex items-center gap-2 border px-3 py-1 text-xs font-medium ${tone}`}
 title={`Model: ${model_status}`}
 >
 <span className={`h-2 w-2 ${statusDot}`} />
 {kindLabel} · {model_status}
 </button>
 {open && (
 <div className="absolute right-0 top-full mt-2 z-40 w-64 border border-border bg-bg-elevated p-3 text-sm text-text-primary shadow-[var(--shadow-elev-2)]">
 <div className="flex justify-between py-0.5">
 <span className="text-text-muted">Device</span>
 <span className="font-medium">{modelInfo?.device.name ??"-"}</span>
 </div>
 {modelInfo?.device.memory_total_mb && (
 <div className="flex justify-between py-0.5">
 <span className="text-text-muted">VRAM</span>
 <span className="font-medium">
 {modelInfo.device.memory_free_mb} / {modelInfo.device.memory_total_mb} MB
 </span>
 </div>
 )}
 <div className="flex justify-between py-0.5">
 <span className="text-text-muted">Model status</span>
 <span className="font-medium">{modelInfo?.model_status ??"-"}</span>
 </div>
 <div className="flex justify-between py-0.5">
 <span className="text-text-muted">Compile count</span>
 <span className="font-medium">{modelInfo?.compile_count ?? 0}</span>
 </div>
 <div className="flex justify-between py-0.5">
 <span className="text-text-muted">Queue depth</span>
 <span className="font-medium">{modelInfo?.queue_depth ?? 0}</span>
 </div>
 {modelInfo?.current_config && (
 <div className="flex justify-between py-0.5">
 <span className="text-text-muted">Config hash</span>
 <span className="font-mono text-xs">
 {String(modelInfo.current_config).slice(0, 8) ||"-"}
 </span>
 </div>
 )}
 </div>
 )}
 </div>
 );
}
