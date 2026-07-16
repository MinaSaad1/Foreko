/**
 * The failure message for a run that did not complete.
 *
 * Every page that fires a mutation needs one of these next to the control that
 * fired it. Without it a failed run silently leaves the previous chart on
 * screen, which reads as success: the confident, plausible, wrong result this
 * product exists to prevent.
 *
 * Colour is paired with text and an alert role, never used as the only channel.
 */
export function RunError({ error, label }: { error: unknown; label?: string }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p
      role="alert"
      className="border border-anomaly/30 bg-anomaly/10 px-4 py-2 text-sm text-anomaly"
    >
      {label ? `${label} failed. ` : ""}
      {message}
    </p>
  );
}
