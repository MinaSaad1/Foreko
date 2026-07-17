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
import { EmptyDatasetState } from"@/components/common/EmptyDatasetState";
import { RunError } from"@/components/common/RunError";
import {
  ChoiceGrid,
  Depth,
  Fact,
  FactGrid,
  PageHeading,
  SecondaryActions,
  Section,
} from "@/components/common/Page";
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
   <div className="flex flex-col gap-6">
     <PageHeading
       kicker="Drivers"
       title={displayName}
       intro="Quantifies how external drivers like price, promotions, weather, or holidays shift the forecast compared to the no-factor baseline."
     />

     {/* Direction, delta, and top driver are not repeated here: FactorImpactCards
         is the one place that reports them. "Applied as" is here because the
         policy that produced the number was locked at run time and, until now,
         was never shown back. */}
     <FactGrid columns={result ? 3 : 2}>
       <Fact label="File" value={preview ? preview.filename : "Loading"} />
       <Fact label="Rows" value={preview ? preview.row_count.toLocaleString() : "Loading"} />
       {result && <Fact label="Horizon" value={`${horizon} periods`} />}
       {result && <Fact label="Applied as" value={xregMode} />}
       {result && <Fact label="Numeric factors" value={String(numericFactors.length)} />}
       {result && <Fact label="Category factors" value={String(categoricalFactors.length)} />}
     </FactGrid>

     {result ? (
       <>
         <FactorImpactCards impact={result.impact} horizon={horizon} />

         <Section
           title="Forecast: with factors vs baseline"
           controls={
             <button
               onClick={() => setShowBaseline((v) => !v)}
               className="border border-border px-3 py-1 font-mono text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
             >
               {showBaseline ? "Hide baseline" : "Show baseline"}
             </button>
           }
         >
           <FactorComparisonChart data={result} showBaseline={showBaseline} />
         </Section>

         {result.factors.length > 0 && (
           <Section title="Which factors matter most">
             <p className="mb-3 text-[13px] leading-relaxed text-text-secondary">
               Relative influence based on absolute correlation with the target. A ▲ marks
               a factor that moves the target up, ▼ one that moves it down.
             </p>
             <FactorInfluenceChart factors={result.factors} />
           </Section>
         )}

         {result.factors.length > 0 && <FactorDetailsTable factors={result.factors} />}
       </>
     ) : (
       preview && (
         <Section
           title="Set up factor analysis"
           controls={
             // Horizon was left-rail only, so it did not exist below 1024px.
             <div className="flex items-center gap-2">
               <span className="text-[12px] text-text-secondary">Horizon</span>
               <div className="w-[120px]">
                 <ChoiceGrid
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
               </div>
             </div>
           }
         >
           <div className="space-y-5">
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

             {/* A modelling policy with a numerical consequence, so it is stated
                 in plain prose next to the control, not hidden in a rail. */}
             <div>
               <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
                 Apply as
               </label>
               <div className="max-w-[280px]">
                 <ChoiceGrid
                   options={[
                     { value: "additive", label: "Additive" },
                     { value: "multiplicative", label: "Multiplicative" },
                   ]}
                   value={xregMode}
                   onChange={(v) => setXregMode(v as XregMode)}
                   disabled={!!result}
                   columns={2}
                 />
               </div>
               <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                 Additive vs multiplicative changes how each factor applies to the
                 baseline. It is locked once the analysis runs.
               </p>
             </div>

             {!hasSelectedFactors && (
               <p className="border border-border bg-bg-elevated px-4 py-3 text-sm text-text-muted">
                 Select at least one factor above to quantify its influence on the forecast.
               </p>
             )}

             {analyze.isError && (
               <RunError error={analyze.error} label="Factor analysis" />
             )}

             <button
               onClick={() => analyze.mutate()}
               disabled={!mapping || !hasSelectedFactors || analyze.isPending || !modelReady}
               className="w-full btn-terminal-primary"
             >
               {analyze.isPending ? "Running analysis..." : "Analyze factor impact"}
             </button>
             {!modelReady && (
               <p className="text-[13px] text-text-secondary">
                 Model still loading, the Run button enables when it&apos;s ready.
               </p>
             )}
           </div>
         </Section>
       )
     )}

     <Depth label="Reading the result">
       <ul className="space-y-2 text-[13px] leading-relaxed text-text-secondary">
         {[
           "Influence bars rank factors by absolute correlation with the target.",
           "▲ means the factor moves the target up, ▼ means it moves it down. Correlation is association, not proof of cause.",
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

     {result && (
       <SecondaryActions>
         <button type="button" onClick={() => analyze.reset()} className="btn-terminal">
           Change factors
         </button>
       </SecondaryActions>
     )}
   </div>
 );
}
