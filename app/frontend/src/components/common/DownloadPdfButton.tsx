import { useState } from "react";
import { api } from "@/api/endpoints";
import { toast } from "@/utils/toast";

export interface PdfTable {
  headers?: string[];
  rows: (string | number)[][];
}

export interface PdfSection {
  heading?: string;
  body?: string;
  kv?: [string, string][];
  table?: PdfTable;
  image_base64?: string;
  caption?: string;
  page_break?: boolean;
}

interface DownloadPdfButtonProps {
  title: string;
  sections: () => PdfSection[] | Promise<PdfSection[]>;
  filename?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function DownloadPdfButton({
  title,
  sections,
  filename = "foresee-report.pdf",
  label = "Export PDF",
  disabled,
  className = "",
}: DownloadPdfButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const resolved = await sections();
      if (resolved.length === 0) {
        toast.info("Nothing to export yet, run an analysis first.");
        return;
      }
      const blob = await api.exportPdf(title, resolved);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF ready.");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-2 border border-accent/30 bg-accent/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent transition-all hover:bg-accent/10 hover:shadow-[0_0_10px_rgb(var(--color-accent)/0.2)] disabled:opacity-40 ${className}`}
    >
      {busy ? "Exporting…" : label}
    </button>
  );
}
