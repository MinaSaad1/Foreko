import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useDatasetStore } from "@/stores/datasetStore";
import { friendlyError } from "@/utils/toast";
import type { DatasetPreview } from "@/types/dataset";

interface CSVUploadProps {
  onUploaded?: (preview: DatasetPreview) => void;
}

// Network-level HTTP statuses where "retry the same file" is a sensible
// affordance. 413/415/422 mean the file itself is bad, so retrying won't help.
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504]);

export function CSVUpload({ onUploaded }: CSVUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const lastFileRef = useRef<File | null>(null);
  const setPreview = useDatasetStore((s) => s.setPreview);

  const attempt = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setRetryable(false);
      try {
        const preview = await api.uploadDataset(file);
        setPreview(preview);
        onUploaded?.(preview);
      } catch (err) {
        setError(friendlyError(err));
        setRetryable(err instanceof ApiError && RETRYABLE_STATUSES.has(err.status));
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, setPreview],
  );

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      lastFileRef.current = file;
      await attempt(file);
    },
    [attempt],
  );

  const retry = useCallback(() => {
    const file = lastFileRef.current;
    if (!file) return;
    void attempt(file);
  }, [attempt]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "application/octet-stream": [".parquet"],
      "application/json": [".json"],
      "application/x-ndjson": [".jsonl", ".ndjson"],
    },
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`relative overflow-hidden flex cursor-pointer flex-col items-center justify-center rounded-panel border-2 border-dashed p-14 text-center transition-all duration-300 ${
          isDragActive
            ? "border-accent bg-accent/10 shadow-[inset_0_0_30px_rgb(var(--color-accent)/0.2)] animate-pulse"
            : "border-border/60 bg-bg-surface/30 backdrop-blur hover:border-accent/60 hover:bg-accent/10 hover:shadow-[0_0_20px_rgb(var(--color-accent)/0.2)]"
        }`}
      >
        <input {...getInputProps()} />
        <div className={`mb-3 text-3xl transition-transform duration-300 ${isDragActive ? '-translate-y-2 text-accent' : 'text-text-muted hover:-translate-y-1'}`}>↑</div>
        <p className="text-base font-medium text-text-primary">
          {uploading
            ? "Uploading..."
            : isDragActive
              ? "Drop your file here"
              : "Drag a data file or click to browse"}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          CSV, Excel, Parquet, or JSON up to 50 MB
        </p>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 space-y-2">
          <p className="text-sm text-anomaly">{error}</p>
          {retryable && lastFileRef.current && (
            <button
              type="button"
              onClick={retry}
              disabled={uploading}
              className="border border-accent bg-transparent px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 disabled:opacity-40"
            >
              {uploading ? "Retrying..." : `Retry upload (${lastFileRef.current.name})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
