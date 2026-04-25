import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TERMS,
  TERM_CATEGORIES,
  termsByCategory,
  type TermCategory,
  type TermDefinition,
} from "@/data/termDictionary";
import { PageIntro } from "@/components/common/PageIntro";

function matches(term: TermDefinition, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (term.label.toLowerCase().includes(needle)) return true;
  if (term.shortDefinition.toLowerCase().includes(needle)) return true;
  if (term.businessAngle.toLowerCase().includes(needle)) return true;
  if (term.aliases?.some((a) => a.toLowerCase().includes(needle))) return true;
  return false;
}

export function GlossaryPage() {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => termsByCategory(), []);
  const filtered = useMemo(() => {
    const out = {} as Record<TermCategory, TermDefinition[]>;
    for (const cat of Object.keys(grouped) as TermCategory[]) {
      const list = grouped[cat].filter((t) => matches(t, query));
      if (list.length > 0) out[cat] = list;
    }
    return out;
  }, [grouped, query]);

  const categoriesWithMatches = Object.keys(filtered) as TermCategory[];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-text-primary">Glossary</h1>
        <p className="mt-2 text-text-secondary">
          Every term Foresee surfaces, in plain English, with the definition and what it
          means for your business.
        </p>
      </div>
      <PageIntro pageKey="glossary" />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms, definitions, or aliases..."
          className="flex-1 min-w-[240px] border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent"
        />
        <span className="font-mono text-xs uppercase tracking-widest text-text-muted">
          {Object.values(filtered).flat().length} / {Object.keys(TERMS).length} terms
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav
          aria-label="Glossary categories"
          className="hidden lg:block sticky top-20 self-start space-y-1"
        >
          {categoriesWithMatches.map((cat) => (
            <a
              key={cat}
              href={`#cat-${cat}`}
              className="block border-l-2 border-transparent px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-text-muted hover:border-accent hover:text-accent"
            >
              {TERM_CATEGORIES[cat].label}
            </a>
          ))}
        </nav>

        <div className="space-y-8">
          {categoriesWithMatches.length === 0 && (
            <p className="text-text-secondary">No terms match your search.</p>
          )}
          {categoriesWithMatches.map((cat) => (
            <section key={cat} id={`cat-${cat}`} className="space-y-3 scroll-mt-20">
              <header>
                <h2 className="font-display text-lg font-semibold text-text-primary">
                  {TERM_CATEGORIES[cat].label}
                </h2>
                <p className="text-sm text-text-muted">{TERM_CATEGORIES[cat].blurb}</p>
              </header>
              <div className="grid gap-3 md:grid-cols-2">
                {filtered[cat].map((term) => (
                  <article
                    key={term.key}
                    id={`term-${term.key}`}
                    className="rounded-panel border border-border/60 bg-bg-surface/30 backdrop-blur-sm p-4 scroll-mt-20"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-base font-medium text-text-primary">
                        {term.label}
                      </h3>
                      {term.aliases && term.aliases.length > 0 && (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                          aka {term.aliases[0]}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">{term.shortDefinition}</p>
                    <div className="mt-2 border-l-2 border-accent/60 bg-accent/5 px-2 py-1.5">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
                        For your business
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-primary">
                        {term.businessAngle}
                      </p>
                    </div>
                    {term.example && (
                      <p className="mt-2 text-[11px] italic text-text-muted">{term.example}</p>
                    )}
                    {term.relatedTerms && term.relatedTerms.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {term.relatedTerms
                          .map((k) => TERMS[k])
                          .filter((t): t is TermDefinition => !!t)
                          .map((r) => (
                            <Link
                              key={r.key}
                              to={`#term-${r.key}`}
                              className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
                            >
                              {r.label}
                            </Link>
                          ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
