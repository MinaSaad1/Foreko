import { useEffect, useMemo, useState } from "react";
import type { ColumnMapping, DatasetPreview } from "@/types/dataset";

interface ColumnMapperProps {
  preview: DatasetPreview;
  value: ColumnMapping | null;
  onChange: (mapping: ColumnMapping) => void;
}

type DateMode = "single" | "year-month";

function autoDetectDateColumn(preview: DatasetPreview): string | undefined {
  const dateCol = preview.columns.find((c) => c.dtype === "datetime");
  if (dateCol) return dateCol.name;
  return preview.columns.find((c) => /^(date|timestamp|time|ds)$/i.test(c.name))?.name;
}

function autoDetectValueColumn(preview: DatasetPreview): string | undefined {
  const numeric = preview.columns.filter((c) => c.dtype === "numeric");
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

export function ColumnMapper({ preview, value, onChange }: ColumnMapperProps) {
  const autoDate = useMemo(() => autoDetectDateColumn(preview), [preview]);
  const autoValue = useMemo(() => autoDetectValueColumn(preview), [preview]);
  const autoYM = useMemo(() => detectYearMonth(preview), [preview]);

  const defaultMode: DateMode =
    autoYM.yearCol && autoYM.monthCol ? "year-month" : "single";

  const [mode, setMode] = useState<DateMode>(defaultMode);
  const [dateCol, setDateCol] = useState<string>(autoDate ?? "");
  const [yearCol, setYearCol] = useState<string>(autoYM.yearCol ?? "");
  const [monthCol, setMonthCol] = useState<string>(autoYM.monthCol ?? "");
  const [valueCol, setValueCol] = useState<string>(autoValue ?? "");
  const [seriesIdCol, setSeriesIdCol] = useState<string>("");

  useEffect(() => {
    setMode(defaultMode);
    setDateCol(autoDate ?? "");
    setYearCol(autoYM.yearCol ?? "");
    setMonthCol(autoYM.monthCol ?? "");
    setValueCol(autoValue ?? "");
    setSeriesIdCol("");
  }, [preview, autoDate, autoValue, autoYM.yearCol, autoYM.monthCol, defaultMode]);

  useEffect(() => {
    if (!valueCol) return;
    if (mode === "single" && !dateCol) return;
    if (mode === "year-month" && (!yearCol || !monthCol)) return;
    const mapping: ColumnMapping = {
      value_col: valueCol,
      series_id_col: seriesIdCol || null,
      freq: "infer",
      ...(mode === "single"
        ? { date_col: dateCol, date_parts: null }
        : { date_col: null, date_parts: { year_col: yearCol, month_col: monthCol } }),
    };
    if (JSON.stringify(mapping) !== JSON.stringify(value)) {
      onChange(mapping);
    }
  }, [mode, dateCol, yearCol, monthCol, valueCol, seriesIdCol, value, onChange]);

  const columnOptions = preview.columns.map((c) => ({
    value: c.name,
    label: `${c.name} (${c.dtype})`,
  }));
  const numericOptions = preview.columns
    .filter((c) => c.dtype === "numeric")
    .map((c) => ({ value: c.name, label: c.name }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="block font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
          Date source
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              mode === "single"
                ? "bg-accent-dim text-accent border border-accent/30"
                : "border border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
            }`}
          >
            Single date column
          </button>
          <button
            type="button"
            onClick={() => setMode("year-month")}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              mode === "year-month"
                ? "bg-accent-dim text-accent border border-accent/30"
                : "border border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
            }`}
          >
            Year + Month columns
          </button>
        </div>
      </div>

      {mode === "single" ? (
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
          options={[{ value: "", label: "- none -" }, ...columnOptions]}
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
  const selectedLabel = options.find((o) => o.value === value)?.label || (options.length === 0 ? "(no columns)" : "Select");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        className="w-full flex items-center justify-between rounded-md border border-border/50 bg-bg-surface/40 backdrop-blur px-3 py-2 text-sm text-text-primary transition-all hover:border-accent/50 focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none shadow-sm"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="text-text-muted text-xs transition-transform duration-200" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute z-[100] mt-1.5 max-h-64 w-full overflow-y-auto rounded-md border border-border/80 bg-bg-elevated/95 backdrop-blur-2xl py-1 shadow-[var(--shadow-elev-2)] flex flex-col no-scrollbar rounded-b-lg">
          {options.length === 0 && <div className="px-3 py-2 text-sm text-text-muted italic">(no columns)</div>}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/10 hover:text-accent transition-colors ${o.value === value ? "bg-accent/10 text-accent font-medium border-l-2 border-accent" : "text-text-secondary border-l-2 border-transparent"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
