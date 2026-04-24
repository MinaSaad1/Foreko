import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { PageIntro } from "@/components/common/PageIntro";
import type { DatasetSummary, DatasetPreview } from "@/types/dataset";

export function DatasetsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setPreview = useDatasetStore((s) => s.setPreview);
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, DatasetPreview>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: api.listDatasets,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDataset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast.success("Dataset deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleUse = async (d: DatasetSummary) => {
    try {
      const preview = previews[d.id] || await api.datasetPreview(d.id);
      setPreview(preview);
      navigate(`/compare/${d.id}`);
    } catch {
      toast.error("Failed to load dataset");
    }
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-2xl font-semibold text-text-primary">Datasets</h1>
      <PageIntro pageKey="datasets" />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse-slow bg-bg-elevated/30 border border-border/20" />
          ))}
        </div>
      ) : !datasets?.length ? (
        <div className="rounded-panel border border-border bg-bg-surface px-8 py-12 text-center">
          <p className="text-text-muted">No datasets yet.</p>
          <a href="/upload" className="mt-2 block text-sm text-accent hover:opacity-80">
            Upload a CSV to get started
          </a>
        </div>
      ) : (
        <div className="border border-border bg-bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border-strong bg-bg-elevated">
              <tr>
                {["Filename", "Rows", "Size", "Uploaded", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {datasets.map((d) => (
                <Fragment key={d.id}>
                <tr className="border-b border-border/40 last:border-0 hover:bg-accent/5 transition-colors group">
                  <td className="px-4 py-3 font-medium text-text-primary group-hover:text-accent transition-colors">{d.filename}</td>
                  <td className="px-4 py-3 text-text-secondary">{d.row_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-secondary">{(d.size_bytes / 1024).toFixed(1)} KB</td>
                  <td className="px-4 py-3 text-text-muted text-xs uppercase">
                    {new Date(d.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleExpand(d.id)}
                        className={`group/btn border bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-widest transition-all flex items-center justify-center min-w-[70px] ${expandedId === d.id ? "border-accent text-accent" : "border-text-muted/40 text-text-secondary hover:border-text-primary hover:text-text-primary"}`}
                      >
                        VIEW <span className="opacity-0 group-hover/btn:opacity-100 absolute right-1">▌</span>
                      </button>
                      <button
                        onClick={() => handleUse(d)}
                        className="group/btn border border-accent/40 bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-widest text-accent transition-all hover:bg-accent hover:text-bg-base flex items-center justify-center min-w-[70px]"
                      >
                        USE <span className="opacity-0 group-hover/btn:opacity-100 absolute right-1">▌</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${d.filename}?`)) deleteMutation.mutate(d.id);
                        }}
                        className="group/btn border border-anomaly/40 bg-transparent px-3 py-1 font-mono text-xs uppercase tracking-widest text-anomaly transition-all hover:bg-anomaly hover:text-bg-base flex items-center justify-center min-w-[70px]"
                      >
                        DEL <span className="opacity-0 group-hover/btn:opacity-100 absolute right-1">▌</span>
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === d.id && (
                  <tr className="border-b border-accent/30 bg-bg-base transition-all">
                     <td colSpan={5} className="p-4">
                        {loadingPreview && !previews[d.id] ? (
                           <div className="animate-pulse-slow font-mono text-xs text-text-muted">Fetching binary log format...</div>
                        ) : previews[d.id] ? (
                           <div className="overflow-auto border border-border/50 bg-bg-surface/80 max-h-64 shadow-[inset_0_4px_24px_rgba(0,0,0,0.5)] no-scrollbar">
                              <table className="w-full text-xs font-mono text-left whitespace-nowrap">
                                <thead className="bg-bg-elevated border-b border-border/80 text-text-secondary sticky top-0 z-10 shadow-sm">
                                  <tr>
                                    {previews[d.id].columns.map(c => (
                                      <th key={c.name} className="px-4 py-2 font-medium tracking-wide">
                                        {c.name}
                                        <span className="ml-2 text-accent/50 text-xs uppercase tracking-widest">{c.dtype}</span>
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {previews[d.id].first_rows.map((row, rIdx) => (
                                    <tr key={rIdx} className="border-b border-border/20 last:border-0 hover:bg-accent/10 transition-colors">
                                      {previews[d.id].columns.map(c => (
                                         <td key={c.name} className="px-4 py-1.5 text-text-primary" title={String(row[c.name])}>
                                           {String(row[c.name] ?? "null")}
                                         </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                           </div>
                        ) : (
                           <div className="text-anomaly font-mono text-xs">ERR_NO_TARGET_BUFFER_FOUND</div>
                        )}
                     </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
