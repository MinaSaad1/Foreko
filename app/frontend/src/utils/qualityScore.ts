/**
 * Quality score banding, shared by every surface that renders a preflight score.
 *
 * The backend returns `quality_score` on a 0-100 scale: it starts at 100 and
 * subtracts per issue (app/backend/foreko/services/preflight.py). It is not a
 * 0-1 fraction, and must never be scaled again on the way out.
 *
 * This lives in one place because the two readers drifted apart once: the rail
 * scaled the score a second time and banded it against 0.8 / 0.5, so it showed
 * "8700 / 100" and reported every real score as green, including a 3, while the
 * card beside it read the same number correctly.
 */

/** Matches RailTone's ok / warn / err so a band can be passed straight through. */
export type QualityBand = "ok" | "warn" | "err";

/** Score thresholds. Green is forecast-ready, amber is run with caution. */
export const QUALITY_OK_MIN = 85;
export const QUALITY_WARN_MIN = 60;

export function qualityBand(score: number): QualityBand {
  if (score >= QUALITY_OK_MIN) return "ok";
  if (score >= QUALITY_WARN_MIN) return "warn";
  return "err";
}
