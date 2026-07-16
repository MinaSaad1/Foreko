import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { RunError } from "@/components/common/RunError";
import {
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";

export function OperationsPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const queryClient = useQueryClient();
  const { activeId } = useSyncedDataset(datasetId);

  const [annoDate, setAnnoDate] = useState("");
  const [annoLabel, setAnnoLabel] = useState("");
  const [annoNote, setAnnoNote] = useState("");

  const { data: annotations } = useQuery({
    queryKey: ["annotations", activeId],
    queryFn: () => api.listAnnotations(activeId!),
    enabled: !!activeId,
  });
  const { data: analyses } = useQuery({
    queryKey: ["analyses", activeId],
    queryFn: () => api.listAnalyses(activeId!),
    enabled: !!activeId,
  });

  const createAnno = useMutation({
    mutationFn: () =>
      api.createAnnotation({
        dataset_id: activeId!,
        date: annoDate,
        label: annoLabel,
        note: annoNote || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", activeId] });
      setAnnoDate("");
      setAnnoLabel("");
      setAnnoNote("");
    },
  });

  // Deletes were fire-and-forget awaits, so a failed delete did nothing and
  // said nothing. The row stayed on screen and looked like a no-op.
  const deleteAnno = useMutation({
    mutationFn: (id: string) => api.deleteAnnotation(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["annotations", activeId] }),
  });
  const deleteAnalysis = useMutation({
    mutationFn: (id: string) => api.deleteAnalysis(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["analyses", activeId] }),
  });

  const exportPdf = useMutation({
    mutationFn: async () => {
      const annoList = annotations ?? [];
      const analysisList = analyses ?? [];

      const sections = [
        {
          heading: "Snapshot",
          body:
            analysisList.length === 0 && annoList.length === 0
              ? "Nothing saved yet, add annotations or run a backtest / diagnostics / preflight to fill this report."
              : `${annoList.length} annotation${annoList.length === 1 ? "" : "s"} and ${analysisList.length} saved analysis${analysisList.length === 1 ? "" : "es"}.`,
          kv: [
            ["Annotations", annoList.length.toString()],
            ["Saved analyses", analysisList.length.toString()],
            ["Dataset id", activeId ?? "-"],
          ] as [string, string][],
        },
        {
          heading: annoList.length ? `Annotations (${annoList.length})` : "Annotations",
          body: annoList.length
            ? undefined
            : "No annotations yet. Tag launches, promotions, or known incidents so they appear alongside forecasts.",
          table: annoList.length
            ? {
                headers: ["Date", "Label", "Note"],
                rows: annoList.map((a) => [a.date, a.label, a.note ?? ""] as (string | number)[]),
              }
            : undefined,
        },
        {
          heading: analysisList.length ? `Saved analyses (${analysisList.length})` : "Saved analyses",
          body: analysisList.length
            ? undefined
            : "No cached analyses yet. Backtest, diagnostics, and preflight runs land here automatically.",
          table: analysisList.length
            ? {
                headers: ["Kind", "Created"],
                rows: analysisList.map((a) => [a.kind, a.created_at] as (string | number)[]),
              }
            : undefined,
        },
      ];

      const blob = await api.exportPdf("Foreko, Operations report", sections);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "foreko-operations.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });

  if (!activeId) {
    return (
      <EmptyDatasetState title="Operations" pageKey="operations" basePath="/ops" />
    );
  }

  const annoCount = annotations?.length ?? 0;
  const analysisCount = analyses?.length ?? 0;
  const canAdd = !!annoDate && !!annoLabel;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        kicker="Operate"
        title="Operations"
        intro="Tag the dates that explain your data, and revisit past analyses without re-running them. An annotation marks a launch, a promotion, or an incident, so an anomaly in that window is read as the event it was."
      />

      <FactGrid columns={3}>
        <Fact label="Annotations" value={String(annoCount)} />
        <Fact label="Saved analyses" value={String(analysisCount)} />
        <Fact label="Dataset" value={activeId} />
      </FactGrid>

      <Section title="Annotations">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAdd) createAnno.mutate();
          }}
        >
          <input
            type="date"
            aria-label="Annotation date"
            value={annoDate}
            onChange={(e) => setAnnoDate(e.target.value)}
            className="border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <input
            type="text"
            aria-label="Annotation label"
            value={annoLabel}
            onChange={(e) => setAnnoLabel(e.target.value)}
            placeholder="Label (e.g. Product launch)"
            className="flex-1 min-w-[220px] border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <input
            type="text"
            aria-label="Annotation note"
            value={annoNote}
            onChange={(e) => setAnnoNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-[220px] border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <button type="submit" disabled={!canAdd} className="btn-terminal-primary">
            {createAnno.isPending ? "Adding..." : "Add annotation"}
          </button>
        </form>

        {!canAdd && (
          <p className="mt-3 text-[13px] text-text-secondary">
            A date and a label are required. The note is optional.
          </p>
        )}

        <div className="mt-3 space-y-2">
          <RunError error={createAnno.error} label="Add annotation" />
          <RunError error={deleteAnno.error} label="Delete annotation" />
        </div>

        {annotations && annotations.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {annotations.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 border border-border bg-bg-elevated px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm text-text-primary">
                    {a.date} <span className="ml-2 text-accent">{a.label}</span>
                  </span>
                  {a.note && (
                    <span className="block text-xs text-text-muted">{a.note}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => deleteAnno.mutate(a.id)}
                  disabled={deleteAnno.isPending}
                  className="shrink-0 font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-text-secondary">
            No annotations yet. Tag launches, promotions, or known incidents so they
            appear on forecast charts.
          </p>
        )}
      </Section>

      <Section title="Saved analyses">
        <RunError error={deleteAnalysis.error} label="Delete analysis" />
        {analyses && analyses.length > 0 ? (
          <ul className="space-y-1">
            {analyses.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 border border-border bg-bg-elevated px-3 py-2"
              >
                <span className="font-mono text-xs text-text-primary">
                  {a.kind}{" "}
                  <span className="text-text-muted">
                    · {new Date(a.created_at).toLocaleString()}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => deleteAnalysis.mutate(a.id)}
                  disabled={deleteAnalysis.isPending}
                  className="shrink-0 font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-secondary">
            No cached analyses yet. Backtest, Diagnostics, and Data Quality runs land
            here automatically, so you can reopen them without paying for the run twice.
          </p>
        )}
      </Section>

      <Depth label="How to use these">
        <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              Annotations mark launches, promos, or incidents, so anomalies in those
              windows are not misread as data problems.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              Saved analyses are stored automatically when you run Backtest,
              Diagnostics, or Data Quality.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent" aria-hidden>
              ▸
            </span>
            <span>
              The PDF bundles both, for sharing or for your own record of what you knew
              at the time.
            </span>
          </li>
        </ul>
      </Depth>

      <SecondaryActions>
        <button
          type="button"
          onClick={() => exportPdf.mutate()}
          disabled={exportPdf.isPending}
          className="btn-terminal"
        >
          {exportPdf.isPending ? "Building PDF..." : "Export PDF"}
        </button>
      </SecondaryActions>
      <RunError error={exportPdf.error} label="PDF export" />
    </div>
  );
}
