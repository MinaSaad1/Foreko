import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { CSVUpload } from "@/components/CSVUpload";
import { PageIntro } from "@/components/common/PageIntro";
import { Term } from "@/components/common/Term";
import type { DatasetPreview } from "@/types/dataset";

export function OperationsPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const storePreview = useDatasetStore((s) => s.preview);
  const setStorePreview = useDatasetStore((s) => s.setPreview);
  const activeId = datasetId ?? storePreview?.id;

  const [annoDate, setAnnoDate] = useState("");
  const [annoLabel, setAnnoLabel] = useState("");
  const [annoNote, setAnnoNote] = useState("");
  const [cron, setCron] = useState("0 3 * * *");
  const [alertKind, setAlertKind] = useState<"anomaly" | "drift">("anomaly");
  const [webhookUrl, setWebhookUrl] = useState("");

  const { data: annotations } = useQuery({
    queryKey: ["annotations", activeId],
    queryFn: () => api.listAnnotations(activeId!),
    enabled: !!activeId,
  });
  const { data: schedules } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.listSchedules(),
  });
  const { data: alertRules } = useQuery({
    queryKey: ["alert-rules", activeId],
    queryFn: () => api.listAlertRules(activeId),
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

  const createSchedule = useMutation({
    mutationFn: () =>
      api.createSchedule({
        dataset_id: activeId!,
        cron,
        action: { kind: "forecast_refresh" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const createAlert = useMutation({
    mutationFn: () =>
      api.createAlertRule({
        dataset_id: activeId!,
        kind: alertKind,
        config: {
          min_critical: 1,
          threshold_pct: 0.1,
          webhook_url: webhookUrl || undefined,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-rules", activeId] }),
  });

  const testWebhook = useMutation({
    mutationFn: () => api.testWebhook(webhookUrl, "Foresee test alert"),
  });

  const exportPdf = async () => {
    const annoList = annotations ?? [];
    const scheduleList = schedules ?? [];
    const ruleList = alertRules ?? [];
    const analysisList = analyses ?? [];
    const activeSchedules = scheduleList.filter((s) => s.active).length;
    const activeRules = ruleList.filter((r) => r.active).length;
    const lastRun = scheduleList
      .map((s) => s.last_run_at)
      .filter((v): v is string => !!v)
      .sort()
      .pop();

    const sections = [
      {
        heading: "Operations snapshot",
        body: analysisList.length === 0 && annoList.length === 0 && scheduleList.length === 0 && ruleList.length === 0
          ? "No operational configuration yet — add annotations, schedules, or alert rules to fill out this report."
          : `${annoList.length} annotation${annoList.length === 1 ? "" : "s"}, ${scheduleList.length} schedule${scheduleList.length === 1 ? "" : "s"} (${activeSchedules} active), ${ruleList.length} alert rule${ruleList.length === 1 ? "" : "s"} (${activeRules} active), ${analysisList.length} saved analysis${analysisList.length === 1 ? "" : "es"}.`,
        kv: [
          ["Annotations", annoList.length.toString()],
          ["Schedules (total)", scheduleList.length.toString()],
          ["Schedules (active)", activeSchedules.toString()],
          ["Last schedule run", lastRun ?? "never"],
          ["Alert rules (total)", ruleList.length.toString()],
          ["Alert rules (active)", activeRules.toString()],
          ["Saved analyses", analysisList.length.toString()],
          ["Dataset id", activeId ?? "—"],
        ] as [string, string][],
      },
      {
        heading: annoList.length ? `Annotations (${annoList.length})` : "Annotations",
        body: annoList.length ? undefined : "No annotations yet. Tag launch dates, promotions, or known incidents so they appear alongside forecasts.",
        table: annoList.length
          ? {
              headers: ["Date", "Label", "Note"],
              rows: annoList.map((a) => [a.date, a.label, a.note ?? ""] as (string | number)[]),
            }
          : undefined,
      },
      {
        heading: scheduleList.length ? `Schedules (${scheduleList.length})` : "Schedules",
        body: scheduleList.length ? undefined : "No schedules configured. Set a cron expression to refresh forecasts automatically.",
        table: scheduleList.length
          ? {
              headers: ["Cron", "Action", "Active", "Last run"],
              rows: scheduleList.map((s) => [
                s.cron,
                JSON.stringify(s.action),
                s.active ? "yes" : "no",
                s.last_run_at ?? "—",
              ] as (string | number)[]),
            }
          : undefined,
      },
      {
        heading: ruleList.length ? `Alert rules (${ruleList.length})` : "Alert rules",
        body: ruleList.length ? undefined : "No alert rules. Add one to get notified when anomalies exceed a threshold or when forecasts drift.",
        table: ruleList.length
          ? {
              headers: ["Kind", "Config", "Active", "Created"],
              rows: ruleList.map((r) => [
                r.kind,
                JSON.stringify(r.config),
                r.active ? "yes" : "no",
                r.created_at,
              ] as (string | number)[]),
            }
          : undefined,
      },
      {
        heading: analysisList.length ? `Saved analyses (${analysisList.length})` : "Saved analyses",
        body: analysisList.length ? undefined : "No cached analyses yet. Backtests, diagnostics, and preflight runs land here automatically.",
        table: analysisList.length
          ? {
              headers: ["Kind", "Created"],
              rows: analysisList.map((a) => [a.kind, a.created_at] as (string | number)[]),
            }
          : undefined,
      },
    ];

    const blob = await api.exportPdf("Foresee — Operations report", sections);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "foresee-operations.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!activeId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-12">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Operations</h1>
        <PageIntro pageKey="operations" />
        <p className="text-text-secondary">Upload a dataset first.</p>
        <CSVUpload
          onUploaded={(p: DatasetPreview) => {
            setStorePreview(p);
            navigate(`/ops/${p.id}`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Operations</h1>
          <p className="mt-1 text-sm text-text-secondary">
            <Term k="annotation">Annotations</Term> · <Term k="schedule">Schedules</Term> ·{" "}
            <Term k="alert-rule">Alerts</Term> · Share · Export — move from ad-hoc analysis to production.
          </p>
        </div>
        <button
          onClick={exportPdf}
          className="rounded-md border border-accent/30 bg-accent-dim px-3 py-2 font-mono text-xs text-accent hover:opacity-80"
        >
          Export PDF
        </button>
      </div>

      <PageIntro pageKey="operations" />

      {/* Annotations */}
      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
        <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
          Annotations
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={annoDate}
            onChange={(e) => setAnnoDate(e.target.value)}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={annoLabel}
            onChange={(e) => setAnnoLabel(e.target.value)}
            placeholder="Label (e.g. Product launch)"
            className="flex-1 min-w-[220px] rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={annoNote}
            onChange={(e) => setAnnoNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-[220px] rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => createAnno.mutate()}
            disabled={!annoDate || !annoLabel}
            className="rounded-md bg-accent px-3 py-2 font-mono text-xs text-bg-base hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {annotations && annotations.length > 0 && (
          <div className="space-y-1">
            {annotations.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
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
        )}
      </div>

      {/* Schedules */}
      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
        <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
          Schedules
        </h3>
        <p className="text-xs text-text-muted">
          Cron syntax (min hour day month dow). Example: "0 3 * * *" runs daily at 03:00.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => createSchedule.mutate()}
            className="rounded-md bg-accent px-3 py-2 font-mono text-xs text-bg-base hover:opacity-90"
          >
            Schedule refresh
          </button>
        </div>
        {schedules && schedules.length > 0 && (
          <div className="space-y-1">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
              >
                <div className="font-mono text-xs text-text-primary">
                  {s.cron} · {s.active ? "active" : "inactive"}
                  {s.last_run_at && <span className="ml-2 text-text-muted">last: {s.last_run_at}</span>}
                </div>
                <button
                  onClick={async () => {
                    await api.deleteSchedule(s.id);
                    queryClient.invalidateQueries({ queryKey: ["schedules"] });
                  }}
                  className="font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alerts */}
      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
        <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
          Alert rules
        </h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={alertKind}
            onChange={(e) => setAlertKind(e.target.value as "anomaly" | "drift")}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          >
            <option value="anomaly">Anomaly detected</option>
            <option value="drift">Forecast drift</option>
          </select>
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="Webhook URL (optional)"
            className="flex-1 min-w-[260px] rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => createAlert.mutate()}
            className="rounded-md bg-accent px-3 py-2 font-mono text-xs text-bg-base hover:opacity-90"
          >
            Add rule
          </button>
          <button
            onClick={() => testWebhook.mutate()}
            disabled={!webhookUrl || testWebhook.isPending}
            className="rounded-md border border-accent/30 bg-accent-dim px-3 py-2 font-mono text-xs text-accent hover:opacity-80 disabled:opacity-40"
          >
            {testWebhook.isPending ? "Testing…" : "Test webhook"}
          </button>
        </div>
        {testWebhook.data && (
          <p
            className={`rounded-md border px-3 py-1 text-xs ${
              testWebhook.data.ok
                ? "border-positive/30 bg-positive/10 text-positive"
                : "border-anomaly/30 bg-anomaly/10 text-anomaly"
            }`}
          >
            Webhook test: {testWebhook.data.ok ? "OK" : "Failed"}
          </p>
        )}
        {alertRules && alertRules.length > 0 && (
          <div className="space-y-1">
            {alertRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
              >
                <div className="font-mono text-xs text-text-primary">
                  {r.kind} · {JSON.stringify(r.config)}
                </div>
                <button
                  onClick={async () => {
                    await api.deleteAlertRule(r.id);
                    queryClient.invalidateQueries({ queryKey: ["alert-rules", activeId] });
                  }}
                  className="font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved analyses + share */}
      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
        <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
          Saved analyses
        </h3>
        {analyses && analyses.length > 0 ? (
          <div className="space-y-1">
            {analyses.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
              >
                <div className="font-mono text-xs text-text-primary">
                  {a.kind} · <span className="text-text-muted">{a.created_at}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const res = await api.mintShare(a.id);
                      navigator.clipboard.writeText(`/share/${res.token}`);
                      alert(`Share link copied: /share/${res.token}`);
                    }}
                    className="font-mono text-xs text-accent hover:opacity-80"
                  >
                    share link
                  </button>
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No cached analyses yet. Run a backtest, diagnostics, or preflight to populate.</p>
        )}
      </div>
    </div>
  );
}
