import { useParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { useChartTheme } from "@/charts/theme";
import { ColumnMapper } from "@/components/ColumnMapper";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { RunError } from "@/components/common/RunError";
import {
  ChoiceGrid,
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import { useSegmentsOrchestrator } from "@/hooks/useSegmentsOrchestrator";
import type { SegmentsResult } from "@/types/phases";

export function SegmentsPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";

  const {
    mapping,
    handleMappingChange,
    topN,
    setTopN,
    sortBy,
    setSortBy,
    data,
    isPending,
    isError,
    error,
    mutate,
    reset,
  } = useSegmentsOrchestrator(activeId);

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Segments / Cohorts"
        pageKey="segments"
        basePath="/segments"
        message="Upload a CSV with a series ID column, or pick a sample to explore."
      />
    );
  }

  const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Segments";

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        kicker="Compare"
        title={displayName}
        intro="Side-by-side ranking of every segment by total, growth, or volatility, plus a multi-line chart of the top series. Requires a series ID column in your CSV."
      />

      <FactGrid columns={data ? 4 : 2}>
        <Fact label="File" value={preview ? preview.filename : "Loading"} />
        <Fact label="Rows" value={preview ? preview.row_count.toLocaleString() : "Loading"} />
        {data && <Fact label="Segments" value={String(data.n_segments)} />}
        {data && (
          <Fact label="Shown" value={`Top ${Math.min(10, data.n_segments)}`} />
        )}
      </FactGrid>

      {!data && (
        <Section
          title="Set up segment comparison"
          controls={
            // Top N was left-rail only, so below 1024px it could not be
            // changed at all. It configures the run, so it sits on the run.
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-secondary">Top N</span>
              <div className="w-[120px]">
                <ChoiceGrid
                  options={[
                    { value: 5, label: "5" },
                    { value: 10, label: "10" },
                    { value: 20, label: "20" },
                    { value: 50, label: "50" },
                  ]}
                  value={topN}
                  onChange={setTopN}
                  disabled={!!data}
                  columns={2}
                />
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {preview && (
              <ColumnMapper
                preview={preview}
                value={mapping}
                onChange={handleMappingChange}
              />
            )}
            <button
              onClick={() => mutate()}
              disabled={!mapping?.series_id_col || isPending || !modelReady}
              className="w-full btn-terminal-primary"
            >
              {isPending ? "Running..." : "Compare segments"}
            </button>
            {!mapping?.series_id_col && (
              <p className="border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Select a series ID column in the mapping above.
              </p>
            )}
            {!modelReady && (
              <p className="text-[13px] text-text-secondary">
                Model still loading, the Run button enables when it&apos;s ready.
              </p>
            )}
            {isError && <RunError error={error} label="Segment comparison" />}
          </div>
        </Section>
      )}

      {data && (
        <>
          <Section
            title={`${data.n_segments} segments, ranked by ${sortBy}`}
            controls={
              // Sort re-ranks the table right below it. In the rail it was
              // invisible below 1024px, so the user could not re-sort the
              // ranking they were looking at.
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-secondary">Sort by</span>
                <div className="w-[180px]">
                  <ChoiceGrid
                    options={[
                      { value: "total", label: "Total" },
                      { value: "growth", label: "Growth" },
                      { value: "volatility", label: "Vol" },
                    ]}
                    value={sortBy}
                    onChange={(v) => setSortBy(v as "total" | "growth" | "volatility")}
                    columns={3}
                  />
                </div>
              </div>
            }
          >
            <SegmentRanking
              ranking={data.rankings[`by_${sortBy}` as keyof typeof data.rankings]}
              sortBy={sortBy}
            />
          </Section>

          <Section title="Segment timelines">
            <MultiLineSegments segments={data.segments.slice(0, 10)} />
          </Section>
        </>
      )}

      <Depth label="Reading the result">
        <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
          {[
            "Total = lifetime sum. Growth = first-to-last delta. Volatility = relative std.",
            "Sort flips the ranking instantly. The chart shows the top 10 timelines.",
            "Use Volatility to find the bumpiest series that need extra modelling.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-accent" aria-hidden>
                ▸
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Depth>

      {data && (
        <SecondaryActions>
          <button type="button" onClick={() => reset()} className="btn-terminal">
            Change settings
          </button>
        </SecondaryActions>
      )}
    </div>
  );
}

function SegmentRanking({
  ranking,
  sortBy,
}: {
  ranking: { id: string; value: number }[];
  sortBy: string;
}) {
  const fmt = (v: number) =>
    sortBy === "growth" || sortBy === "volatility"
      ? `${(v * 100).toFixed(1)}%`
      : v.toLocaleString();
  return (
    <div className="space-y-1">
      {ranking.slice(0, 10).map((r, i) => (
        <div
          key={r.id}
          className="flex items-center justify-between border border-border bg-bg-elevated px-3 py-2"
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
  const t = useChartTheme();
  const colors = [
    t.accent,
    t.neutral,
    t.positive,
    t.warning,
    t.anomaly,
    t.textMuted,
    t.alternative,
    t.historical,
  ];
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
      textStyle: { color: t.textSecondary, fontFamily: "JetBrains Mono", fontSize: 10 },
      top: 0,
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.axisLabel, fontFamily: "JetBrains Mono", fontSize: 10 },
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
      { type: "slider", xAxisIndex: 0, height: 16, bottom: 0 },
    ],
    series,
  };
  return <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />;
}
