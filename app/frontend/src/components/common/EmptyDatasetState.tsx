import { useNavigate } from"react-router-dom";
import { CSVUpload } from"@/components/CSVUpload";
import { SamplesPicker } from"@/components/SamplesPicker";
import { PageIntro } from"@/components/common/PageIntro";
import type { PageIntroKey } from"@/data/pageIntros";
import { useDatasetStore } from"@/stores/datasetStore";
import type { DatasetPreview } from"@/types/dataset";

interface EmptyDatasetStateProps {
  title: string;
  pageKey: PageIntroKey;
  basePath: string;
  message?: string;
}

export function EmptyDatasetState({
  title,
  pageKey,
  basePath,
  message,
}: EmptyDatasetStateProps) {
  const navigate = useNavigate();
  const setPreview = useDatasetStore((s) => s.setPreview);

  const goToDataset = (preview: DatasetPreview) => {
    setPreview(preview);
    navigate(`${basePath}/${preview.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 text-text-secondary">
          {message ??"Upload a CSV first, or pick a sample to explore this analysis."}
        </p>
      </div>

      <PageIntro pageKey={pageKey} />

      <CSVUpload onUploaded={goToDataset} />

      <SamplesPicker redirectTo={(id) => `${basePath}/${id}`} />
    </div>
  );
}
