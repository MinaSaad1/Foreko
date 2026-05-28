import { Fragment, useCallback, useEffect, useState } from"react";
import { useMutation, useQuery, useQueryClient } from"@tanstack/react-query";
import { useNavigate } from"react-router-dom";
import { toast } from"sonner";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import { DataSourceSelector } from"@/components/DataSourceSelector";
import { SamplesPicker } from"@/components/SamplesPicker";
import { PageIntro } from"@/components/common/PageIntro";
import {
  LeftRail,
  PageHeader,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
import type { DatasetSummary, DatasetPreview } from"@/types/dataset";


const ADD_PANEL_STORAGE_KEY ="foreko:dataPanelOpen";

function readAddPanelOpen(hasDatasets: boolean | null): boolean {
 if (typeof window ==="undefined") return !hasDatasets;
 try {
 const raw = window.localStorage.getItem(ADD_PANEL_STORAGE_KEY);
 if (raw ==="1") return true;
 if (raw ==="0") return false;
 } catch {
 // ignore
 }
 // No persisted choice: expanded for new users, collapsed for returning users.
 return !hasDatasets;
}

export function DataPage() {
 const navigate = useNavigate();
 const queryClient = useQueryClient();
 const setActiveDatasetId = useDatasetStore((s) => s.setActiveDatasetId);

 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [previews, setPreviews] = useState<Record<string, DatasetPreview>>({});
 const [loadingPreview, setLoadingPreview] = useState(false);

 const { data: datasets, isLoading } = useQuery({
 queryKey: ["datasets"],
 queryFn: api.listDatasets,
 });

 const hasDatasets = datasets && datasets.length > 0;

 const [addOpen, setAddOpen] = useState<boolean>(() => readAddPanelOpen(null));

 // Once we know whether the user has datasets, sync the default state if the
 // user hasn't made an explicit choice yet.
 useEffect(() => {
 if (datasets === undefined) return;
 try {
 const raw = window.localStorage.getItem(ADD_PANEL_STORAGE_KEY);
 if (raw !=="0" && raw !=="1") {
 setAddOpen(!hasDatasets);
 }
 } catch {
 // ignore
 }
 }, [datasets, hasDatasets]);

 const toggleAddOpen = useCallback(() => {
 setAddOpen((v) => {
 const next = !v;
 try {
 window.localStorage.setItem(ADD_PANEL_STORAGE_KEY, next ?"1" :"0");
 } catch {
 // ignore
 }
 return next;
 });
 }, []);

 const deleteMutation = useMutation({
 mutationFn: (id: string) => api.deleteDataset(id),
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: ["datasets"] });
 toast.success("Dataset deleted");
 },
 onError: () => toast.error("Delete failed"),
 });

 const handleUse = (d: DatasetSummary) => {
 setActiveDatasetId(d.id);
 navigate(`/compare/${d.id}`);
 };

 const handleExpand = async (id: string) => {
 if (expandedId === id) {
 setExpandedId(null);
 return;
 }
 setExpandedId(id);
 if (!previews[id]) {
 setLoadingPreview(true);
 try {
 const preview = await api.datasetPreview(id);
 setPreviews((p) => ({ ...p, [id]: preview }));
 } catch {
 toast.error("Failed to load preview");
 } finally {
 setLoadingPreview(false);
 }
 }
 };

 const handleDatasetReady = (preview: DatasetPreview) => {
 setActiveDatasetId(preview.id);
 queryClient.invalidateQueries({ queryKey: ["datasets"] });
 navigate(`/compare/${preview.id}`);
 };

 const totalRows = (datasets ?? []).reduce((sum, d) => sum + d.row_count, 0);
 const totalBytes = (datasets ?? []).reduce((sum, d) => sum + d.size_bytes, 0);

 return (
 <ThreeRailLayout
   left={
     <LeftRail ariaLabel="Datasets overview">
       <RailSection label="Library">
         <RailRow k="Datasets" v={String(datasets?.length ?? 0)} tone={hasDatasets ? "accent" : "muted"} />
         <RailRow k="Total rows" v={totalRows.toLocaleString()} />
         <RailRow k="Storage" v={`${(totalBytes / 1024).toFixed(1)} KB`} />
         <RailRow k="TTL" v="30 days" tone="muted" />
       </RailSection>
       <RailSection label="Sources">
         <RailRow k="Upload" v="CSV / Excel / JSON" />
         <RailRow k="Database" v="Postgres / MySQL / SQL Server" />
         <RailRow k="Samples" v="4 demo files" />
       </RailSection>
     </LeftRail>
   }
   right={
     <RightRail ariaLabel="Data ingest guidance">
       <WhatYoullGet
         summary="Bring in new data, browse what you've already loaded, or pick a sample to try. All data stays on this machine."
         reading={[
           "One row per time period (day, week, month).",
           "A date column and a numeric target are required. Extra columns become factors.",
           "Datasets auto-purge after 30 days unless you reuse them.",
         ]}
       />
     </RightRail>
   }
 >
 <PageHeader
   kicker="Data"
   title="Datasets"
   subtitle={hasDatasets ? `${datasets!.length} dataset${datasets!.length === 1 ? "" : "s"} · ${totalRows.toLocaleString()} rows total` : "No datasets yet"}
 />

 <div className="lg:hidden">
   <PageIntro pageKey="data" />
 </div>

 {/* Add new data — collapsible. Expanded by default for new users; collapsed
 for returning users with datasets. User choice persists. */}
 <section
 aria-label="Add new data"className="border border-accent/50 bg-bg-surface shadow-[var(--shadow-elev-1)]"
 >
 <header className="flex items-center justify-between gap-3 px-5 py-4">
 <h2 className="font-mono text-[11px] font-medium text-text-primary uppercase tracking-[0.18em]">
 {hasDatasets ? "Add new data" : "Add data to get started"}
 </h2>
 <button
 type="button"onClick={toggleAddOpen}
 aria-expanded={addOpen}
 aria-controls="data-add-panel"aria-label={addOpen ? "Hide add-data panel" : "Show add-data panel"}
 className="inline-flex h-6 w-6 items-center justify-center border border-border/60 font-mono text-[10px] text-text-muted hover:border-accent hover:text-accent focus:border-accent focus:text-accent"
 >
 {addOpen ? "–" : "+"}
 </button>
 </header>
 {addOpen && (
 <div id="data-add-panel"className="border-t border-border/40 px-5 py-4">
 <DataSourceSelector onDatasetReady={handleDatasetReady} />
 </div>
 )}
 </section>

 {/* Your datasets — only when there's at least one */}
 {isLoading ? (
 <div className="flex flex-col gap-2">
 {[1, 2, 3].map((i) => (
 <div key={i} className="h-14 w-full animate-pulse-slow bg-bg-elevated/30 border border-border/20" />
 ))}
 </div>
 ) : hasDatasets ? (
 <section aria-label="Your datasets"className="space-y-3">
 <div className="flex items-baseline justify-between gap-3 border-b border-border-strong/70 pb-2">
 <h2 className="font-mono text-[11px] font-medium text-text-primary uppercase tracking-[0.18em]">
 Your datasets
 </h2>
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
 Kept for 30 days, then auto-purged
 </p>
 </div>
 <div className="border border-border bg-bg-surface overflow-hidden">
 <table className="terminal-table">
 <colgroup>
 <col className="w-[28%]" />
 <col className="w-[10%]" />
 <col className="w-[10%]" />
 <col className="w-[22%]" />
 <col className="w-[30%]" />
 </colgroup>
 <thead className="border-border-strong bg-bg-elevated">
 <tr>
 {["Filename","Rows","Size","Uploaded",""].map((h, i) => (
 <th
 key={i}
 className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest"
 >
 {h}
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="font-mono text-xs">
 {datasets.map((d) => (
 <Fragment key={d.id}>
 <tr className="border-b border-border/40 last:border-0 hover:bg-accent/10 transition-colors group">
 <td
 className="px-4 py-3 font-medium group-hover:text-accent transition-colors truncate"title={d.filename}
 >
 {d.filename}
 </td>
 <td className="px-4 text-text-secondary">
 {d.row_count.toLocaleString()}
 </td>
 <td className="px-4 text-text-secondary">
 {(d.size_bytes / 1024).toFixed(1)} KB
 </td>
 <td
 className="px-4 py-3 text-text-muted text-xs whitespace-nowrap truncate"title={new Date(d.uploaded_at).toLocaleString()}
 >
 {new Date(d.uploaded_at).toLocaleString()}
 </td>
 <td className="px-4">
 <div className="flex gap-3 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
 <button
 onClick={() => handleExpand(d.id)}
 className={`border bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-[0.15em] transition-colors flex items-center justify-center min-w-[70px] ${
 expandedId === d.id
 ? "border-accent text-accent"
 : "border-text-muted/40 text-text-secondary hover:border-text-primary hover:text-text-primary"
 }`}
 >
 VIEW
 </button>
 <button
 onClick={() => handleUse(d)}
 className="border border-accent/40 bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-[0.15em] text-accent transition-colors hover:bg-accent hover:text-on-accent flex items-center justify-center min-w-[70px]"
 >
 USE
 </button>
 <button
 onClick={() => {
 if (confirm(`Delete ${d.filename}?`)) deleteMutation.mutate(d.id);
 }}
 className="border border-anomaly/40 bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-[0.15em] text-anomaly transition-colors hover:bg-anomaly hover:text-on-accent flex items-center justify-center min-w-[70px]"
 >
 DEL
 </button>
 </div>
 </td>
 </tr>
 {expandedId === d.id && (
 <tr className="border-b border-accent/30 bg-bg-base transition-all">
 <td colSpan={5} className="p-4">
 {loadingPreview && !previews[d.id] ? (
 <div className="animate-pulse-slow font-mono text-xs text-text-muted">
 Fetching binary log format...
 </div>
 ) : previews[d.id] ? (
 <div className="overflow-auto border border-border/50 bg-bg-surface max-h-64 shadow-[inset_0_4px_16px_rgb(var(--color-text-primary)/0.08)]">
 <table className="terminal-table">
 <thead className="bg-bg-elevated border-border/80 text-text-secondary sticky top-0 z-10 shadow-sm">
 <tr>
 {previews[d.id].columns.map((c) => (
 <th
 key={c.name}
 className="px-4 font-medium tracking-wide"
 >
 {c.name}
 <span className="ml-2 text-accent/50 text-xs uppercase tracking-widest">
 {c.dtype}
 </span>
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {previews[d.id].first_rows.map((row, rIdx) => (
 <tr
 key={rIdx}
 className="border-b border-border/20 last:border-0 hover:bg-accent/10 transition-colors"
 >
 {previews[d.id].columns.map((c) => (
 <td
 key={c.name}
 className="px-4 py-1.5"title={String(row[c.name])}
 >
 {String(row[c.name] ??"null")}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 ) : (
 <div className="text-anomaly font-mono text-xs">
 ERR_NO_TARGET_BUFFER_FOUND
 </div>
 )}
 </td>
 </tr>
 )}
 </Fragment>
 ))}
 </tbody>
 </table>
 </div>
 </section>
 ) : null}

 <SamplesPicker />

 {/* Onboarding helpers, only shown to first-timers. */}
 {!isLoading && !hasDatasets && (
 <>
 <div className="border border-border-strong/70 bg-bg-surface p-6 space-y-4 shadow-[var(--shadow-elev-1)]">
 <h2 className="font-mono text-[11px] font-medium text-text-primary uppercase tracking-[0.18em]">
 How it works
 </h2>
 <ol className="list-decimal space-y-2 pl-5 text-[13px] text-text-secondary leading-relaxed">
 <li>Drop a CSV. A Date column and a numeric Value column is all you need.</li>
 <li>Map the columns and choose how far ahead to forecast.</li>
 <li>
 Foreko trains two models on your data, backtests them, and shows you which one
 performed better along with the forecast.
 </li>
 </ol>
 <p className="text-xs text-text-muted pt-1">
 Your data stays on this machine. Nothing is sent to the cloud.
 </p>
 </div>

 <div className="border border-border-strong/50 bg-bg-surface px-5 py-4">
 <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
 Good CSV checklist
 </p>
 <ul className="mt-2 space-y-1 text-xs text-text-secondary leading-relaxed">
 <li>• One row per time period (day, week, month).</li>
 <li>
 • A column that parses as a date (
 <code className="font-mono text-text-primary">2024-01-15</code>,{" "}
 <code className="font-mono text-text-primary">Jan 2024</code>, or Year + Month
 columns).
 </li>
 <li>
 • A numeric column: the value you want to forecast (sales, requests, usage, cost).
 </li>
 <li>
 • Optional: extra numeric or categorical columns become factors you can analyse.
 </li>
 </ul>
 </div>
 </>
 )}
 </ThreeRailLayout>
 );
}
