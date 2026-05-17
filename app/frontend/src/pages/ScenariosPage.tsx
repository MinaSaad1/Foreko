import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ColumnMapper } from "@/components/ColumnMapper";
import ReactECharts from "echarts-for-react";
import { useChartTheme } from "@/charts/theme";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { Term } from "@/components/common/Term";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import { useScenariosOrchestrator } from "@/hooks/useScenariosOrchestrator";
import type { ColumnInfo } from "@/types/dataset";
import type { ScenarioRunResult, ScenarioCompareResult } from "@/types/phases";

export function ScenariosPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";

  const {
    mapping,
    handleMappingChange,
    horizon,
    setHorizon,
    numericFactors,
    setNumericFactors,
    overrides,
    setOverrides,
    counterfactuals,
    setCounterfactuals,
    label,
    setLabel,
    selectedForCompare,
    toggleSelectedForCompare,
    listQuery,
    runMutation,
    saveMutation,
    compareMutation,
    deleteScenario,
  } = useScenariosOrchestrator(activeId);

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="What-If Scenarios"
        pageKey="scenarios"
        basePath="/scenarios"
      />
    );
  }

  const numericCols: ColumnInfo[] =
    preview?.columns.filter((c) => c.dtype === "numeric" && c.name !== mapping?.value_col) ?? [];

  const scenarios = listQuery.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">What-If Scenarios</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Set future <Term k="factor">factor</Term> values, save named{" "}
          <Term k="scenarios">scenarios</Term>, and compare them side-by-side.
        </p>
      </div>

      <PageIntro pageKey="scenarios" />

      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-5">
        {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

        <div>
          <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
            Horizon
          </label>
          <input
            type="number"
            min={1}
            max={256}
            value={horizon}
            onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
            className="w-24 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
        </div>

        {numericCols.length > 0 && (
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
              Factors to manipulate
            </p>
            <div className="space-y-3">
              {numericCols.map((c) => {
                const active = numericFactors.includes(c.name);
                const cfActive = counterfactuals.includes(c.name);
                const override = overrides[c.name] ?? { value: 0, mode: "flat" as const };
                return (
                  <div
                    key={c.name}
                    className={`border p-3 ${active ? "border-accent/40 bg-accent-dim/30" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 font-mono text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() =>
                            setNumericFactors((prev) =>
                              prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name],
                            )
                          }
                        />
                        {c.name}
                      </label>
                      <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-text-muted">
                        <input
                          type="checkbox"
                          checked={cfActive}
                          onChange={() =>
                            setCounterfactuals((prev) =>
                              prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name],
                            )
                          }
                        />
                        Counterfactual (zero out)
                      </label>
                    </div>
                    {active && !cfActive && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <select
                          value={override.mode}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [c.name]: { ...(prev[c.name] ?? { value: 0, mode: "flat" }), mode: e.target.value as "flat" | "ramp" },
                            }))
                          }
                          className="border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
                        >
                          <option value="flat">Flat value</option>
                          <option value="ramp">Ramp to value</option>
                        </select>
                        <input
                          type="number"
                          value={override.value}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [c.name]: { ...(prev[c.name] ?? { value: 0, mode: "flat" }), value: Number(e.target.value) },
                            }))
                          }
                          className="w-28 border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
                          placeholder="start"
                        />
                        {override.mode === "ramp" && (
                          <input
                            type="number"
                            value={override.rampTo ?? override.value}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [c.name]: { ...(prev[c.name] ?? { value: 0, mode: "flat" }), rampTo: Number(e.target.value) },
                              }))
                            }
                            className="w-28 border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
                            placeholder="end"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => runMutation.mutate()}
            disabled={!mapping || runMutation.isPending || !modelReady}
            className="btn-terminal-primary"
          >
            {runMutation.isPending ? "Running..." : "Run scenario"}
          </button>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Scenario label"
            className="flex-1 border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!label || !mapping || saveMutation.isPending}
            className="btn-terminal"
          >
            Save
          </button>
        </div>
        {!modelReady && (
          <p className="text-xs text-text-muted">Model still loading, the Run button will enable when it's ready.</p>
        )}
      </div>

      {runMutation.data && <ScenarioResultChart data={runMutation.data} />}

      {scenarios && scenarios.length > 0 && (
        <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
              Saved scenarios ({scenarios.length})
            </h3>
            <button
              onClick={() => compareMutation.mutate()}
              disabled={selectedForCompare.length < 2 || compareMutation.isPending}
              className="btn-terminal py-1.5 px-3 text-[10px]"
            >
              Compare selected ({selectedForCompare.length})
            </button>
          </div>
          <div className="space-y-1">
            {scenarios.map((s) => (
              <label
                key={s.id}
                className="flex items-center justify-between border border-border bg-bg-elevated px-3 py-2 hover:border-border-strong"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedForCompare.includes(s.id)}
                    onChange={() => toggleSelectedForCompare(s.id)}
                  />
                  <p className="font-mono text-sm text-text-primary">{s.label}</p>
                  <p className="font-mono text-xs text-text-muted">{s.created_at}</p>
                </div>
                <button
                  onClick={() => deleteScenario(s.id)}
                  className="font-mono text-xs text-text-muted hover:text-anomaly"
                >
                  delete
                </button>
              </label>
            ))}
          </div>
        </div>
      )}

      {compareMutation.data && <ScenarioCompareChart data={compareMutation.data} />}
    </div>
  );
}

function ScenarioResultChart({ data }: { data: ScenarioRunResult }) {
  const t = useChartTheme();
  const allDates = [...data.historical_dates, ...data.forecast_dates];
  const histSeries = data.historical_values.map((v, i) => [data.historical_dates[i], v]);
  const fcSeries = data.forecast.map((v, i) => [data.forecast_dates[i], v]);
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 24, bottom: 48, containLabel: false },
      xAxis: {
        type: "category",
        data: allDates,
        axisLine: { lineStyle: { color: t.grid } },
        axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10, rotate: 30, formatter: (v: string) => v.slice(0, 7) },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
        splitLine: { lineStyle: { color: t.grid } },
      },
      tooltip: { trigger: "axis" },
      dataZoom: [
        { type: "inside", xAxisIndex: 0 },
        { type: "slider", xAxisIndex: 0, height: 16, bottom: 8, handleStyle: { color: t.accent } },
      ],
      series: [
        { name: "Historical", type: "line", data: histSeries, lineStyle: { color: t.historical, width: 2 }, symbol: "none" },
        { name: "Scenario", type: "line", data: fcSeries, lineStyle: { color: t.accent, width: 2 }, symbol: "none" },
      ],
    }),
    [allDates, histSeries, fcSeries, t],
  );
  return (
    <div className="rounded-panel border border-accent/30 bg-bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
          Scenario forecast
        </h3>
        <p className="font-mono text-xs text-accent">Total: {data.total.toFixed(0)}</p>
      </div>
      <ReactECharts option={option} style={{ height: 300, width: "100%" }} notMerge />
    </div>
  );
}

function ScenarioCompareChart({ data }: { data: ScenarioCompareResult }) {
  const t = useChartTheme();
  const colors = [t.accent, t.neutral, t.positive, t.warning, t.anomaly];
  const histSeries = data.historical_values.map((v, i) => [data.historical_dates[i], v]);
  const allDates = [
    ...data.historical_dates,
    ...(data.scenarios[0]?.forecast_dates ?? []),
  ];
  const series = [
    {
      name: "Historical",
      type: "line",
      data: histSeries,
      lineStyle: { color: t.historical, width: 2 },
      symbol: "none",
    },
    ...data.scenarios.map((s, i) => ({
      name: s.label,
      type: "line",
      data: s.forecast.map((v, idx) => [s.forecast_dates[idx], v]),
      lineStyle: { color: colors[i % colors.length], width: 2 },
      itemStyle: { color: colors[i % colors.length] },
      symbol: "none",
    })),
  ];

  return (
    <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
      <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
        Scenario comparison
      </h3>
      <div className="flex flex-wrap gap-3">
        {data.scenarios.map((s, i) => (
          <div
            key={s.id}
            className="border border-border bg-bg-elevated px-3 py-2"
            style={{ borderLeftColor: colors[i % colors.length], borderLeftWidth: 3 }}
          >
            <p className="font-mono text-xs text-text-primary">{s.label}</p>
            <p className="font-mono text-xs text-text-muted">
              total {s.total.toFixed(0)} · Δ {(s.delta_pct_vs_first * 100).toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
      <ReactECharts
        option={{
          backgroundColor: "transparent",
          grid: { left: 56, right: 24, top: 24, bottom: 48, containLabel: false },
          xAxis: {
            type: "category",
            data: allDates,
            axisLine: { lineStyle: { color: t.grid } },
            axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10, rotate: 30, formatter: (v: string) => v.slice(0, 7) },
          },
          yAxis: {
            type: "value",
            axisLine: { show: false },
            axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
            splitLine: { lineStyle: { color: t.grid } },
          },
          tooltip: { trigger: "axis" },
          legend: {
            data: ["Historical", ...data.scenarios.map((s) => s.label)],
            textStyle: { color: t.textSecondary, fontFamily: "JetBrains Mono", fontSize: 10 },
            top: 0,
            right: 16,
          },
          dataZoom: [
            { type: "inside", xAxisIndex: 0 },
            { type: "slider", xAxisIndex: 0, height: 16, bottom: 8 },
          ],
          series,
        }}
        style={{ height: 360, width: "100%" }}
        notMerge
      />
    </div>
  );
}
