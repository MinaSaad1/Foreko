import type { FillPolicy, FactorPlanRequirements } from "@/types/factors-plan";

interface Props {
 requirements: FactorPlanRequirements;
 values: Record<string, Record<string, number | string>>;
 fillPolicies: Record<string, FillPolicy>;
 onChange: (values: Record<string, Record<string, number | string>>) => void;
 onPolicyChange: (policies: Record<string, FillPolicy>) => void;
 disabled?: boolean;
}

export function missingCells(
 requirements: FactorPlanRequirements,
 values: Record<string, Record<string, number | string>>,
 fillPolicies: Record<string, FillPolicy>,
): { covariate: string; period: string }[] {
 const missing: { covariate: string; period: string }[] = [];
 for (const covariate of requirements.required) {
 if ((fillPolicies[covariate] ?? "none") !== "none") continue;
 for (const period of requirements.periods) {
 const value = values[covariate]?.[period];
 if (value === undefined || value === "") {
 missing.push({ covariate, period });
 }
 }
 }
 return missing;
}

/**
 * Period-by-period plan for every factor the model needs in the future.
 *
 * These are business assumptions, not numbers to guess, so a gap is shown as a
 * gap. The only way to fill one is to say so explicitly.
 */
export function FutureFactorGrid({
 requirements,
 values,
 fillPolicies,
 onChange,
 onPolicyChange,
 disabled,
}: Props) {
 const missing = missingCells(requirements, values, fillPolicies);

 if (!requirements.required.length) {
 return (
 <p className="text-[12px] text-text-muted">
 This model policy needs no future factors.
 </p>
 );
 }

 function setCell(covariate: string, period: string, raw: string) {
 const next = { ...values, [covariate]: { ...(values[covariate] ?? {}) } };
 if (raw === "") delete next[covariate][period];
 else next[covariate][period] = Number.isNaN(Number(raw)) ? raw : Number(raw);
 onChange(next);
 }

 return (
 <section className="grid gap-3">
 <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
 Future factors
 </h2>
 <p className="max-w-2xl text-[12px] text-text-secondary">
 The forecast will not run until every required factor has a value for every
 period, or you choose how to fill it. Foreko does not guess these.
 </p>

 <div className="overflow-x-auto">
 <table className="w-full border-collapse text-[12px]">
 <caption className="sr-only">Future factor values by period</caption>
 <thead>
 <tr className="border-b border-border-strong/70 text-left">
 <th
 scope="col"
 className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted"
 >
 Factor
 </th>
 {requirements.periods.map((period) => (
 <th
 key={period}
 scope="col"
 className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted"
 >
 {period}
 </th>
 ))}
 <th
 scope="col"
 className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted"
 >
 If left empty
 </th>
 </tr>
 </thead>
 <tbody>
 {requirements.required.map((covariate) => {
 const policy = fillPolicies[covariate] ?? "none";
 return (
 <tr key={covariate} className="border-b border-border/30">
 <th scope="row" className="px-2 py-2 text-left text-text-primary">
 {covariate}
 <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
 {requirements.roles[covariate]?.replace(/_/g, " ")}
 </span>
 </th>
 {requirements.periods.map((period) => {
 const value = values[covariate]?.[period] ?? "";
 const isMissing = value === "" && policy === "none";
 return (
 <td key={period} className="px-1 py-1">
 <input
 aria-label={`${covariate} for ${period}`}
 value={String(value)}
 disabled={disabled}
 onChange={(e) => setCell(covariate, period, e.target.value)}
 className={`w-24 border bg-transparent px-2 py-1 text-[12px] text-text-primary ${
 isMissing ? "border-warn/70" : "border-border-strong/70"
 }`}
 />
 </td>
 );
 })}
 <td className="px-2 py-1">
 <select
 aria-label={`Fill policy for ${covariate}`}
 value={policy}
 disabled={disabled}
 onChange={(e) =>
 onPolicyChange({
 ...fillPolicies,
 [covariate]: e.target.value as FillPolicy,
 })
 }
 className="border border-border-strong/70 bg-transparent px-2 py-1 text-[12px] text-text-primary"
 >
 <option value="none">Block the forecast</option>
 <option value="forward_fill">Carry the last value</option>
 <option value="zero">Use zero</option>
 </select>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {missing.length ? (
 <p role="alert" className="text-[12px] text-warn">
 {missing.length} value{missing.length === 1 ? "" : "s"} still needed:{" "}
 {missing
 .slice(0, 4)
 .map((m) => `${m.covariate} at ${m.period}`)
 .join(", ")}
 {missing.length > 4 ? ", and more" : ""}.
 </p>
 ) : null}

 {Object.entries(fillPolicies).some(([, p]) => p !== "none") ? (
 <p role="note" className="text-[12px] text-text-secondary">
 Filled values are recorded with the run, so the assumption stays visible.
 </p>
 ) : null}
 </section>
 );
}
