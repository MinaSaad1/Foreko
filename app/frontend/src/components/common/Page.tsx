import type { ReactNode } from "react";

// ----- Single-column page primitives -----
//
// The replacement for the 3-rail layout. Rails put configuration, context, and
// interpretation in three columns at equal volume, so no column was primary and
// the left one vanished below `lg`, taking essential controls with it.
//
// The shape here is one ranked column:
//
//   PageHeading   kicker, title, one sans explanation, one primary action
//   FactGrid      the read-only facts the left rail used to hold
//   <section>     the work, with its controls attached to it
//   Depth         the interpretation the right rail used to hold, on demand
//   <section>     secondary actions, below a rule
//
// Rank comes from order and emphasis, not from assigning a column.

interface PageHeadingProps {
  /** Small uppercase eyebrow. The one mono micro-label this region gets. */
  kicker: string;
  /** Big page title. */
  title: string;
  /**
   * One sentence of plain prose saying what this page gives you. Sans, not
   * mono: this is meant to be read, and it must be present at every
   * breakpoint, which is exactly what the right rail failed to do.
   */
  intro?: ReactNode;
  /** The single primary action, if the page has one. */
  actions?: ReactNode;
}

export function PageHeading({ kicker, title, intro, actions }: PageHeadingProps) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-border-strong/70 pb-4">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          {kicker}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.1] tracking-[-0.01em] font-medium text-text-primary">
          {title}
        </h1>
        {intro && (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
            {intro}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

/**
 * The read-only facts a page reports about its own run. Shared-border grid, so
 * the cells meet on hairline seams instead of each being its own card.
 */
export function FactGrid({
  columns = 4,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const cols =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 3
        ? "sm:grid-cols-2 md:grid-cols-3"
        : "sm:grid-cols-2 md:grid-cols-4";
  return (
    <dl
      className={`grid grid-cols-1 ${cols} border-l border-t border-border-strong/70`}
    >
      {children}
    </dl>
  );
}

export function Fact({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="border-r border-b border-border-strong/70 bg-bg-surface/40 px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
        {label}
      </dt>
      <dd
        className="mt-1 truncate font-mono text-[12px] text-text-primary"
        title={title ?? value}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * A titled region of work. The heading row is where this region's controls
 * live, so a control always sits on the thing it changes rather than 260px
 * away in a column that can disappear.
 */
export function Section({
  title,
  controls,
  children,
}: {
  title: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-border-strong/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong/70 px-4 py-3">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">
          {title}
        </h2>
        {controls}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Interpretation, on demand. This is the right rail's "Reading the result"
 * content: genuinely useful, but not worth a permanent column that everyone
 * pays for and that hides on the screens most likely to need it.
 */
export function Depth({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="border border-border-strong/70 px-4 py-3">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted hover:text-text-primary">
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Secondary and destructive actions. Ranked by sitting below a rule. */
export function SecondaryActions({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-wrap gap-2 border-t border-border-strong/70 pt-4">
      {children}
    </section>
  );
}
