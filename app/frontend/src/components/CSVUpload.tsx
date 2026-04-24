import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { api } from "@/api/endpoints";
import { useDatasetStore } from "@/stores/datasetStore";
import { friendlyError } from "@/utils/toast";
import type { DatasetPreview } from "@/types/dataset";

interface CSVUploadProps {
  onUploaded?: (preview: DatasetPreview) => void;
}

export function CSVUpload({ onUploaded }: CSVUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPreview = useDatasetStore((s) => s.setPreview);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setUploading(true);
      setError(null);
      try {
        const preview = await api.uploadDataset(file);
        setPreview(preview);
        onUploaded?.(preview);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, setPreview],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`relative overflow-hidden flex cursor-pointer flex-col items-center justify-center rounded-panel border-2 border-dashed p-14 text-center transition-all duration-300 ${
          isDragActive
            ? "border-accent bg-accent/10 shadow-[inset_0_0_30px_rgba(0,240,255,0.2)] animate-pulse"
            : "border-border/60 bg-bg-surface/30 backdrop-blur hover:border-accent/60 hover:bg-accent/5 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)]"
        }`}
      >
        <input {...getInputProps()} />
        <div className={`mb-3 text-3xl transition-transform duration-300 ${isDragActive ? '-translate-y-2 text-accent' : 'text-text-muted hover:-translate-y-1'}`}>↑</div>
        <p className="text-base font-medium text-text-primary">
          {uploading
            ? "Uploading..."
            : isDragActive
              ? "Drop your CSV here"
              : "Drag a CSV file or click to browse"}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          .csv files up to 50 MB
        </p>
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-sm text-anomaly">
          {error}
        </p>
      )}
    </div>
  );
}
