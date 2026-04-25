import { useCallback, useState } from"react";
import { useParams } from"react-router-dom";
import { useMutation } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import { ColumnMapper } from"@/components/ColumnMapper";
import { MethodAgreementMatrix } from"@/components/anomaly/MethodAgreementMatrix";
import { RootCauseHints } from"@/components/anomaly/RootCauseHints";
import { PageIntro } from"@/components/common/PageIntro";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import { Term } from"@/components/common/Term";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import type { ColumnInfo, ColumnMapping } from"@/types/dataset";
import type {
  AnomalyMethodsResult,
  ChangepointsResult,
  LagResult,
  RootCauseResult,
  GrangerRow,
} from"@/types/phases";
import ReactECharts from"echarts-for-react";
import { useChartTheme } from"@/charts/theme";

export function ExplainPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [numericFactors, setNumericFactors] = useState<string[]>([]);
  const [categoricalFactors, setCategoricalFactors] = useState<string[]>([]);

  const { activeId, preview } = useSyncedDataset(datasetId);

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const anomalyMethods = useMutation<AnomalyMethodsResult, Error>({
    mutationFn: () => api.detectAnomalyMethods({ dataset_id: activeId!, mapping: mapping! }),
  });
  const rootCause = useMutation<RootCauseResult, Error>({
    mutationFn: () =>
      api.explainAnomalies({
        dataset_id: activeId!,
        mapping: mapping!,
        anomaly_dates: (anomalyMethods.data?.records ?? []).map((r) => r.date),
        numeric_factors: numericFactors,
        categorical_factors: categoricalFactors,
      }),
  });
  const changepoints = useMutation<ChangepointsResult, Error>({
    mutationFn: () => api.detectChangepoints({ dataset_id: activeId!, mapping: mapping!, penalty: 10 }),
  });
  const lagMutation = useMutation<{ results: LagResult[]; max_lag: number }, Error>({
    mutationFn: () =>
      api.lagAnalysis({
        dataset_id: activeId!,
        mapping: mapping!,
        numeric_factors: numericFactors,
        max_lag: 14,
      }),
  });
  const grangerMutation = useMutation<{ results: GrangerRow[] }, Error>({
    mutationFn: () =>
      api.grangerTests({
        dataset_id: activeId!,
        mapping: mapping!,
        numeric_factors: numericFactors,
        max_lag: 5,
      }),
  });

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Explain Your Data"
        pageKey="explain"
        basePath="/explain"
      />
    );
  }

  const numericCols: ColumnInfo[] =
    preview?.columns.filter((c) => c.dtype ==="numeric" && c.name !== mapping?.value_col) ?? [];
  const categoricalCols: ColumnInfo[] =
    preview?.columns.filter((c) => c.dtype ==="categorical" || c.dtype ==="string") ?? [];

  const toggle = (col: string, kind:"num" |"cat") => {
    if (kind ==="num") {
      setNumericFactors((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
    } else {
      setCategoricalFactors((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Explain Your Data</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Multi-method <Term k="severity">anomaly detection</Term>,{""}
          <Term k="changepoint">changepoints</Term>, <Term k="lag">lag analysis</Term>, and{""}
          <Term k="granger">Granger causality</Term>, all in one place.
        </p>
      </div>

      <PageIntro pageKey="explain" />

      <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-4">
        {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}

        {numericCols.length > 0 && (
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
              Numeric factors (for root-cause, lag, Granger)
            </p>
            <div className="flex flex-wrap gap-2">
              {numericCols.map((c) => (
                <button
                  key={c.name}
                  onClick={() => toggle(c.name,"num")}
                  className={`border px-3 py-1 font-mono text-xs transition-colors ${
                    numericFactors.includes(c.name)
                      ?"border-accent bg-accent-dim text-accent"
                      :"border-border text-text-secondary hover:border-border-strong"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {categoricalCols.length > 0 && (
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
              Category factors
            </p>
            <div className="flex flex-wrap gap-2">
              {categoricalCols.map((c) => (
                <button
                  key={c.name}
                  onClick={() => toggle(c.name,"cat")}
                  className={`border px-3 py-1 font-mono text-xs transition-colors ${
                    categoricalFactors.includes(c.name)
                      ?"border-accent bg-accent-dim text-accent"
                      :"border-border text-text-secondary hover:border-border-strong"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => anomalyMethods.mutate()}
            disabled={!mapping || anomalyMethods.isPending}
            className="btn-terminal-primary"
          >
            {anomalyMethods.isPending ?"Running…" :"Detect anomalies (5 methods)"}
          </button>
          <button
            onClick={() => changepoints.mutate()}
            disabled={!mapping || changepoints.isPending}
            className="btn-terminal"
          >
            {changepoints.isPending ?"Running…" :"Detect changepoints"}
          </button>
          <button
            onClick={() => lagMutation.mutate()}
            disabled={!mapping || !numericFactors.length || lagMutation.isPending}
            className="btn-terminal"
          >
            {lagMutation.isPending ?"Running…" :"Lag analysis"}
          </button>
          <button
            onClick={() => grangerMutation.mutate()}
            disabled={!mapping || !numericFactors.length || grangerMutation.isPending}
            className="btn-terminal"
          >
            {grangerMutation.isPending ?"Running…" :"Granger causality"}
          </button>
          <button
            onClick={() => rootCause.mutate()}
            disabled={
              !mapping ||
              !anomalyMethods.data ||
              rootCause.isPending ||
              (!numericFactors.length && !categoricalFactors.length)
            }
            className="btn-terminal"
          >
            {rootCause.isPending ?"Running…" :"Find root cause"}
          </button>
        </div>
      </div>

      {anomalyMethods.data && (
        <>
          <MethodAgreementMatrix
            methods={anomalyMethods.data.methods}
            matrix={anomalyMethods.data.agreement_matrix}
            counts={anomalyMethods.data.method_counts}
          />
          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
              Top anomalies (by vote)
            </p>
            <div className="max-h-64 overflow-auto">
              <table className="terminal-table">
                <thead className="border-border">
                  <tr>
                    <th className="px-3 py-1 text-left font-mono text-xs uppercase tracking-widest">Date</th>
                    <th className="px-3 py-1 text-right font-mono text-xs uppercase tracking-widest">Value</th>
                    <th className="px-3 py-1 text-center font-mono text-xs uppercase tracking-widest">Votes</th>
                    <th className="px-3 py-1 text-left font-mono text-xs uppercase tracking-widest">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {[...anomalyMethods.data.records]
                    .sort((a, b) => b.votes - a.votes)
                    .slice(0, 30)
                    .map((r) => (
                      <tr key={r.index} className="border-b border-border/40 hover:bg-bg-elevated">
                        <td className="px-3 py-1 font-mono">{r.date}</td>
                        <td className="px-3 py-1 text-right text-text-secondary">
                          {r.value.toFixed(1)}
                        </td>
                        <td className="px-3 py-1 text-center text-accent">{r.votes}/5</td>
                        <td className="px-3 py-1 text-xs">{r.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {rootCause.data && <RootCauseHints data={rootCause.data} />}

      {changepoints.data && (
        <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
          <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
            Changepoints detected: {changepoints.data.changepoints.length}
          </h3>
          <div className="flex flex-wrap gap-2">
            {changepoints.data.changepoints.map((c) => (
              <div
                key={c.index}
                className={`border px-3 py-2 font-mono text-xs ${
                  c.direction ==="up"
                    ?"border-positive/40 bg-positive/5 text-positive"
                    :"border-anomaly/40 bg-anomaly/5 text-anomaly"
                }`}
              >
                {c.date} · {c.direction ==="up" ?"▲" :"▼"}{""}
                {(c.shift_percent * 100).toFixed(0)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {lagMutation.data && <LagCharts data={lagMutation.data.results} />}

      {grangerMutation.data && (
        <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
          <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
            Granger causality (factor → target)
          </h3>
          <table className="terminal-table">
            <thead className="border-border">
              <tr>
                <th className="px-3 py-1 text-left font-mono text-xs uppercase tracking-widest">
                  Factor
                </th>
                <th className="px-3 py-1 text-right font-mono text-xs uppercase tracking-widest">
                  Best lag
                </th>
                <th className="px-3 py-1 text-right font-mono text-xs uppercase tracking-widest">
                  p-value
                </th>
                <th className="px-3 py-1 text-center font-mono text-xs uppercase tracking-widest">
                  Causal?
                </th>
              </tr>
            </thead>
            <tbody>
              {grangerMutation.data.results.map((r) => (
                <tr key={r.factor} className="border-b border-border/40">
                  <td className="px-3 py-1 font-mono">{r.factor}</td>
                  <td className="px-3 py-1 text-right text-text-secondary">{r.best_lag}</td>
                  <td className="px-3 py-1 text-right text-text-secondary">
                    {r.p_value.toFixed(4)}
                  </td>
                  <td className="px-3 py-1 text-center">
                    {r.causal ? (
                      <span className="border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs text-positive">
                        yes
                      </span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LagCharts({ data }: { data: LagResult[] }) {
  const t = useChartTheme();
  if (!data.length) return null;
  return (
    <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
      <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
        Lag analysis (cross-correlation)
      </h3>
      <p className="text-xs text-text-muted">
        Positive lag means the factor leads the target. Peak height = strength.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.map((r) => {
          const option = {
            backgroundColor:"transparent",
            grid: { left: 40, right: 16, top: 24, bottom: 24, containLabel: false },
            title: {
              text: `${r.factor} · peak lag=${r.peak_lag} (${r.peak_corr.toFixed(2)})`,
              textStyle: { color: t.textPrimary, fontFamily:"JetBrains Mono", fontSize: 11 },
              top: 0,
              left: 0,
            },
            xAxis: {
              type:"category",
              data: r.lags.map((l) => l.lag),
              axisLine: { lineStyle: { color: t.grid } },
              axisLabel: { color: t.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
            },
            yAxis: {
              type:"value",
              min: -1,
              max: 1,
              axisLine: { show: false },
              axisLabel: { color: t.axisLabel, fontFamily:"JetBrains Mono", fontSize: 10 },
              splitLine: { lineStyle: { color: t.grid } },
            },
            tooltip: { trigger:"axis" },
            series: [
              {
                type:"bar",
                data: r.lags.map((l) => l.corr),
                barMaxWidth: 8,
                itemStyle: {
                  color: (p: { value: number }) => (p.value >= 0 ? t.accent : t.anomaly),
                },
              },
            ],
          };
          return <ReactECharts key={r.factor} option={option} style={{ height: 180, width:"100%" }} notMerge />;
        })}
      </div>
    </div>
  );
}
