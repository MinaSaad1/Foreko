import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/api/client";

interface Props {
 projectId: string;
 runId: string | null;
 onClose: () => void;
}

/**
 * The exact manifest for a run: what data, what recipe, what policy, what
 * assumptions. Rendered verbatim rather than summarised, because the point is
 * to be able to check the number, not to be told about it.
 */
export function RunManifestDrawer({ projectId, runId, onClose }: Props) {
 const { data, isPending, isError, error } = useQuery({
 queryKey: ["projects", "manifest", projectId, runId],
 queryFn: () =>
 apiGet<Record<string, unknown>>(
 `/projects/${projectId}/runs/${runId}/manifest`,
 ),
 enabled: Boolean(runId),
 });

 if (!runId) return null;

 return (
 <aside
 aria-label="Run manifest"
 className="border border-border-strong/70 bg-bg-surface/60 p-4"
 >
 <div className="flex items-start justify-between gap-4">
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Run manifest
 </h2>
 <button
 type="button"
 onClick={onClose}
 className="border border-border-strong/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-text-secondary"
 >
 Close
 </button>
 </div>

 {isPending ? (
 <p className="mt-2 text-[12px] text-text-muted">Loading manifest…</p>
 ) : isError ? (
 <p role="alert" className="mt-2 text-[12px] text-danger">
 {(error as Error).message}
 </p>
 ) : (
 <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-text-secondary">
 {JSON.stringify(data, null, 2)}
 </pre>
 )}
 </aside>
 );
}
