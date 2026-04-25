import { useEffect, useRef, useState } from"react";
import { useMutation, useQuery, useQueryClient } from"@tanstack/react-query";
import { useHealth } from"@/hooks/useHealth";
import { api } from"@/api/endpoints";
import { toast } from"@/utils/toast";

const STALL_SECONDS = 45;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return"0 B";
  const units = ["B","KB","MB","GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return"-";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return"-";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2,"0")}s`;
}

// Session-level flag: true once the model has reported"ready" at any point.
// Used to distinguish cold-start (show blocking splash) from mid-session retries
// (let the header ModelStatusBar show the state, don't block the whole app).
let _hasEverBeenReady = false;

export function LoadingSplash() {
  const queryClient = useQueryClient();
  const { data: health, isLoading } = useHealth();
  const { data: progress } = useQuery({
    queryKey: ["model-download-progress"],
    queryFn: () => api.modelDownloadProgress(),
    refetchInterval: 1000,
    retry: 1,
  });

  if (health?.model_status ==="ready") {
    _hasEverBeenReady = true;
  }

  // Stall detection: remember the last byte count we saw advance, and when.
  const lastBytesRef = useRef<number>(-1);
  const lastAdvanceAtRef = useRef<number>(Date.now());
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!progress || progress.state !=="downloading") {
      lastBytesRef.current = -1;
      lastAdvanceAtRef.current = Date.now();
      setStalled(false);
      return;
    }
    const bytes = progress.downloaded_bytes;
    if (bytes !== lastBytesRef.current) {
      lastBytesRef.current = bytes;
      lastAdvanceAtRef.current = Date.now();
      setStalled(false);
      return;
    }
    // Same byte count as last poll. Check elapsed since the last real advance.
    const idleSec = (Date.now() - lastAdvanceAtRef.current) / 1000;
    if (idleSec >= STALL_SECONDS && progress.speed_bps === 0) {
      setStalled(true);
    }
  }, [progress]);

  const retryMutation = useMutation({
    mutationFn: () => api.retryModelDownload(),
    onSuccess: () => {
      lastBytesRef.current = -1;
      lastAdvanceAtRef.current = Date.now();
      setStalled(false);
      queryClient.invalidateQueries({ queryKey: ["model-download-progress"] });
    },
    onError: (err) => toast.error(err),
  });

  const isModelLoading = isLoading || !health || health.model_status ==="loading";
  const isError = health?.model_status ==="error" || progress?.state ==="error";

  if (!isModelLoading && !isError) return null;

  // If the model was ready earlier in this session (and is now merely reloading
  // after a user-triggered retry), suppress the full-screen splash. The header
  // ModelStatusBar keeps showing"Loading model" in that case. Errors always
  // show the splash so the user sees the Try again button.
  if (_hasEverBeenReady && !isError) return null;

  const downloading = progress?.state ==="downloading";
  const pct =
    progress && progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg-base/80 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-4 relative w-full max-w-md px-6">
        <div className="absolute -inset-20 bg-hero-glow blur-[80px] opacity-20 animate-pulse-slow pointer-events-none" />
        <img
          src="/foresee-logo.png"
          alt=""
          aria-hidden="true"
          className="relative z-10 h-24 w-24 object-contain drop-shadow-[0_0_20px_rgb(var(--color-accent)/0.35)] animate-pulse-slow"
        />
        <span className="text-3xl font-display font-semibold bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent relative z-10 tracking-widest uppercase">
          Foresee Setup
        </span>

        {isError ? (
          <div className="flex flex-col items-center gap-3 relative z-10 mt-4">
            <span className="text-anomaly text-sm font-medium bg-anomaly/10 border border-anomaly/30 px-3 py-1.5 uppercase tracking-wider">
              Initialization failed
            </span>
            <p className="text-xs text-text-secondary font-mono text-center max-w-xs">
              {progress?.error ??"The model couldn't load. Check your network and try again."}
            </p>
            <button
              type="button"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="btn-terminal"
            >
              {retryMutation.isPending ?"Retrying..." :"Try again"}
            </button>
            <div className="rounded-panel border border-border/40 bg-bg-surface/40 px-4 py-3 max-w-sm text-left space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                Offline escape hatch
              </p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                If HuggingFace is unreachable, manually download the TimesFM snapshot on another
                machine and copy the files into
                {progress?.cache_path ? (
                  <code className="mx-1 font-mono text-text-primary break-all">
                    {progress.cache_path}
                  </code>
                ) : (
                  <code className="mx-1 font-mono text-text-primary">
                    ~/.timesfm_studio/models/google--timesfm-2.5-200m-pytorch/
                  </code>
                )}
                then restart Foresee.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 relative z-10 mt-4 w-full">
            {!downloading && (
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 rounded-full border-2 border-border/50" />
                <div className="absolute inset-0 rounded-full border-t-2 border-accent animate-spin" />
                <div className="absolute inset-0 rounded-full border-r-2 border-accent/40 animate-[spin_1.5s_linear_infinite_reverse]" />
              </div>
            )}

            <p className="text-text-primary font-medium tracking-wide">
              {downloading ?"Downloading TimesFM model" :"Loading the model..."}
            </p>

            {!downloading && (
              <p className="text-[11px] text-text-muted font-mono text-center max-w-xs">
                About 1.2 GB on first run, typically 3 to 10 minutes on home broadband. Cached locally after this.
              </p>
            )}

            {downloading && progress && (
              <div className="w-full space-y-2">
                <div className="h-2 w-full border border-border/60 bg-bg-surface/60 overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: pct !== null ? `${pct}%` :"20%" }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] text-text-muted">
                  <span>
                    {formatBytes(progress.downloaded_bytes)}
                    {progress.total_bytes > 0 ? ` / ${formatBytes(progress.total_bytes)}` :""}
                  </span>
                  <span>{pct !== null ? `${pct}%` :"..."}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                  <span>{formatRate(progress.speed_bps)}</span>
                  <span>eta {formatEta(progress.eta_seconds)}</span>
                </div>
              </div>
            )}

            {downloading && stalled && (
              <div className="w-full space-y-2 rounded-panel border border-warning/40 bg-warning/10 px-4 py-3">
                <p className="text-xs text-warning font-mono">
                  No progress for {STALL_SECONDS}s. The connection may have stalled.
                </p>
                <button
                  type="button"
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                  className="w-full btn-terminal"
                >
                  {retryMutation.isPending ?"Retrying..." :"Resume download"}
                </button>
              </div>
            )}

            {downloading && progress?.cache_path && (
              <p className="text-[10px] text-text-muted font-mono text-center break-all max-w-sm">
                Saving to <span className="text-text-secondary">{progress.cache_path}</span>
              </p>
            )}

            {downloading && (
              <p className="text-[11px] text-text-muted font-mono text-center">
                First run only. Cached locally after this, then instant.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
