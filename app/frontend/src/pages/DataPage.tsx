import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { DataSourceSelector } from "@/components/DataSourceSelector";
import { SamplesPicker } from "@/components/SamplesPicker";
import { Depth, Fact, FactGrid, PageHeading, Section } from "@/components/common/Page";
import type { DatasetSummary, DatasetPreview } from "@/types/dataset";

const ADD_PANEL_STORAGE_KEY = "foreko:dataPanelOpen";

function readAddPanelOpen(hasDatasets: boolean | null): boolean {
  if (typeof window === "undefined") return !hasDatasets;
  try {
    const raw = window.localStorage.getItem(ADD_PANEL_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
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
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [showAllVersions, setShowAllVersions] = useState(false);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: api.listDatasets,
  });

  const hasDatasets = datasets && datasets.length > 0;

  /**
   * One row per file, newest upload wins.
   *
   * Re-uploading the same file is the normal way to refresh data, and each
   * upload is a separate dataset, so the table filled with rows that were
   * identical apart from a timestamp. The older copies are still on disk and
   * still count against storage, so they are hidden, not disowned: the count
   * says how many, and the toggle brings them back so they can be deleted.
   */
  const visibleDatasets = useMemo(() => {
    if (!datasets) return [];
    if (showAllVersions) return datasets;
    const newest = new Map<string, DatasetSummary>();
    for (const d of datasets) {
      const seen = newest.get(d.filename);
      if (!seen || Date.parse(d.uploaded_at) > Date.parse(seen.uploaded_at)) {
        newest.set(d.filename, d);
      }
    }
    return [...newest.values()].sort(
      (a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at),
    );
  }, [datasets, showAllVersions]);

  const olderCopies = (datasets?.length ?? 0) - visibleDatasets.length;

  const [addOpen, setAddOpen] = useState<boolean>(() => readAddPanelOpen(null));

  // Once we know whether the user has datasets, sync the default state if the
  // user hasn't made an explicit choice yet.
  useEffect(() => {
    if (datasets === undefined) return;
    try {
      const raw = window.localStorage.getItem(ADD_PANEL_STORAGE_KEY);
      if (raw !== "0" && raw !== "1") {
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
        window.localStorage.setItem(ADD_PANEL_STORAGE_KEY, next ? "1" : "0");
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
      setPreviewErrors((e) => ({ ...e, [id]: "" }));
      try {
        const preview = await api.datasetPreview(id);
        setPreviews((p) => ({ ...p, [id]: preview }));
      } catch (err) {
        // Was ERR_NO_TARGET_BUFFER_FOUND, an invented code that told a planner
        // nothing and named no next step. Say what actually failed.
        const message = err instanceof Error ? err.message : String(err);
        setPreviewErrors((e) => ({ ...e, [id]: message }));
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

  const totalRows = visibleDatasets.reduce((sum, d) => sum + d.row_count, 0);
  // Every copy occupies disk, including the ones the table is hiding, so this
  // one counts all of them. A storage figure that only counted what is on
  // screen would understate what is actually being kept.
  const totalBytes = (datasets ?? []).reduce((sum, d) => sum + d.size_bytes, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        kicker="Data"
        title="Datasets"
        intro="Bring in new data, browse what you have already loaded, or pick a sample to try. Every file is processed on this machine and nothing is uploaded."
      />

      {hasDatasets && (
        <FactGrid>
          <Fact label="Files" value={String(visibleDatasets.length)} />
          <Fact label="Total rows" value={totalRows.toLocaleString()} />
          <Fact label="Storage on disk" value={`${(totalBytes / 1024).toFixed(1)} KB`} />
          <Fact label="Kept for" value="30 days, then purged" />
        </FactGrid>
      )}

      {/* Collapsible, and the choice persists: expanded for new users,
          collapsed for returning ones. This is the page's one good instinct
          about disclosure, so it survives the conversion unchanged. */}
      <Section
        title={hasDatasets ? "Add new data" : "Add data to get started"}
        controls={
          <button
            type="button"
            onClick={toggleAddOpen}
            aria-expanded={addOpen}
            aria-controls="data-add-panel"
            aria-label={addOpen ? "Hide add-data panel" : "Show add-data panel"}
            className="inline-flex h-6 w-6 items-center justify-center border border-border/60 font-mono text-[10px] text-text-muted hover:border-accent hover:text-accent focus:border-accent focus:text-accent"
          >
            {addOpen ? "–" : "+"}
          </button>
        }
      >
        {addOpen ? (
          <div id="data-add-panel">
            <DataSourceSelector onDatasetReady={handleDatasetReady} />
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            Upload a CSV or Excel file, or connect a database.
          </p>
        )}
      </Section>

      {isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <span className="sr-only">Loading datasets</span>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse-slow border border-border/20 bg-bg-elevated/30"
            />
          ))}
        </div>
      ) : hasDatasets ? (
        <Section
          title="Your datasets"
          controls={
            olderCopies > 0 || showAllVersions ? (
              <button
                type="button"
                onClick={() => setShowAllVersions((v) => !v)}
                aria-pressed={showAllVersions}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:text-accent"
              >
                {showAllVersions
                  ? "Show newest only"
                  : `Show ${olderCopies} older ${olderCopies === 1 ? "copy" : "copies"}`}
              </button>
            ) : undefined
          }
        >
          {olderCopies > 0 && !showAllVersions && (
            <p className="mb-3 text-[13px] text-text-secondary">
              Showing the newest upload of each file. {olderCopies} older{" "}
              {olderCopies === 1 ? "copy is" : "copies are"} hidden, still stored, and
              still counted in storage above.
            </p>
          )}
          <div className="overflow-x-auto border border-border bg-bg-surface">
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
                  {["Filename", "Rows", "Size", "Uploaded", ""].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left font-mono text-xs uppercase tracking-[0.15em]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {visibleDatasets.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="group border-b border-border/40 transition-colors last:border-0 hover:bg-accent/10">
                      <td
                        className="truncate px-4 py-3 font-medium transition-colors group-hover:text-accent"
                        title={d.filename}
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
                        className="truncate whitespace-nowrap px-4 py-3 text-xs text-text-muted"
                        title={new Date(d.uploaded_at).toLocaleString()}
                      >
                        {new Date(d.uploaded_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        {/* Not opacity-60 until hover. Using a dataset is the
                            main path on this page; it should not need to be
                            discovered by hovering.

                            No min-width here: three fixed-width buttons plus
                            gap-3 pushed this column past its 30% track and
                            scrolled the whole table sideways, clipping the
                            actions to "VI". */}
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => handleExpand(d.id)}
                            aria-expanded={expandedId === d.id}
                            className={`border bg-transparent px-2.5 py-1 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                              expandedId === d.id
                                ? "border-accent text-accent"
                                : "border-text-muted/40 text-text-secondary hover:border-text-primary hover:text-text-primary"
                            }`}
                          >
                            {expandedId === d.id ? "Hide" : "View"}
                          </button>
                          <button
                            onClick={() => handleUse(d)}
                            className="border border-accent bg-accent px-2.5 py-1 font-mono text-xs font-medium uppercase tracking-[0.1em] text-on-accent transition-colors hover:bg-transparent hover:text-accent"
                          >
                            Use
                          </button>
                          {confirmingDelete === d.id ? (
                            <>
                              <button
                                onClick={() => {
                                  deleteMutation.mutate(d.id);
                                  setConfirmingDelete(null);
                                }}
                                className="border border-anomaly bg-transparent px-2.5 py-1 font-mono text-xs uppercase tracking-[0.1em] text-anomaly transition-colors hover:bg-anomaly hover:text-on-accent"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmingDelete(null)}
                                className="border border-border-strong/70 bg-transparent px-2.5 py-1 font-mono text-xs uppercase tracking-[0.1em] text-text-secondary"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            // Was a native confirm(). V2 confirms inline, and
                            // one product should ask in one voice.
                            <button
                              onClick={() => setConfirmingDelete(d.id)}
                              aria-label={`Delete ${d.filename}`}
                              className="border border-anomaly/40 bg-transparent px-2.5 py-1 font-mono text-xs uppercase tracking-[0.1em] text-anomaly transition-colors hover:bg-anomaly hover:text-on-accent"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr className="border-b border-accent/30 bg-bg-base">
                        <td colSpan={5} className="p-4">
                          {loadingPreview && !previews[d.id] ? (
                            <p
                              className="font-mono text-xs text-text-muted"
                              role="status"
                            >
                              Loading preview...
                            </p>
                          ) : previews[d.id] ? (
                            <div className="max-h-64 overflow-auto border border-border/50 bg-bg-surface">
                              <table className="terminal-table">
                                <thead className="sticky top-0 z-10 border-border/80 bg-bg-elevated text-text-secondary">
                                  <tr>
                                    {previews[d.id].columns.map((c) => (
                                      <th key={c.name} className="px-4 font-medium tracking-wide">
                                        {c.name}
                                        <span className="ml-2 text-xs uppercase tracking-[0.15em] text-accent/50">
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
                                      className="border-b border-border/20 transition-colors last:border-0 hover:bg-accent/10"
                                    >
                                      {previews[d.id].columns.map((c) => (
                                        <td
                                          key={c.name}
                                          className="px-4 py-1.5"
                                          title={String(row[c.name])}
                                        >
                                          {String(row[c.name] ?? "null")}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p role="alert" className="text-xs text-anomaly">
                              Could not read a preview of {d.filename}.
                              {previewErrors[d.id] ? ` ${previewErrors[d.id]}` : ""} The
                              file is still stored, so you can try View again.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <SamplesPicker />

      {/* First run only. A returning user has answered these questions. */}
      {!isLoading && !hasDatasets && (
        <>
          <Section title="How it works">
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-text-secondary">
              <li>Drop a CSV. A date column and a numeric value column is all you need.</li>
              <li>Map the columns and choose how far ahead to forecast.</li>
              <li>
                Foreko trains two models on your data, backtests them, and shows which one
                performed better along with the forecast.
              </li>
            </ol>
            <p className="pt-3 text-xs text-text-muted">
              Your data stays on this machine. Nothing is sent to the cloud.
            </p>
          </Section>

          <Depth label="What makes a good CSV">
            <ul className="space-y-1 text-[13px] leading-relaxed text-text-secondary">
              <li>One row per time period (day, week, month).</li>
              <li>
                A column that parses as a date (
                <code className="font-mono text-text-primary">2024-01-15</code>,{" "}
                <code className="font-mono text-text-primary">Jan 2024</code>, or Year plus
                Month columns).
              </li>
              <li>
                A numeric column: the value you want to forecast (sales, requests, usage,
                cost).
              </li>
              <li>
                Optional: extra numeric or categorical columns become factors you can
                analyse.
              </li>
            </ul>
          </Depth>
        </>
      )}
    </div>
  );
}
