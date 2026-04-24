import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { CSVUpload } from "@/components/CSVUpload";
import { ColumnMapper } from "@/components/ColumnMapper";
import ReactECharts from "echarts-for-react";
import { PageIntro } from "@/components/common/PageIntro";
import { Term } from "@/components/common/Term";
import type { ColumnMapping, DatasetPreview } from "@/types/dataset";
import type { SegmentsResult } from "@/types/phases";

export function SegmentsPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const navigate = useNavigate();
  const storePreview = useDatasetStore((s) => s.preview);
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);
  const setStorePreview = useDatasetStore((s) => s.setPreview);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [topN, setTopN] = useState(10);
  const [sortBy, setSortBy] = useState<"total" | "growth" | "volatility">("total");

  const activeId = datasetId ?? storePreview?.id;
  const { data: preview } = useQuery({
    queryKey: ["dataset-preview", activeId],
    queryFn: () => api.datasetPreview(activeId!),
    enabled: !!activeId,
    initialData: activeId === storePreview?.id ? storePreview ?? undefined : undefined,
  });
  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const runMutation = useMutation<SegmentsResult, Error>({
    mutationFn: () =>
      api.compareSegments({
        dataset_id: activeId!,
        mapping: mapping!,
        top_n: topN,
      }),
  });

  if (!activeId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-12">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Segments</h1>
        <PageIntro pageKey="segments" />
        <p className="text-text-secondary">Upload a dataset with a series ID column first.</p>
        <CSVUpload
          onUploaded={(p: DatasetPreview) => {
            setStorePreview(p);
            navigate(`/segments/${p.id}`);
          }}
        />
      </div>
    );
  }

  const data = runMutation.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Segments / Cohorts</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Compare multiple <Term k="segment">segments</Term> side-by-side. Requires a series ID column in your CSV.
        </p>
      </div>

      <PageIntro pageKey="segments" />

      {!data && (
        <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-5">
          {preview && <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />}
          <div>
            <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
              Top N segments
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={topN}
              onChange={(e) => setTopN(Math.max(1, Number(e.target.value)))}
              className="w-24 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={() => runMutation.mutate()}
            disabled={!mapping?.series_id_col || runMutation.isPending}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm text-bg-base hover:opacity-90 disabled:opacity-40"
          >
            {runMutation.isPending ? "Running…" : "Compare segments"}
          </button>
          {!mapping?.series_id_col && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Select a series ID column in the mapping above.
            </p>
          )}
          {runMutation.isError && (
            <p className="rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-xs text-anomaly">
              {runMutation.error.message}
            </p>
          )}
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
                {data.n_segments} segments
              </h3>
              <div className="flex gap-2">
                {(["total", "growth", "volatility"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`rounded-md border px-3 py-1 font-mono text-xs transition-colors ${
                      sortBy === s
                        ? "border-accent bg-accent-dim text-accent"
                        : "border-border text-text-secondary hover:border-border-strong"
                    }`}
                  >
                    by {s}
                  </button>
                ))}
              </div>
            </div>
            <SegmentRanking ranking={data.rankings[`by_${sortBy}` as keyof typeof data.rankings]} sortBy={sortBy} />
          </div>

          <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
            <h3 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
              Segment timelines
            </h3>
            <MultiLineSegments segments={data.segments.slice(0, 10)} />
          </div>

          <button
            onClick={() => runMutation.reset()}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change settings
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentRanking({ ranking, sortBy }: { ranking: { id: string; value: number }[]; sortBy: string }) {
  const fmt = (v: number) =>
    sortBy === "growth" || sortBy === "volatility" ? `${(v * 100).toFixed(1)}%` : v.toLocaleString();
  return (
    <div className="space-y-1">
      {ranking.slice(0, 10).map((r, i) => (
        <div
          key={r.id}
          className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2"
        >
          <p className="font-mono text-xs text-text-secondary">
            <span className="text-text-muted mr-2">#{i + 1}</span>
            {r.id}
          </p>
          <p className="font-mono text-sm text-accent">{fmt(r.value)}</p>
        </div>
      ))}
    </div>
  );
}

function MultiLineSegments({ segments }: { segments: SegmentsResult["segments"] }) {
  const colors = ["#00E5C8", "#4A90D9", "#22D17A", "#F5A623", "#FF4757", "#8A8F9E", "#00C4B4", "#D9A34A"];
  const series = segments.map((s, i) => ({
    name: s.id,
    type: "line",
    data: s.values.map((v, idx) => [s.dates[idx], v]),
    lineStyle: { color: colors[i % colors.length], width: 1.5 },
    itemStyle: { color: colors[i % colors.length] },
    symbol: "none",
  }));
  const option = {
    backgroundColor: "transparent",
    grid: { left: 56, right: 24, top: 24, bottom: 40, containLabel: false },
    legend: {
      data: segments.map((s) => s.id),
      textStyle: { color: "#8A8F9E", fontFamily: "DM Mono", fontSize: 10 },
      top: 0,
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "#252830" } },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisLabel: { color: "#565B6A", fontFamily: "DM Mono", fontSize: 10 },
      splitLine: { lineStyle: { color: "#252830" } },
    },
    tooltip: { trigger: "axis" },
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "slider", xAxisIndex: 0, height: 16, bottom: 0 },
    ],
    series,
  };
  return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
