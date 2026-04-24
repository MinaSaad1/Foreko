import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHealth } from "@/hooks/useHealth";
import { api } from "@/api/endpoints";

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
      <span className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        Backend offline
      </span>
    );
  }

  const { device, model_status } = data;
  const kindLabel =
    device.kind === "cuda"
      ? `GPU: ${device.name}`
      : "CPU (no GPU detected)";
  const tone =
    device.kind === "cuda"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-amber-100 text-amber-900";
  const statusDot =
    model_status === "ready"
      ? "bg-emerald-500"
      : model_status === "loading"
        ? "bg-amber-500 animate-pulse"
        : "bg-red-500";

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tone}`}
        title={`Model: ${model_status}`}
      >
        <span className={`h-2 w-2 rounded-full ${statusDot}`} />
        {kindLabel} · {model_status}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-sm">
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Device</span><span className="font-medium">{modelInfo?.device.name ?? "—"}</span></div>
          {modelInfo?.device.memory_total_mb && (
            <div className="flex justify-between py-0.5"><span className="text-slate-500">VRAM</span><span className="font-medium">{modelInfo.device.memory_free_mb} / {modelInfo.device.memory_total_mb} MB</span></div>
          )}
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Model status</span><span className="font-medium">{modelInfo?.model_status ?? "—"}</span></div>
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Compile count</span><span className="font-medium">{modelInfo?.compile_count ?? 0}</span></div>
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Queue depth</span><span className="font-medium">{modelInfo?.queue_depth ?? 0}</span></div>
          {modelInfo?.current_config && (
            <div className="flex justify-between py-0.5"><span className="text-slate-500">Config hash</span><span className="font-mono text-xs">{String(modelInfo.current_config).slice(0, 8) || "—"}</span></div>
          )}
        </div>
      )}
    </div>
  );
}
