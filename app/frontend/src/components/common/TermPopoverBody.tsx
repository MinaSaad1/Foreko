import { Link } from"react-router-dom";
import type { TermDefinition } from"@/data/termDictionary";

interface TermPopoverBodyProps {
 term: TermDefinition;
}

export function TermPopoverBody({ term }: TermPopoverBodyProps) {
 return (
 <div className="space-y-2">
 <div className="flex items-baseline justify-between gap-2">
 <p className="font-display text-sm font-medium text-text-primary">{term.label}</p>
 <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
 {term.category.replace("-","")}
 </span>
 </div>
 <p className="text-xs leading-relaxed text-text-secondary">{term.shortDefinition}</p>
 <div className="border-l-2 border-accent/60 bg-accent/5 px-2 py-1.5">
 <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
 For your business
 </p>
 <p className="mt-0.5 text-xs leading-relaxed text-text-primary">{term.businessAngle}</p>
 </div>
 {term.example && (
 <p className="text-[11px] italic text-text-muted">{term.example}</p>
 )}
 <Link
 to={`/glossary#term-${term.key}`}
 className="inline-flex items-center gap-1 pt-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
 >
 More in glossary →
 </Link>
 </div>
 );
}
