import { useEffect, useMemo, useState } from"react";
import type { ColumnMapping, DatasetPreview } from"@/types/dataset";

interface ColumnMapperProps {
 preview: DatasetPreview;
 value: ColumnMapping | null;
 onChange: (mapping: ColumnMapping) => void;
 /**
  * Mapping to start from instead of the auto-detected one. A saved project
  * revision must reopen on the columns it was saved with, otherwise editing an
  * unrelated setting would silently remap the series. Pass a stable reference:
  * a new object every render would reset the fields on every render.
  */
 initial?: ColumnMapping | null;
}

type DateMode ="single" |"year-month";

function autoDetectDateColumn(preview: DatasetPreview): string | undefined {
 const dateCol = preview.columns.find((c) => c.dtype ==="datetime");
 if (dateCol) return dateCol.name;
 return preview.columns.find((c) => /^(date|timestamp|time|ds)$/i.test(c.name))?.name;
}

function autoDetectValueColumn(preview: DatasetPreview): string | undefined {
 const numeric = preview.columns.filter((c) => c.dtype ==="numeric");
 return (
 numeric.find((c) => !/^(year|month|day|yr|mo)$/i.test(c.name))?.name ??
 numeric[0]?.name
 );
}

function detectYearMonth(preview: DatasetPreview) {
 return {
 yearCol: preview.columns.find((c) => /^(year|yr)$/i.test(c.name))?.name,
 monthCol: preview.columns.find((c) => /^(month|mo)$/i.test(c.name))?.name,
 };
}

interface Seed {
 mode: DateMode;
 dateCol: string;
 yearCol: string;
 monthCol: string;
 valueCol: string;
 seriesIdCol: string;
}

function seedFrom(preview: DatasetPreview, initial?: ColumnMapping | null): Seed {
 if (initial) {
 return {
 mode: initial.date_parts ?"year-month" :"single",
 dateCol: initial.date_col ??"",
 yearCol: initial.date_parts?.year_col ??"",
 monthCol: initial.date_parts?.month_col ??"",
 valueCol: initial.value_col,
 seriesIdCol: initial.series_id_col ??"",
 };
 }
 const ym = detectYearMonth(preview);
 return {
 mode: ym.yearCol && ym.monthCol ?"year-month" :"single",
 dateCol: autoDetectDateColumn(preview) ??"",
 yearCol: ym.yearCol ??"",
 monthCol: ym.monthCol ??"",
 valueCol: autoDetectValueColumn(preview) ??"",
 seriesIdCol:"",
 };
}

