import { useCallback, useEffect, useState } from"react";
import { PAGE_INTROS, type PageIntroKey } from"@/data/pageIntros";

interface PageIntroProps {
 pageKey: PageIntroKey;
 defaultOpen?: boolean;
}

const STORAGE_PREFIX ="foreko:pageIntro:";

function readPersisted(pageKey: PageIntroKey, fallback: boolean): boolean {
 if (typeof window ==="undefined") return fallback;
 try {
 const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${pageKey}:open`);
 if (raw === null) return fallback;
 return raw ==="1";
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
 open ?"1" :"0",
 );
 } catch {
 // localStorage unavailable, best-effort only
 }
 }, [open, pageKey]);

 const toggle = useCallback(() => setOpen((v) => !v), []);

 if (!content) return null;

 return (
 <section
 aria-label="What this page does for your business"className="border border-border-strong/70 bg-bg-surface px-5 py-4 shadow-[var(--shadow-elev-1)]"
 >
 <header className="flex items-start justify-between gap-3">
 <div className="flex items-center gap-2">
 <span className="font-mono text-sm text-accent-2 leading-none"aria-hidden>
 ▲
 </span>
 <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
 {content.title}
 </h2>
 </div>
 <button
 type="button"onClick={toggle}
 aria-expanded={open}
 aria-controls={`pageintro-body-${pageKey}`}
 aria-label={open ?"Hide this intro" :"Show this intro"}
 className="inline-flex h-6 w-6 items-center justify-center border border-border/60 font-mono text-[10px] text-text-muted hover:border-accent hover:text-accent focus:border-accent focus:text-accent"
 >
 {open ?"–" :"+"}
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
 </div>
 )}
 </section>
 );
}
