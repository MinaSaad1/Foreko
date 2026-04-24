import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { ColumnMapper } from "@/components/ColumnMapper";
import { FactorImpactCards } from "@/components/FactorImpactCards";
import { FactorInfluenceChart } from "@/components/FactorInfluenceChart";
import { FactorComparisonChart } from "@/components/FactorComparisonChart";
import { FactorDetailsTable } from "@/components/FactorDetailsTable";
import { PageIntro } from "@/components/common/PageIntro";
import { EmptyDatasetState } from "@/components/common/EmptyDatasetState";
import { Term } from "@/components/common/Term";
import { useSyncedDataset } from "@/hooks/useSyncedDataset";
import { useHealth } from "@/hooks/useHealth";
import type { ColumnInfo, ColumnMapping } from "@/types/dataset";
import type {
  FactorAnalysisRequest,
  FactorAnalysisResponse,
  XregMode,
} from "@/types/factors";

function FactorToggle({
  column,
  selected,
  onToggle,
}: {
  column: ColumnInfo;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        selected
          ? "border-accent bg-accent-dim text-accent"
          : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${selected ? "bg-accent" : "bg-border-strong"}`}
      />
      <span className="font-mono">{column.name}</span>
      <span className="text-xs text-text-muted">({column.dtype})</span>
      {selected && <span className="ml-auto text-xs text-text-muted">included</span>}
    </button>
  );
}

export function CovariatesPage() {
  const { datasetId } = useParams<{ datasetId?: string }>();
  const storeMapping = useDatasetStore((s) => s.mapping);
  const setStoreMapping = useDatasetStore((s) => s.setMapping);

  const [mapping, setMapping] = useState<ColumnMapping | null>(storeMapping);
  const [horizon, setHorizon] = useState(12);
  const [xregMode, setXregMode] = useState<XregMode>("additive");
  const [numericFactors, setNumericFactors] = useState<string[]>([]);
  const [categoricalFactors, setCategoricalFactors] = useState<string[]>([]);
  const [showBaseline, setShowBaseline] = useState(true);

  const { activeId, preview } = useSyncedDataset(datasetId);
  const { data: health } = useHealth();
  const modelReady = health?.model_status === "ready";

  const handleMappingChange = useCallback(
    (m: ColumnMapping) => {
      setMapping(m);
      setStoreMapping(m);
    },
    [setStoreMapping],
  );

  const toggleNumeric = (col: string) => {
    setNumericFactors((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };
  const toggleCategorical = (col: string) => {
    setCategoricalFactors((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  const analyze = useMutation<FactorAnalysisResponse, Error>({
    mutationFn: () => {
      const req: FactorAnalysisRequest = {
        dataset_id: activeId!,
        mapping: mapping!,
        horizon,
        numeric_factors: numericFactors,
        categorical_factors: categoricalFactors,
        xreg_mode: xregMode,
      };
      return api.analyzeFactors(req);
    },
  });

  if (!activeId) {
    return (
      <EmptyDatasetState
        title="Factors"
        pageKey="covariates"
        basePath="/covariates"
        message="Upload a CSV with extra columns (price, weather, promos), or pick a sample to see factor analysis."
      />
    );
  }

  const numericCols =
    preview?.columns.filter(
      (c) => c.dtype === "numeric" && c.name !== mapping?.value_col,
    ) ?? [];
  const categoricalCols =
    preview?.columns.filter((c) => c.dtype === "categorical" || c.dtype === "string") ?? [];

  const result = analyze.data;
  const hasSelectedFactors = numericFactors.length > 0 || categoricalFactors.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">
          Forecast with Factors
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Quantify how external drivers (<Term k="factor">factors</Term> like price, promotions,
          weather, holidays) <Term k="influence">influence</Term> your forecast.
        </p>
        {preview && (
          <p className="mt-1 text-sm text-text-muted font-mono">
            {preview.filename} · {preview.row_count.toLocaleString()} rows
          </p>
        )}
      </div>

      <PageIntro pageKey="covariates" />

      {result ? (
        <div className="space-y-6">
          {/* 1. Headline impact */}
          <FactorImpactCards impact={result.impact} horizon={horizon} />

          {/* 2. Forecast comparison chart */}
          <div className="rounded-panel border border-accent/30 bg-bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
                Forecast: with factors vs baseline
              </h2>
              <button
                onClick={() => setShowBaseline((v) => !v)}
                className="rounded-md border border-border px-3 py-1 font-mono text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
              >
                {showBaseline ? "Hide baseline" : "Show baseline"}
              </button>
            </div>
            <FactorComparisonChart data={result} showBaseline={showBaseline} />
          </div>

          {/* 3. Factor influence bar chart */}
          {result.factors.length > 0 && (
            <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
              <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-secondary">
                Which factors matter most
              </h2>
              <p className="text-xs text-text-muted">
                Relative influence based on absolute correlation with the target. Cyan bars = positive driver · blue bars = negative driver.
              </p>
              <FactorInfluenceChart factors={result.factors} />
            </div>
          )}

          {/* 4. Per-factor statistics table */}
          {result.factors.length > 0 && <FactorDetailsTable factors={result.factors} />}

          <button
            onClick={() => analyze.reset()}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            ← Change factors
          </button>
        </div>
      ) : (
        preview && (
          <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
            <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />

            <div className="flex items-end gap-4">
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
                  How far ahead
                </label>
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={horizon}
                  onChange={(e) => setHorizon(Math.max(1, Number(e.target.value)))}
                  className="w-32 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-1">
                  How factors apply
                </label>
                <div className="flex gap-2">
                  {(["additive", "multiplicative"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setXregMode(m)}
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                        xregMode === m
                          ? "border-accent bg-accent-dim text-accent"
                          : "border-border text-text-secondary hover:border-border-strong"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {numericCols.length > 0 && (
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
                  Numeric factors (e.g. price, temperature, spend)
                </label>
                <div className="flex flex-col gap-2">
                  {numericCols.map((c) => (
                    <FactorToggle
                      key={c.name}
                      column={c}
                      selected={numericFactors.includes(c.name)}
                      onToggle={() => toggleNumeric(c.name)}
                    />
                  ))}
                </div>
              </div>
            )}

            {categoricalCols.length > 0 && (
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
                  Category factors (e.g. promotion, holiday, segment)
                </label>
                <div className="flex flex-col gap-2">
                  {categoricalCols.map((c) => (
                    <FactorToggle
                      key={c.name}
                      column={c}
                      selected={categoricalFactors.includes(c.name)}
                      onToggle={() => toggleCategorical(c.name)}
                    />
                  ))}
                </div>
              </div>
            )}

            {!hasSelectedFactors && (
              <p className="rounded-md border border-border bg-bg-elevated px-4 py-3 text-sm text-text-muted">
                Select at least one factor above to quantify its influence on the forecast.
              </p>
            )}

            {analyze.isError && (
              <p className="rounded-md border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
                {analyze.error.message}
              </p>
            )}

            <button
              onClick={() => analyze.mutate()}
              disabled={!mapping || !hasSelectedFactors || analyze.isPending || !modelReady}
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {analyze.isPending ? "Running analysis..." : "Analyze factor impact"}
            </button>
            {!modelReady && (
              <p className="text-xs text-text-muted text-center">Model still loading, the Run button will enable when it's ready.</p>
            )}
          </div>
        )
      )}
    </div>
  );
}