export function ColumnMapper({ preview, value, onChange, initial }: ColumnMapperProps) {
 const seed = useMemo(() => seedFrom(preview, initial), [preview, initial]);

 const [mode, setMode] = useState<DateMode>(seed.mode);
 const [dateCol, setDateCol] = useState<string>(seed.dateCol);
 const [yearCol, setYearCol] = useState<string>(seed.yearCol);
 const [monthCol, setMonthCol] = useState<string>(seed.monthCol);
 const [valueCol, setValueCol] = useState<string>(seed.valueCol);
 const [seriesIdCol, setSeriesIdCol] = useState<string>(seed.seriesIdCol);

 useEffect(() => {
 setMode(seed.mode);
 setDateCol(seed.dateCol);
 setYearCol(seed.yearCol);
 setMonthCol(seed.monthCol);
 setValueCol(seed.valueCol);
 setSeriesIdCol(seed.seriesIdCol);
 }, [seed]);

 useEffect(() => {
 if (!valueCol) return;
 if (mode ==="single" && !dateCol) return;
 if (mode ==="year-month" && (!yearCol || !monthCol)) return;
 const mapping: ColumnMapping = {
 value_col: valueCol,
 series_id_col: seriesIdCol || null,
 freq: initial?.freq ??"infer",
 ...(mode ==="single"
 ? { date_col: dateCol, date_parts: null }
 : { date_col: null, date_parts: { year_col: yearCol, month_col: monthCol } }),
 };
 if (JSON.stringify(mapping) !== JSON.stringify(value)) {
 onChange(mapping);
 }
 }, [mode, dateCol, yearCol, monthCol, valueCol, seriesIdCol, value, onChange, initial]);

 const columnOptions = preview.columns.map((c) => ({
 value: c.name,
 label: `${c.name} (${c.dtype})`,
 }));
 const numericOptions = preview.columns
 .filter((c) => c.dtype ==="numeric")
 .map((c) => ({ value: c.name, label: c.name }));

 return (
 <div className="flex flex-col gap-5">
 <div>
 <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
 Date source
 </label>
 <div className="flex gap-2">
 <button
 type="button"onClick={() => setMode("single")}
 className={`px-3 py-1.5 text-sm transition-colors ${
 mode ==="single"
 ?"bg-accent-dim text-accent border border-accent/30"
 :"border border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
 }`}
 >
 Single date column
 </button>
 <button
 type="button"onClick={() => setMode("year-month")}
 className={`px-3 py-1.5 text-sm transition-colors ${
 mode ==="year-month"
 ?"bg-accent-dim text-accent border border-accent/30"
 :"border border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
 }`}
 >
 Year + Month columns
 </button>
 </div>
 </div>

 {mode ==="single" ? (
 <Field label="Date column">
 <Select value={dateCol} onChange={setDateCol} options={columnOptions} />
 </Field>
 ) : (
 <div className="grid grid-cols-2 gap-3">
 <Field label="Year column">
 <Select value={yearCol} onChange={setYearCol} options={columnOptions} />
 </Field>
 <Field label="Month column">
 <Select value={monthCol} onChange={setMonthCol} options={columnOptions} />
 </Field>
 </div>
 )}

 <Field label="Value to forecast">
 <Select
 value={valueCol}
 onChange={setValueCol}
 options={numericOptions.length ? numericOptions : columnOptions}
 />
 </Field>

 <Field label="Series column (optional, for multi-series CSVs)">
 <Select
 value={seriesIdCol}
 onChange={setSeriesIdCol}
 options={[{ value:"", label:"- none -" }, ...columnOptions]}
 />
 </Field>
 </div>
 );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
 return (
 <label className="flex flex-col gap-1.5">
 <span className="font-mono text-xs uppercase tracking-widest text-text-muted">{label}</span>
 {children}
 </label>
 );
}

interface SelectProps {
 value: string;
 onChange: (v: string) => void;
 options: { value: string; label: string }[];
}

function Select({ value, onChange, options }: SelectProps) {
 const [isOpen, setIsOpen] = useState(false);
 const selectedLabel = options.find((o) => o.value === value)?.label || (options.length === 0 ?"(no columns)" :"Select");

 return (
 <div className="relative">
 <button
 type="button"onClick={() => setIsOpen(!isOpen)}
 onBlur={() => setTimeout(() => setIsOpen(false), 200)}
 className="w-full flex items-center justify-between border border-border/50 bg-bg-surface px-3 py-2 text-sm text-text-primary transition-all hover:border-accent/50 focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none shadow-sm"
 >
 <span className="truncate">{selectedLabel}</span>
 <span className="text-text-muted text-xs transition-transform duration-200"style={{ transform: isOpen ?"rotate(180deg)" :"rotate(0deg)" }}>▼</span>
 </button>
 
 {/* Was bg-bg-elevated/95 + backdrop-blur-2xl + rounded-b-lg. The blur was
     invisible behind a 95% opaque surface and cost a compositor layer on
     every dropdown on every page, and the radius class contradicts a
     zero-radius identity even though the token resolves it to 0. */}
 {isOpen && (
 <div role="listbox" className="absolute z-[100] mt-1.5 max-h-64 w-full overflow-y-auto border border-border/80 bg-bg-elevated py-1 shadow-[var(--shadow-elev-2)] flex flex-col no-scrollbar">
 {options.length === 0 && <div className="px-3 py-2 text-sm text-text-muted italic">(no columns)</div>}
 {options.map((o) => (
 <button
 key={o.value}
 type="button"onClick={() => {
 onChange(o.value);
 setIsOpen(false);
 }}
 role="option"
 aria-selected={o.value === value}
 className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/10 hover:text-accent transition-colors ${o.value === value ?"bg-accent/10 text-accent font-medium" :"text-text-secondary"}`}
 >
 {o.label}
 </button>
 ))}
 </div>
 )}
 </div>
 );
}
