import { Link } from"react-router-dom";
import { useQuery } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import { ThemeToggle } from"@/components/ThemeToggle";

type Tone = "neutral" | "live" | "ok" | "warn" | "err";

function toneClass(tone: Tone): string {
 switch (tone) {
 case"live":
 return"text-accent";
 case"ok":
 return"text-positive";
 case"warn":
 return"text-warning";
 case"err":
 return"text-anomaly";
 default:
 return"text-text-primary";
 }
}

function Segment({ k, v, tone = "neutral", className = "", testId, title }: { k: string; v: string; tone?: Tone; className?: string; testId?: string; title?: string }) {
 return (
 <div
 data-testid={testId}
 title={title}
 className={`hidden md:flex items-center gap-2 border-r border-border-strong/70 px-4 ${className}`}
 >
 <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">{k}</span>
 <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${toneClass(tone)}`}>{v}</span>
 </div>
 );
}

interface StatusBarProps {
 isSidebarOpen?: boolean;
 onToggleSidebar?: () => void;
 showSidebarToggle?: boolean;
}

export function StatusBar({ isSidebarOpen, onToggleSidebar, showSidebarToggle = false }: StatusBarProps) {
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

 const activeDatasetId = useDatasetStore((s) => s.activeDatasetId);
 const { data: preview } = useQuery({
 queryKey: ["dataset-preview", activeDatasetId],
 queryFn: () => api.datasetPreview(activeDatasetId!),
 enabled: !!activeDatasetId,
 staleTime: Infinity,
 });

 const status = health?.model_status ?? "loading";
 const statusTone: Tone = status === "ready" ? "ok" : status === "error" ? "err" : "warn";
 const statusLabel = status === "ready" ? "Model ready" : status === "error" ? "Model error" : "Loading model";

 const modelId = modelInfo?.model_id ?? "timesfm-2.5-200m";
 const shortModel = modelId.replace("google/", "").toUpperCase();

 const deviceKind = health?.device?.kind === "cuda" ? "GPU" : "CPU";
 const ramMb = health?.device?.memory_total_mb;
 const ramLabel = ramMb ? `${(ramMb / 1024).toFixed(1)}GB` : "";
 const deviceLabel = ramLabel ? `${deviceKind} · ${ramLabel}` : deviceKind;

 const datasetName = preview ? preview.filename.replace(/\.[^.]+$/, "").toUpperCase() : "NONE LOADED";

 const dotColor =
 statusTone === "ok"
 ? "bg-positive"
 : statusTone === "err"
 ? "bg-anomaly"
 : "bg-warning";

 return (
 <header
 className="flex h-11 shrink-0 items-stretch bg-bg-surface border-b border-border-strong sticky top-0 z-50"role="banner"
 >
 {showSidebarToggle && (
 <button
 type="button"onClick={onToggleSidebar}
 aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
 aria-pressed={isSidebarOpen}
 title="Toggle sidebar"className="flex w-11 items-center justify-center border-r border-border-strong/70 text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
 >
 <svg className="w-4 h-4"fill="none"stroke="currentColor"viewBox="0 0 24 24"aria-hidden>
 <path strokeLinecap="square"strokeLinejoin="miter"strokeWidth={2} d="M4 5h16v14H4z M9 5v14" />
 </svg>
 </button>
 )}

 <Link
 to="/"className="flex items-center gap-2.5 px-4 border-r border-border-strong/70 hover:bg-bg-elevated transition-colors"aria-label="Foreko home"
 >
 <img
 src="/foreko-logo.png"alt=""aria-hidden="true"className="h-6 w-6 object-contain drop-shadow-[0_0_5px_rgb(var(--color-accent)/0.4)]"
 />
 <span className="font-display text-[13px] font-semibold text-text-primary tracking-wide">Foreko</span>
 </Link>

 <Segment k="ENV"v="LOCAL" />
 <Segment k="MODEL"v={shortModel} />
 <Segment k="DEVICE"v={deviceLabel} />
 <Segment k="DATASET"v={datasetName} tone={preview ? "live" : "neutral"} />

 <div className="flex-1" />

 <div className="flex items-center gap-2 border-l border-border-strong/70 px-4">
 <span className={`block h-1.5 w-1.5 ${dotColor}`} aria-hidden />
 <span className={`hidden sm:inline font-mono text-[10px] uppercase tracking-[0.18em] ${toneClass(statusTone)}`}>
 {statusLabel}
 </span>
 </div>

 <div className="flex items-center border-l border-border-strong/70 px-2">
 <ThemeToggle />
 </div>
 </header>
 );
}
