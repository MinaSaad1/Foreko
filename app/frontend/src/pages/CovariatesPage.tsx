import { useCallback, useState } from"react";
import { useParams } from"react-router-dom";
import { useMutation } from"@tanstack/react-query";
import { api } from"@/api/endpoints";
import { useDatasetStore } from"@/stores/datasetStore";
import { ColumnMapper } from"@/components/ColumnMapper";
import { FactorImpactCards } from"@/components/FactorImpactCards";
import { FactorInfluenceChart } from"@/components/FactorInfluenceChart";
import { FactorComparisonChart } from"@/components/FactorComparisonChart";
import { FactorDetailsTable } from"@/components/FactorDetailsTable";
import { PageIntro } from"@/components/common/PageIntro";
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import {
  LeftRail,
  PageHeader,
  RailChoiceGrid,
  RailResetButton,
  RailRow,
  RailSection,
  RightRail,
  ThreeRailLayout,
  WhatYoullGet,
} from "@/components/common/Rails";
import { useSyncedDataset } from"@/hooks/useSyncedDataset";
import { useHealth } from"@/hooks/useHealth";
import type { ColumnInfo, ColumnMapping } from"@/types/dataset";
import type {
 FactorAnalysisRequest,
 FactorAnalysisResponse,
 XregMode,
} from"@/types/factors";

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
 className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition-colors ${
 selected
 ?"border-accent bg-accent-dim text-accent"
 :"border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
 }`}
 >
 <span
 className={`h-2 w-2 rounded-full ${selected ?"bg-accent" :"bg-border-strong"}`}
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
 const modelReady = health?.model_status ==="ready";

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
 title="Factors"pageKey="covariates"basePath="/covariates"message="Upload a CSV with extra columns (price, weather, promos), or pick a sample to see factor analysis."
 />
 );
 }

 const numericCols =
 preview?.columns.filter(
 (c) => c.dtype ==="numeric" && c.name !== mapping?.value_col,
 ) ?? [];
 const categoricalCols =
 preview?.columns.filter((c) => c.dtype ==="categorical" || c.dtype ==="string") ?? [];

 const result = analyze.data;
 const hasSelectedFactors = numericFactors.length > 0 || categoricalFactors.length > 0;
 const displayName = preview ? preview.filename.replace(/\.[^.]+$/, "") : "Factors";

 return (
 <ThreeRailLayout
   left={
     <LeftRail ariaLabel="Factor configuration">
       <RailSection label="Dataset">
         {preview ? (
           <>
             <RailRow k="File" v={preview.filename} />
             <RailRow k="Rows" v={preview.row_count.toLocaleString()} />
           </>
         ) : (
           <p className="font-mono text-[10px] text-text-faint">Loading…</p>
         )}
       </RailSection>

       <RailSection label="Horizon">
         <RailChoiceGrid
           options={[
             { value: 4, label: "4" },
             { value: 8, label: "8" },
             { value: 12, label: "12" },
             { value: 24, label: "24" },
           ]}
           value={horizon}
           onChange={setHorizon}
           disabled={!!result}
           columns={2}
         />
       </RailSection>

       <RailSection label="Apply as">
         <RailChoiceGrid
           options={[
             { value: "additive", label: "Additive" },
             { value: "multiplicative", label: "Multiplicative" },
           ]}
           value={xregMode}
           onChange={(v) => setXregMode(v as XregMode)}
           disabled={!!result}
           columns={2}
         />
       </RailSection>

       <RailSection label="Factors">
         <RailRow k="Numeric" v={String(numericFactors.length)} />
         <RailRow k="Categorical" v={String(categoricalFactors.length)} />
       </RailSection>

       {result && <RailResetButton onClick={() => analyze.reset()} label="← Change factors" />}
     </LeftRail>
   }
   right={
     <RightRail ariaLabel="Factor insights">
       {!result && (
         <WhatYoullGet
           summary="Quantifies how external drivers like price, promotions, weather, or holidays shift the forecast compared to the no-factor baseline."
           reading={[
             "Influence bars rank factors by absolute correlation with the target.",
             "Cyan = positive driver, blue = negative.",
             "Additive vs multiplicative changes how each factor applies to the baseline.",
           ]}
         />
       )}
       {result && (
         <>
           <RailSection label="Impact">
             <RailRow
               k="Direction"
               v={result.impact.direction}
               tone={result.impact.direction === "up" ? "ok" : result.impact.direction === "down" ? "err" : "muted"}
             />
             <RailRow
               k="Delta"
               v={`${(result.impact.delta_percent * 100).toFixed(1)}%`}
               tone="accent"
             />
             {result.impact.top_driver && (
               <RailRow k="Top driver" v={result.impact.top_driver} />
             )}
           </RailSection>
           <RailSection label="Factors used">
             <RailRow k="Numeric" v={String(numericFactors.length)} />
             <RailRow k="Categorical" v={String(categoricalFactors.length)} />
           </RailSection>
         </>
       )}
     </RightRail>
   }
 >
 <PageHeader
   kicker="Drivers"
   title={displayName}
   subtitle={preview ? `${preview.row_count.toLocaleString()} rows · horizon ${horizon}` : undefined}
 />

 <div className="lg:hidden">
   <PageIntro pageKey="covariates" />
 </div>

 {result ? (
 <div className="space-y-6">
 {/* 1. Headline impact */}
 <FactorImpactCards impact={result.impact} horizon={horizon} />

 {/* 2. Forecast comparison chart */}
 <div className="rounded-panel border border-accent/30 bg-bg-surface p-5 space-y-4">
 <div className="flex items-center justify-between gap-3">
 <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 Forecast: with factors vs baseline
 </h2>
 <button
 onClick={() => setShowBaseline((v) => !v)}
 className="border border-border px-3 py-1 font-mono text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
 >
 {showBaseline ?"Hide baseline" :"Show baseline"}
 </button>
 </div>
 <FactorComparisonChart data={result} showBaseline={showBaseline} />
 </div>

 {/* 3. Factor influence bar chart */}
 {result.factors.length > 0 && (
 <div className="rounded-panel border border-border bg-bg-surface p-5 space-y-3">
 <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
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
 </div>
 ) : (
 preview && (
 <div className="rounded-panel border border-border bg-bg-surface p-6 space-y-5">
 <ColumnMapper preview={preview} value={mapping} onChange={handleMappingChange} />

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
 <p className="border border-border bg-bg-elevated px-4 py-3 text-sm text-text-muted">
 Select at least one factor above to quantify its influence on the forecast.
 </p>
 )}

 {analyze.isError && (
 <p className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly">
 {analyze.error.message}
 </p>
 )}

 <button
 onClick={() => analyze.mutate()}
 disabled={!mapping || !hasSelectedFactors || analyze.isPending || !modelReady}
 className="w-full btn-terminal-primary"
 >
 {analyze.isPending ?"Running analysis..." :"Analyze factor impact"}
 </button>
 {!modelReady && (
 <p className="text-xs text-text-muted text-center">Model still loading, the Run button will enable when it's ready.</p>
 )}
 </div>
 )
 )}
 </ThreeRailLayout>
 );
}
