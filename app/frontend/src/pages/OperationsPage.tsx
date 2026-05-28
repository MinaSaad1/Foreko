import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import {
  LeftRail,
  PageHeader,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
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

  const exportPdf = async () => {
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
  };

  if (!activeId) {
    return (
      <EmptyDatasetState title="Operations" pageKey="operations" basePath="/ops" />
    );
  }

  const annoCount = annotations?.length ?? 0;
  const analysisCount = analyses?.length ?? 0;

  return (
    <ThreeRailLayout
      left={
        <LeftRail ariaLabel="Operations overview">
          <RailSection label="Counts">
            <RailRow
              k="Annotations"
              v={String(annoCount)}
              tone={annoCount ? "accent" : "muted"}
            />
            <RailRow
              k="Saved analyses"
              v={String(analysisCount)}
              tone={analysisCount ? "accent" : "muted"}
            />
          </RailSection>

          <RailSection label="Dataset">
            <RailRow k="ID" v={activeId} />
          </RailSection>
        </LeftRail>
      }
      right={
        <RightRail ariaLabel="Operations insights">
          <WhatYoullGet
            summary="Tag dates on your timeline, revisit past analyses without re-running them, and export a PDF snapshot for sharing."
            reading={[
              "Annotations mark launches, promos, or incidents so anomalies in those windows aren't misread.",
              "Saved analyses are auto-stored when you run Backtest, Diagnostics, or Preflight.",
              "PDF export bundles annotations + saved analyses for sharing or archiving.",
            ]}
          />
        </RightRail>
      }
    >
      <PageHeader
        kicker="Operate"
        title="Operations"
        subtitle={`${annoCount} annotation${annoCount === 1 ? "" : "s"} · ${analysisCount} saved analys${analysisCount === 1 ? "is" : "es"}`}
        actions={
          <button onClick={exportPdf} className="btn-terminal">
            Export PDF
          </button>
        }
      />

      <div className="lg:hidden">
        <PageIntro pageKey="operations" />
      </div>

      {/* Annotations */}
      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
          Annotations
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={annoDate}
            onChange={(e) => setAnnoDate(e.target.value)}
            className="border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <input
            type="text"
            value={annoLabel}
            onChange={(e) => setAnnoLabel(e.target.value)}
            placeholder="Label (e.g. Product launch)"
            className="flex-1 min-w-[220px] border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <input
            type="text"
            value={annoNote}
            onChange={(e) => setAnnoNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-[220px] border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <button
            onClick={() => createAnno.mutate()}
            disabled={!annoDate || !annoLabel}
            className="btn-terminal-primary"
          >
            Add
          </button>
        </div>
        {annotations && annotations.length > 0 ? (
          <div className="space-y-1">
            {annotations.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border border-border bg-bg-elevated px-3 py-2"
              >
                <div>
                  <p className="font-mono text-sm text-text-primary">
                    {a.date} <span className="ml-2 text-accent">{a.label}</span>
                  </p>
                  {a.note && <p className="font-mono text-xs text-text-muted">{a.note}</p>}
                </div>
                <button
                  onClick={async () => {
                    await api.deleteAnnotation(a.id);
                    queryClient.invalidateQueries({ queryKey: ["annotations", activeId] });
                  }}
                  className="font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            No annotations yet. Tag launches, promotions, or known incidents so they appear on
            forecast charts.
          </p>
        )}
      </div>

      {/* Saved analyses */}
      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
          Saved analyses
        </h3>
        {analyses && analyses.length > 0 ? (
          <div className="space-y-1">
            {analyses.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border border-border bg-bg-elevated px-3 py-2"
              >
                <div className="font-mono text-xs text-text-primary">
                  {a.kind} · <span className="text-text-muted">{a.created_at}</span>
                </div>
                <button
                  onClick={async () => {
                    await api.deleteAnalysis(a.id);
                    queryClient.invalidateQueries({ queryKey: ["analyses", activeId] });
                  }}
                  className="font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            No cached analyses yet. Run a backtest, diagnostics, or preflight to populate.
          </p>
        )}
      </div>
    </ThreeRailLayout>
  );
}
