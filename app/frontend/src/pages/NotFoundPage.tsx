import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/utils/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle("Page not found");

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start justify-center gap-4 py-20">
      <span className="inline-flex items-center gap-2 border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-warning">
        404
      </span>
      <h1 className="font-display text-3xl font-semibold text-text-primary">
        That page doesn't exist.
      </h1>
      <p className="text-text-secondary">
        The address you typed doesn't match anything in Foresee. Head back to the
        upload page or pick an analysis from the sidebar.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          to="/"
          className="border border-accent bg-accent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-on-accent hover:opacity-90"
        >
          Back to home
        </Link>
        <Link
          to="/data"
          className="border border-text-muted/40 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-all hover:border-accent hover:text-accent"
        >
          Upload a CSV
        </Link>
      </div>
    </div>
  );
}
