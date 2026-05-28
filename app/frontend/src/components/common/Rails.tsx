import type { ReactNode } from "react";

// ----- 3-rail page layout primitives -----
//
// Use ThreeRailLayout to wrap a page so it gets the standard
//   [ LeftRail | CenterColumn | RightRail ]
// shape used on the Forecast page. RailLabel / RailRow / RailSection
// are the small building blocks used inside each rail. PageHeader is
// the kicker + title + subtitle block that sits at the top of the
// center column.

interface ThreeRailLayoutProps {
  left: ReactNode;
  right: ReactNode;
  children: ReactNode;
}

/**
 * Wraps the page in a 3-column CSS grid: 260px rail / flexible center /
 * 320px rail. The outer negative margins cancel the parent <main>'s
 * `px-8 py-8` so rails stretch edge-to-edge of the viewport. Below `lg`
 * the rails stack: left rail hides, right rail hides — center column gets
 * the full width, and pages should surface the same context inline via
 * `PageIntro` for small screens.
 */
export function ThreeRailLayout({ left, right, children }: ThreeRailLayoutProps) {
  return (
    <div className="-mx-8 -my-8 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px] min-h-[calc(100vh-2.75rem)]">
      {left}
      <main className="flex flex-col gap-6 px-8 py-8 min-w-0">{children}</main>
      {right}
    </div>
  );
}

export function LeftRail({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={ariaLabel}
      className="hidden lg:flex flex-col gap-6 border-r border-border-strong/70 bg-bg-surface/40 px-5 py-6 overflow-y-auto"
    >
      {children}
    </aside>
  );
}

export function RightRail({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={ariaLabel}
      className="hidden lg:flex flex-col gap-6 border-l border-border-strong/70 bg-bg-surface/40 px-5 py-6 overflow-y-auto"
    >
      {children}
    </aside>
  );
}

export function RailLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-text-faint">
      {children}
    </p>
  );
}

export function RailSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <RailLabel>{label}</RailLabel>
      {children}
    </section>
  );
}

type RailTone = "ok" | "warn" | "err" | "accent" | "muted";

export function RailRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: RailTone;
}) {
  const valueColor =
    tone === "ok"
      ? "text-positive"
      : tone === "warn"
        ? "text-warning"
        : tone === "err"
          ? "text-anomaly"
          : tone === "accent"
            ? "text-accent"
            : tone === "muted"
              ? "text-text-muted"
              : "text-text-primary";
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/40 last:border-b-0 gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
        {k}
      </span>
      <span
        className={`font-mono text-[11px] ${valueColor} truncate max-w-[60%] text-right`}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}

/** Compact pill-style choice grid used for horizon / fold / top-N pickers. */
export function RailChoiceGrid<T extends string | number>({
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
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid gap-1 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={`border px-2 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
            value === opt.value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border-strong/60 text-text-secondary hover:border-text-primary hover:text-text-primary"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          title={disabled ? disabledTitle : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Pinned-to-bottom secondary action — used for "Change settings" / "Reset". */
export function RailResetButton({
  onClick,
  label = "← Change settings",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-auto w-full border border-border-strong/70 bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:border-accent hover:text-accent transition-colors"
    >
      {label}
    </button>
  );
}

/** Bulleted "Reading the result" list with the cyan caret. */
export function RailBulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 text-[12px] text-text-secondary leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-accent" aria-hidden>
            ▸
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Standard right-rail intro block, "What you'll get" + "Reading the result". */
export function WhatYoullGet({
  summary,
  reading,
}: {
  summary: ReactNode;
  reading: ReactNode[];
}) {
  return (
    <>
      <RailSection label="What you'll get">
        <p className="text-[13px] leading-relaxed text-text-secondary">{summary}</p>
      </RailSection>
      <RailSection label="Reading the result">
        <RailBulletList items={reading} />
      </RailSection>
    </>
  );
}

interface PageHeaderProps {
  /** Small uppercase eyebrow above the title, e.g. "01 — Forecast Studio". */
  kicker: string;
  /** Big page title. */
  title: string;
  /** Mono uppercase row of facts under the title (rows, horizon, etc.). */
  subtitle?: string;
  /** Optional actions rendered to the right (e.g. a PDF export button). */
  actions?: ReactNode;
}

/** The header at the top of every 3-rail page. */
export function PageHeader({ kicker, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-border-strong/70 pb-4">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          {kicker}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.1] tracking-[-0.01em] font-medium text-text-primary truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-quiet">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
