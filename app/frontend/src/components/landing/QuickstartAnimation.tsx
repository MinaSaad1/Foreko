/**
 * Three-phase loop on a 6-second cycle:
 *   0.0 to 1.2s: CSV icon reveals column by column
 *   1.5 to 2.5s: arrow sweeps from CSV to chart
 *   2.8 to 4.5s: forecast line draws in via stroke-dashoffset
 *   4.8 to 6.0s: confidence band fades in, holds, then loop restarts
 *
 * All CSS is inlined so the component stays self-contained. The
 * prefers-reduced-motion media query falls back to a static "final frame"
 * so users with that setting see the outcome without animation.
 */

export function QuickstartAnimation() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-panel border border-accent/30 bg-bg-surface/50 backdrop-blur-sm"
      aria-label="How Foresee works: from CSV to forecast in seconds"
      role="img"
    >
      <style>{`
        @keyframes qs-csv-reveal {
          0%, 2% { opacity: 0; transform: translateY(4px); }
          12%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes qs-arrow-sweep {
          0%, 22% { opacity: 0; transform: translateX(-8px); }
          28%, 42% { opacity: 1; transform: translateX(0); }
          48%, 100% { opacity: 0.35; transform: translateX(0); }
        }
        @keyframes qs-line-draw {
          0%, 45% { stroke-dashoffset: 320; }
          70%, 100% { stroke-dashoffset: 0; }
        }
        @keyframes qs-band-fade {
          0%, 72% { opacity: 0; }
          82%, 100% { opacity: 0.35; }
        }
        @keyframes qs-dot-land {
          0%, 68% { opacity: 0; transform: scale(0.4); }
          78%, 100% { opacity: 1; transform: scale(1); }
        }
        .qs-csv-col { animation: qs-csv-reveal 6s ease-out infinite; }
        .qs-csv-col:nth-child(2) { animation-delay: 0.08s; }
        .qs-csv-col:nth-child(3) { animation-delay: 0.16s; }
        .qs-arrow { animation: qs-arrow-sweep 6s ease-in-out infinite; }
        .qs-chart-line {
          stroke-dasharray: 320;
          animation: qs-line-draw 6s ease-in-out infinite;
        }
        .qs-band { animation: qs-band-fade 6s ease-in-out infinite; }
        .qs-dot {
          transform-origin: center;
          animation: qs-dot-land 6s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .qs-csv-col,
          .qs-arrow,
          .qs-chart-line,
          .qs-band,
          .qs-dot {
            animation: none !important;
          }
          .qs-chart-line { stroke-dashoffset: 0 !important; }
          .qs-band { opacity: 0.35 !important; }
          .qs-arrow { opacity: 0.7 !important; }
          .qs-dot { opacity: 1 !important; transform: scale(1) !important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
        <span>Demo · CSV to forecast</span>
        <span className="text-accent">6s loop</span>
      </div>

      <svg
        viewBox="0 0 480 140"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-32"
        aria-hidden="true"
      >
        {/* === CSV icon (x: 10-120) === */}
        <g transform="translate(16 22)">
          <rect
            x="0"
            y="0"
            width="92"
            height="96"
            rx="0"
            className="fill-bg-elevated/60 stroke-accent/40"
            strokeWidth="1"
          />
          {/* Header row */}
          <rect x="0" y="0" width="92" height="14" className="fill-accent/20" />
          <text
            x="6"
            y="10"
            className="fill-accent font-mono"
            fontSize="7"
          >
            date
          </text>
          <text
            x="40"
            y="10"
            className="fill-accent font-mono"
            fontSize="7"
          >
            sales
          </text>
          <text
            x="68"
            y="10"
            className="fill-accent font-mono"
            fontSize="7"
          >
            temp
          </text>
          {/* Data columns, each animates in with a slight stagger */}
          <g className="qs-csv-col">
            {[20, 32, 44, 56, 68, 80].map((y, i) => (
              <text
                key={i}
                x="4"
                y={y}
                className="fill-text-secondary font-mono"
                fontSize="6"
              >
                2024-0{i + 1}
              </text>
            ))}
          </g>
          <g className="qs-csv-col">
            {[20, 32, 44, 56, 68, 80].map((y, i) => (
              <text
                key={i}
                x="38"
                y={y}
                className="fill-text-secondary font-mono"
                fontSize="6"
              >
                {(120 + i * 11).toString()}
              </text>
            ))}
          </g>
          <g className="qs-csv-col">
            {[20, 32, 44, 56, 68, 80].map((y, i) => (
              <text
                key={i}
                x="66"
                y={y}
                className="fill-text-secondary font-mono"
                fontSize="6"
              >
                {(68 + i).toString()}
              </text>
            ))}
          </g>
        </g>

        {/* === Arrow sweeping from CSV to chart (x: 118-168) === */}
        <g className="qs-arrow" transform="translate(122 62)">
          <path
            d="M0 8 L40 8 M30 2 L40 8 L30 14"
            className="stroke-accent"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </g>

        {/* === Chart (x: 175-460) === */}
        <g transform="translate(180 20)">
          {/* Frame */}
          <rect
            x="0"
            y="0"
            width="284"
            height="100"
            className="fill-bg-base/40 stroke-border/80"
            strokeWidth="1"
          />
          {/* Gridlines */}
          {[25, 50, 75].map((y) => (
            <line
              key={y}
              x1="0"
              x2="284"
              y1={y}
              y2={y}
              className="stroke-border/40"
              strokeWidth="0.5"
              strokeDasharray="2 4"
            />
          ))}
          {/* Historical segment (solid, always visible to ground the scene) */}
          <polyline
            points="6,72 26,64 46,70 66,58 86,52 106,60 126,48"
            fill="none"
            className="stroke-text-muted"
            strokeWidth="1.5"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          {/* Forecast band (uncertainty) */}
          <path
            className="qs-band fill-accent/40"
            d="M126 48
               L146 38 L166 32 L186 28 L206 22 L226 16 L246 12 L266 8
               L266 36 L246 36 L226 38 L206 40 L186 42 L166 42 L146 42 L126 48 Z"
          />
          {/* Forecast line (dashed, animates via stroke-dashoffset) */}
          <polyline
            className="qs-chart-line stroke-accent"
            points="126,48 146,42 166,36 186,32 206,26 226,22 246,18 266,14"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          {/* Forecast endpoint dot */}
          <circle cx="266" cy="14" r="3" className="qs-dot fill-accent" />
          {/* Labels */}
          <text
            x="6"
            y="96"
            className="fill-text-muted font-mono"
            fontSize="7"
          >
            HISTORY
          </text>
          <text
            x="180"
            y="96"
            className="fill-accent font-mono"
            fontSize="7"
          >
            FORECAST · P10-P90
          </text>
        </g>
      </svg>

      <div className="px-4 pb-3 pt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-muted">
        <span>01 · Drop CSV</span>
        <span className="text-border-strong">→</span>
        <span>02 · Map columns</span>
        <span className="text-border-strong">→</span>
        <span className="text-accent">03 · Forecast with uncertainty</span>
      </div>
    </div>
  );
}
