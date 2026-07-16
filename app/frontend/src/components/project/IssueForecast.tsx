import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
 projectId: string;
 runId: string;
}

/**
 * Issue a completed run as the forecast of record.
 *
 * Two-step on purpose. Issuing is a commitment that will be scored later and
 * cannot be edited afterwards, so the confirmation names what that means rather
 * than asking "are you sure".
 */
export function IssueForecast({ projectId, runId }: Props) {
 const queryClient = useQueryClient();
 const [confirming, setConfirming] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [issued, setIssued] = useState(false);

 async function issue() {
 setError(null);
 const response = await fetch(`/api/projects/${projectId}/runs/${runId}/issue`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ confirm_assumptions: true }),
 });
 const body = await response.json();
 if (!response.ok) {
 setError(typeof body.detail === "string" ? body.detail : "Could not issue.");
 return;
 }
 setIssued(true);
 setConfirming(false);
 queryClient.invalidateQueries({ queryKey: ["projects", "issued", projectId] });
 queryClient.invalidateQueries({ queryKey: ["projects", "workflow", projectId] });
 }

 if (issued) {
 return (
 <p aria-live="polite" className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
 Forecast issued
 </p>
 );
 }

 return (
 <div className="grid gap-2 border-t border-border-strong/70 pt-4">
 {confirming ? (
 <div className="grid gap-2">
 <p className="max-w-2xl text-[12px] text-text-secondary">
 Issuing freezes these values and the assumptions behind them. It cannot
 be edited afterwards, and its accuracy will be scored against what
 actually happens. Have you reviewed the assumptions?
 </p>
 <div className="flex gap-2">
 <button
 type="button"
 onClick={issue}
 className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:bg-accent/10"
 >
 Confirm issue
 </button>
 <button
 type="button"
 onClick={() => setConfirming(false)}
 className="border border-border-strong/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
 >
 Cancel
 </button>
 </div>
 </div>
 ) : (
 <button
 type="button"
 onClick={() => setConfirming(true)}
 className="w-fit border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:bg-accent/10"
 >
 Issue this forecast
 </button>
 )}
 {error ? (
 <p role="alert" className="text-[12px] text-danger">
 {error}
 </p>
 ) : null}
 </div>
 );
}
