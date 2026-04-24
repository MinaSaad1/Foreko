import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PAGE_INTROS, type PageIntroKey } from "@/data/pageIntros";
import { TERMS } from "@/data/termDictionary";

interface PageIntroProps {
  pageKey: PageIntroKey;
  defaultOpen?: boolean;
}

const STORAGE_PREFIX = "foresee:pageIntro:";

function readPersisted(pageKey: PageIntroKey, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${pageKey}:open`);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

export function PageIntro({ pageKey, defaultOpen = true }: PageIntroProps) {
  const content = PAGE_INTROS[pageKey];
  const [open, setOpen] = useState(() => readPersisted(pageKey, defaultOpen));

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${pageKey}:open`,
        open ? "1" : "0",
      );
    } catch {
      // localStorage unavailable, best-effort only
    }
  }, [open, pageKey]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  if (!content) return null;

  const relatedTerms = (content.relatedTerms ?? [])
    .map((k) => TERMS[k])
    .filter((t): t is NonNullable<typeof t> => !!t);

  return (
    <section
      aria-label="What this page does for your business"
      className="rounded-panel border border-border/60 border-l-2 border-l-accent bg-bg-surface/40 backdrop-blur-sm px-5 py-4 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.5)]"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base text-accent" aria-hidden>
            ⓘ
          </span>
          <h2 className="font-display text-sm font-medium uppercase tracking-widest text-text-primary">
            {content.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`pageintro-body-${pageKey}`}
          aria-label={open ? "Hide this intro" : "Show this intro"}
          className="inline-flex h-6 w-6 items-center justify-center border border-border/60 font-mono text-[10px] text-text-muted hover:border-accent hover:text-accent focus:outline-none focus:border-accent focus:text-accent"
        >
          {open ? "–" : "+"}
        </button>
      </header>
      {open && (
        <div id={`pageintro-body-${pageKey}`} className="mt-3 space-y-3">
          <p className="text-sm leading-relaxed text-text-secondary">{content.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                When to use
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-primary">{content.whenToUse}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                Questions it helps answer
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-text-primary">
                {content.businessQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
          {relatedTerms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                Key terms:
              </span>
              {relatedTerms.map((t) => (
                <Link
                  key={t.key}
                  to={`/glossary#term-${t.key}`}
                  className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
