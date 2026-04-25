import { useCallback, useEffect, useState } from"react";
import { useLocation } from"react-router-dom";

const STORAGE_KEY ="foresee:tour:completed";

interface TourStep {
  eyebrow: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    eyebrow:"Welcome",
    title:"Local forecasting, from CSV to insight",
    body:"Foresee turns any time-series CSV into a calibrated forecast, explains what moved, and compares scenarios. This 60-second tour covers the main flow.",
  },
  {
    eyebrow:"Step 1",
    title:"Bring in your data",
    body:"Head to the Upload page. Drop a CSV with a date column and a numeric value column, or pick one of the built-in samples to explore without your own data.",
  },
  {
    eyebrow:"Step 2",
    title:"See the recommended forecast",
    body:"The Forecast page runs two models on your data and picks the winner on a holdout. You get the recommended forecast, uncertainty ranges, and a plain-English reason for the choice.",
  },
  {
    eyebrow:"Step 3",
    title:"Dig deeper when a forecast matters",
    body:"Backtest proves the winner on your real history. Anomalies flag the weird points. Explain finds changepoints and drivers. Factors, Scenarios, and Segments let you play with what-if questions.",
  },
  {
    eyebrow:"Final",
    title:"Your data stays on your machine",
    body:"Foresee never sends telemetry or uploads your CSVs. Everything lives under ~/.timesfm_studio/. You can clear it anytime from the Privacy page.",
  },
];

function hasDismissed(): boolean {
  if (typeof window ==="undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ==="1";
  } catch {
    return true;
  }
}

function markDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY,"1");
  } catch {
    // localStorage unavailable, best-effort only
  }
}

export function clearTourDismissal(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface TourProps {
  /** When set, forces the tour to show regardless of localStorage. */
  force?: boolean;
  /** Fires when the tour closes (either by finish or skip). */
  onClose?: () => void;
}

export function Tour({ force = false, onClose }: TourProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (force) {
      setOpen(true);
      setStep(0);
      return;
    }
    // Auto-show on the first non-landing route the user visits.
    if (location.pathname ==="/") return;
    if (hasDismissed()) return;
    setOpen(true);
  }, [force, location.pathname]);

  const close = useCallback(() => {
    markDismissed();
    setOpen(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key ==="Escape") close();
      if (e.key ==="ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key ==="ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  if (!open) return null;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-base/80 backdrop-blur-xl px-4"
    >
      <div className="relative w-full max-w-lg rounded-panel border border-accent/40 bg-bg-surface/90 backdrop-blur-2xl shadow-[0_0_40px_rgb(var(--color-accent)/0.25)]">
        <div className="px-6 pt-6 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              {current.eyebrow}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Skip tour"
              className="font-mono text-[10px] uppercase tracking-widest text-text-muted hover:text-text-primary"
            >
              Skip
            </button>
          </div>
          <h2 id="tour-title" className="font-display text-xl font-semibold text-text-primary">
            {current.title}
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">{current.body}</p>
        </div>

        <div className="flex items-center gap-2 px-6 py-2" aria-label="Tour progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 transition-all ${i <= step ?"bg-accent" :"bg-border/60"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between px-6 pb-6 pt-2 gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={isFirst}
            className="border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary disabled:opacity-30"
          >
            Back
          </button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
            {step + 1} / {STEPS.length}
          </span>
          {isLast ? (
            <button
              type="button"
              onClick={close}
              className="btn-terminal-primary"
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
              className="btn-terminal-primary"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
