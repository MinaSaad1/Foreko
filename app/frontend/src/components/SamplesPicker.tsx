import { useState } from"react";
import { useNavigate } from"react-router-dom";
import { SAMPLES, type SampleDescriptor } from"@/data/samples";
import { loadSampleDataset } from"@/utils/loadDemoDataset";
import { useDatasetStore } from"@/stores/datasetStore";
import { toast } from"@/utils/toast";

interface SamplesPickerProps {
  redirectTo?: (datasetId: string) => string;
  compact?: boolean;
}

export function SamplesPicker({ redirectTo, compact = false }: SamplesPickerProps) {
  const navigate = useNavigate();
  const setPreview = useDatasetStore((s) => s.setPreview);
  const setMapping = useDatasetStore((s) => s.setMapping);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const pick = async (sample: SampleDescriptor) => {
    setLoadingId(sample.id);
    try {
      const preview = await loadSampleDataset(sample.publicPath, sample.filename);
      // setPreview clears mapping, so assign the sample's pre-mapping after.
      setPreview(preview);
      setMapping(sample.mapping);
      const target = redirectTo ? redirectTo(preview.id) : `/compare/${preview.id}`;
      navigate(target);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <section aria-label="Sample datasets" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-medium text-text-primary uppercase tracking-widest">
          Or try a sample
        </h2>
      </div>
      <div className={`grid gap-3 ${compact ?"sm:grid-cols-2" :"md:grid-cols-2"}`}>
        {SAMPLES.map((sample) => {
          const isLoading = loadingId === sample.id;
          const disabled = loadingId !== null;
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => pick(sample)}
              disabled={disabled}
              className="group relative overflow-hidden rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent/[0.08] hover:shadow-[0_0_24px_-8px_rgb(var(--color-accent)/0.35)] disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                  {sample.domain}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted group-hover:text-accent">
                  {isLoading ?"Loading..." :"Use this sample →"}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-primary">{sample.description}</p>
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                <span>{sample.rowCount}</span>
                <span className="text-border-strong">|</span>
                <span>Forecast {sample.horizon}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
