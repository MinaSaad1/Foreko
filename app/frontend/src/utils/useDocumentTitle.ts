import { useEffect } from "react";

const BASE = "Foresee";

export function useDocumentTitle(pageTitle?: string): void {
  useEffect(() => {
    document.title = pageTitle ? `${BASE} · ${pageTitle}` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [pageTitle]);
}
