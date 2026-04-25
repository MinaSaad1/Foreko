interface ExportChartButtonProps {
  onExport: () => void | Promise<void>;
  className?: string;
  label?: string;
}

export function ExportChartButton({
  onExport,
  className ="",
  label ="SAVE IMAGE",
}: ExportChartButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void onExport();
      }}
      className={`group/btn relative border border-text-muted/40 bg-transparent px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-all hover:border-accent hover:text-accent flex items-center justify-center ${className}`}
    >
      {label}
      <span className="opacity-0 group-hover/btn:opacity-100 absolute right-1">▌</span>
    </button>
  );
}
