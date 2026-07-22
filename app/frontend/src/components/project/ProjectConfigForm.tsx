import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/endpoints";
import { ColumnMapper } from "@/components/ColumnMapper";
import type { ColumnMapping, Frequency } from "@/types/dataset";
import type { ModelId, PrimaryMetric, ProjectRevisionCreate } from "@/types/project";

// Everything a revision needs, collected in one place. A project with no
// revision cannot prepare, validate, or forecast, so this form is the gate to
// the whole workflow rather than an optional settings screen.

const MODELS: { id: ModelId; label: string; note: string }[] = [
  { id: "timesfm", label: "TimesFM", note: "Foundation model. No training, works on short history." },
  { id: "lightgbm", label: "LightGBM", note: "Gradient boosting on lag and calendar features." },
  { id: "ets", label: "ETS", note: "Exponential smoothing. Fast, strong on clean seasonality." },
  { id: "arima", label: "ARIMA", note: "Classical statistical model." },
  { id: "prophet", label: "Prophet", note: "Trend plus seasonality decomposition." },
  { id: "seasonal_naive", label: "Seasonal naive", note: "The baseline the others have to beat." },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "infer", label: "Infer from the dates" },
  { value: "D", label: "Daily" },
  { value: "W", label: "Weekly" },
  { value: "MS", label: "Monthly (period start)" },
  { value: "M", label: "Monthly (period end)" },
  { value: "H", label: "Hourly" },
];

const METRICS: { value: PrimaryMetric; label: string }[] = [
  { value: "mase", label: "MASE, scale free and comparable across series" },
  { value: "wape", label: "WAPE, weighted absolute percentage error" },
  { value: "smape", label: "sMAPE, symmetric percentage error" },
];

// The two real engines plus the baseline that proves they earn their keep.
// Every extra candidate multiplies validation time by folds and by series.
const DEFAULT_MODELS: ModelId[] = ["timesfm", "lightgbm", "seasonal_naive"];

interface Props {
  datasetId: string;
  /** Existing revision to edit. Must be a stable reference across renders. */
  initial?: ProjectRevisionCreate | null;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (config: ProjectRevisionCreate) => void;
}

export function ProjectConfigForm({
  datasetId,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: Props) {
  const preview = useQuery({
    queryKey: ["datasets", "preview", datasetId],
    queryFn: () => api.datasetPreview(datasetId),
  });

  const initialMapping = useMemo(() => initial?.mapping ?? null, [initial]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(initialMapping);
  const [frequency, setFrequency] = useState<Frequency>(
    (initial?.mapping.freq as Frequency | undefined) ?? "infer",
  );
  const [horizon, setHorizon] = useState(String(initial?.horizon ?? 12));
  const [models, setModels] = useState<ModelId[]>(
    initial?.candidate_models ?? DEFAULT_MODELS,
  );
  const [folds, setFolds] = useState(String(initial?.folds ?? 5));
  const [metric, setMetric] = useState<PrimaryMetric>(initial?.primary_metric ?? "mase");

  const horizonValue = Number(horizon);
  const foldsValue = Number(folds);

  // Listed, not just counted. A disabled button with no stated reason is the
  // bug this form exists to remove.
  const problems: string[] = [];
  if (!mapping) problems.push("Pick the date column and the value to forecast.");
  if (!Number.isInteger(horizonValue) || horizonValue < 1 || horizonValue > 1000) {
    problems.push("Horizon must be a whole number between 1 and 1000.");
  }
  if (!Number.isInteger(foldsValue) || foldsValue < 2 || foldsValue > 10) {
    problems.push("Folds must be a whole number between 2 and 10.");
  }
  if (models.length === 0) problems.push("Pick at least one candidate model.");

  function toggleModel(id: ModelId) {
    setModels((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id],
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (problems.length > 0 || !mapping) return;
    onSubmit({
      mapping: { ...mapping, freq: frequency },
      frequency,
      horizon: horizonValue,
      // The recipe belongs to the Prepare stage. Editing the configuration must
      // not silently drop the steps the user already built there.
      preparation_steps: initial?.preparation_steps ?? [],
      candidate_models: models,
      folds: foldsValue,
      primary_metric: metric,
      covariate_roles: initial?.covariate_roles ?? {},
      champion_override: initial?.champion_override ?? {},
    });
  }

  if (preview.isPending) {
    return <p className="text-[13px] text-text-muted">Reading the dataset…</p>;
  }
  if (preview.isError || !preview.data) {
    return (
      <p role="alert" className="text-[13px] text-anomaly">
        {(preview.error as Error)?.message ??
          "This project's dataset could not be read. It may have been deleted."}
      </p>
    );
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <section className="grid gap-3 border border-border-strong/70 bg-bg-surface/40 p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
          Columns
        </h2>
        <p className="text-[12px] text-text-secondary">
          {preview.data.filename} · {preview.data.row_count} rows ·{" "}
          {preview.data.columns.length} columns
        </p>
        <ColumnMapper
          preview={preview.data}
          value={mapping}
          onChange={setMapping}
          initial={initialMapping}
        />
      </section>

      <section className="grid gap-4 border border-border-strong/70 bg-bg-surface/40 p-4 md:grid-cols-3">
        <Field
          label="Frequency"
          hint="How often a period repeats. Infer reads it from the dates."
        >
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
            className={inputClass}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Horizon" hint="Periods to forecast ahead.">
          <input
            type="number"
            min={1}
            max={1000}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Folds" hint="Rolling backtest windows used to score models.">
          <input
            type="number"
            min={2}
            max={10}
            value={folds}
            onChange={(e) => setFolds(e.target.value)}
            className={inputClass}
          />
        </Field>
      </section>

      <fieldset className="grid gap-3 border border-border-strong/70 bg-bg-surface/40 p-4">
        <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
          Candidate models
        </legend>
        <p className="text-[12px] text-text-secondary">
          Every candidate is scored on the same folds, and the winner is picked per
          series. More candidates means a longer validation run.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {MODELS.map((model) => (
            <label
              key={model.id}
              className="flex items-start gap-2 border border-border-strong/50 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={models.includes(model.id)}
                onChange={() => toggleModel(model.id)}
                className="mt-1 accent-accent"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-text-primary">{model.label}</span>
                <span className="block text-[12px] text-text-secondary">{model.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="grid gap-3 border border-border-strong/70 bg-bg-surface/40 p-4">
        <Field label="Primary metric" hint="The number that decides the champion.">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as PrimaryMetric)}
            className={inputClass}
          >
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {problems.length > 0 ? (
        <ul role="note" className="grid gap-1">
          {problems.map((problem) => (
            <li key={problem} className="text-[12px] text-text-muted">
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13px] text-anomaly">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border-strong/70 pt-4">
        <button
          type="submit"
          disabled={problems.length > 0 || pending}
          className="border border-accent/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <span className="text-[12px] text-text-muted">
          Saving stores this as a new revision, so every run stays linked to the
          configuration that produced it.
        </span>
      </div>
    </form>
  );
}

const inputClass =
  "border border-border-strong/70 bg-transparent px-3 py-2 text-[13px] text-text-primary";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
        {label}
      </span>
      {children}
      <span className="text-[12px] text-text-secondary">{hint}</span>
    </label>
  );
}
