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

/**
 * Emphasis only. The value's own text always carries the meaning, so a fact
 * still reads correctly with colour ignored, unavailable, or indistinguishable.
 */
export type FactTone = "ok" | "warn" | "err" | "accent" | "muted";

const FACT_TONE: Record<FactTone, string> = {
  ok: "text-positive",
  warn: "text-warning",
  err: "text-anomaly",
  accent: "text-accent",
  muted: "text-text-muted",
};

export function Fact({
  label,
  value,
  title,
  tone,
}: {
  label: string;
  value: string;
  title?: string;
  tone?: FactTone;
}) {
  return (
    <div className="border-r border-b border-border-strong/70 bg-bg-surface/40 px-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate font-mono text-[12px] ${tone ? FACT_TONE[tone] : "text-text-primary"}`}
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

/**
 * Compact pill-style choice grid for horizon / fold / top-N pickers.
 *
 * Moved here from Rails.tsx, which is gone. It was always a generic control
 * rather than a rail thing; the rail just happened to be where it was parked.
 * Place it on the region it configures, never in a column that can hide.
 */
export function ChoiceGrid<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  disabledTitle,
  columns = 2,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  disabledTitle?: string;
  columns?: 2 | 3 | 4;
}) {
  const cols =
    columns === 4 ? "grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`grid gap-1 ${cols}`}>
      {options.map((opt) => (
        <button
          // Without this, a picker dropped inside a <form> submits it.
          type="button"
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          aria-pressed={value === opt.value}
          className={`border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
            value === opt.value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border-strong/60 text-text-secondary hover:border-text-primary hover:text-text-primary"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          title={disabled ? disabledTitle : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
