/**
 * Inline SVG illustrations for the landing-page feature cards.
 *
 * Each illustration paints a themed scene (chart, scan line, scatter, etc.) at
 * 96×72, using the theme's accent cyan plus warning/anomaly colors when
 * relevant. Idle animations keep the card alive; hover intensifies them via
 * the parent's ``group`` modifier.
 */

const ACCENT = "#00F0FF";
const ACCENT_SOFT = "rgba(0,240,255,0.18)";
const GRID = "#1E293B";
const TEXT_MUTED = "#64748B";
const POSITIVE = "#10B981";
const WARNING = "#F59E0B";
const ANOMALY = "#EF4444";
const NEUTRAL = "#3B82F6";

const VIEWBOX = "0 0 96 72";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className="h-16 w-24 overflow-visible"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="fade-band" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.25" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      {children}
    </svg>
  );
}

function Grid() {
  // Thin horizontal rules so the illustrations feel anchored.
  return (
    <g stroke={GRID} strokeWidth={0.5} opacity={0.6}>
      <line x1="4" y1="18" x2="92" y2="18" />
      <line x1="4" y1="36" x2="92" y2="36" />
      <line x1="4" y1="54" x2="92" y2="54" />
    </g>
  );
}

export function DataQualityIllustration() {
  return (
    <Frame>
      <Grid />
      {/* data rows */}
      <g>
        {[22, 34, 46, 58].map((y, i) => (
          <g key={y}>
            <rect x={8} y={y - 3} width={18} height={5} fill={TEXT_MUTED} opacity={0.3} />
            <rect x={30} y={y - 3} width={22} height={5} fill={TEXT_MUTED} opacity={0.25} />
            <rect
              x={56}
              y={y - 3}
              width={14}
              height={5}
              fill={i === 1 ? WARNING : TEXT_MUTED}
              opacity={i === 1 ? 0.85 : 0.25}
            />
          </g>
        ))}
      </g>
      {/* scan line that sweeps across */}
      <g className="origin-left animate-scan-x">
        <rect x={4} y={14} width={4} height={46} fill={ACCENT} opacity={0.4} />
      </g>
      {/* checkmark badge */}
      <g transform="translate(74,10)" className="group-hover:animate-wobble">
        <circle cx="8" cy="8" r="8" fill={POSITIVE} opacity={0.15} />
        <circle cx="8" cy="8" r="7" fill="none" stroke={POSITIVE} strokeWidth="1.2" />
        <path
          d="M 4.5 8.2 L 7 10.6 L 11.5 5.8"
          fill="none"
          stroke={POSITIVE}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </Frame>
  );
}

export function ForecastIllustration() {
  // Historical line morphs into a forecast line with a confidence band.
  const histPath = "M 6 50 L 18 42 L 30 46 L 42 36 L 50 38";
  const fcPath = "M 50 38 L 62 30 L 74 26 L 86 20";
  const bandTop = "M 50 30 L 62 20 L 74 14 L 86 8 L 86 32 L 74 38 L 62 40 L 50 46 Z";
  return (
    <Frame>
      <Grid />
      <path d={bandTop} fill="url(#fade-band)" opacity={0.9} />
      <path
        d={histPath}
        fill="none"
        stroke={TEXT_MUTED}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d={fcPath}
        fill="none"
        stroke={ACCENT}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="200"
        className="animate-draw-line"
      />
      {/* forecast tip marker */}
      <circle cx="86" cy="20" r="3" fill={ACCENT} className="animate-pulse-slow" />
      <circle cx="86" cy="20" r="5" fill="none" stroke={ACCENT} strokeWidth="1" opacity={0.4} className="animate-ping-slow" />
      {/* split marker */}
      <line x1="50" y1="12" x2="50" y2="60" stroke={ACCENT} strokeWidth="0.5" strokeDasharray="2 2" opacity={0.5} />
    </Frame>
  );
}

export function BacktestIllustration() {
  // A moving test window over history bars.
  return (
    <Frame>
      <Grid />
      <g>
        {Array.from({ length: 12 }).map((_, i) => {
          const x = 6 + i * 7;
          const h = 10 + ((i * 7) % 26);
          const fill = i >= 8 ? POSITIVE : TEXT_MUTED;
          const opacity = i >= 8 ? 0.85 : 0.35;
          return <rect key={i} x={x} y={60 - h} width={5} height={h} fill={fill} opacity={opacity} />;
        })}
      </g>
      {/* walking test window */}
      <g className="animate-float-y">
        <rect
          x={58}
          y={12}
          width={32}
          height={50}
          fill="none"
          stroke={ACCENT}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          className="animate-dash-shift"
        />
      </g>
      {/* rewind arrow */}
      <g transform="translate(10,8)" className="group-hover:animate-wobble">
        <path
          d="M 6 4 L 2 8 L 6 12 M 2 8 L 12 8"
          fill="none"
          stroke={ACCENT}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </Frame>
  );
}

export function DiagnosticsIllustration() {
  // Heartbeat/residual spike with a steady rule.
  const path = "M 6 36 L 22 36 L 28 28 L 34 44 L 40 20 L 46 44 L 52 36 L 90 36";
  return (
    <Frame>
      <Grid />
      {/* horizontal zero rule */}
      <line x1="4" y1="36" x2="92" y2="36" stroke={ACCENT} strokeWidth="0.6" opacity={0.5} strokeDasharray="2 2" />
      <path
        d={path}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="200"
        className="animate-draw-line"
      />
      {/* residual dots */}
      {[
        [16, 34],
        [60, 38],
        [70, 32],
        [82, 40],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.5" fill={TEXT_MUTED} opacity={0.6} />
      ))}
    </Frame>
  );
}

export function AnomaliesIllustration() {
  // Baseline line + scatter points, one pulsing anomaly, one warning.
  return (
    <Frame>
      <Grid />
      <path
        d="M 6 40 Q 24 32 42 38 T 90 32"
        fill="none"
        stroke={TEXT_MUTED}
        strokeWidth="1.2"
        strokeDasharray="3 2"
        opacity={0.6}
      />
      {/* normal points */}
      {[
        [12, 38],
        [22, 34],
        [34, 40],
        [48, 36],
        [58, 32],
        [70, 38],
        [84, 30],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.5" fill={ACCENT} opacity={0.7} />
      ))}
      {/* warning */}
      <g>
        <circle cx="40" cy="20" r="2.6" fill={WARNING} />
        <circle cx="40" cy="20" r="5" fill="none" stroke={WARNING} strokeWidth="0.8" opacity={0.5} className="animate-ping-slow" />
      </g>
      {/* anomaly */}
      <g>
        <circle cx="74" cy="14" r="3.2" fill={ANOMALY} className="animate-pulse-slow" />
        <circle cx="74" cy="14" r="5.5" fill="none" stroke={ANOMALY} strokeWidth="1" opacity={0.55} className="animate-ping-slow" />
      </g>
    </Frame>
  );
}

export function ExplainIllustration() {
  // Changepoint split with a highlighted shift and branching causes.
  return (
    <Frame>
      <Grid />
      {/* before segment (low) */}
      <path
        d="M 6 48 L 16 46 L 26 50 L 36 48 L 46 46"
        fill="none"
        stroke={TEXT_MUTED}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* step up */}
      <line x1="46" y1="46" x2="46" y2="26" stroke={ACCENT} strokeWidth="1" strokeDasharray="2 2" opacity={0.7} />
      {/* after segment (high) */}
      <path
        d="M 46 26 L 58 24 L 70 28 L 82 22 L 90 26"
        fill="none"
        stroke={ACCENT}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="200"
        className="animate-draw-line"
      />
      {/* changepoint marker */}
      <circle cx="46" cy="36" r="3" fill={ACCENT} />
      <circle cx="46" cy="36" r="6" fill="none" stroke={ACCENT} strokeWidth="0.8" opacity={0.4} className="animate-ping-slow" />
      {/* cause tags */}
      <g fontFamily="JetBrains Mono" fontSize="5" fill={TEXT_MUTED}>
        <rect x="52" y="48" width="14" height="8" fill={ACCENT_SOFT} stroke={ACCENT} strokeOpacity={0.4} />
        <text x="54" y="54">price</text>
        <rect x="70" y="48" width="18" height="8" fill={ACCENT_SOFT} stroke={ACCENT} strokeOpacity={0.4} />
        <text x="72" y="54">promo</text>
      </g>
    </Frame>
  );
}

export function FactorsIllustration() {
  // Stacked contribution bars summing into an output.
  const bars = [
    { x: 8, label: "base", color: ACCENT, h: 34 },
    { x: 26, label: "price", color: NEUTRAL, h: 14 },
    { x: 44, label: "promo", color: POSITIVE, h: 10 },
    { x: 62, label: "wx", color: WARNING, h: 6 },
  ];
  return (
    <Frame>
      <Grid />
      {bars.map((b) => (
        <g key={b.label} className="animate-float-y" style={{ animationDelay: `${b.x * 12}ms` }}>
          <rect x={b.x} y={60 - b.h} width={12} height={b.h} fill={b.color} opacity={0.75} />
          <rect
            x={b.x}
            y={60 - b.h}
            width={12}
            height={b.h}
            fill="none"
            stroke={b.color}
            strokeWidth="0.8"
          />
        </g>
      ))}
      {/* plus signs between bars */}
      {[20, 38, 56].map((cx) => (
        <text
          key={cx}
          x={cx}
          y={56}
          fontFamily="JetBrains Mono"
          fontSize="7"
          fill={TEXT_MUTED}
          textAnchor="middle"
        >
          +
        </text>
      ))}
      {/* equals */}
      <g transform="translate(76,0)">
        <text x="2" y="56" fontFamily="JetBrains Mono" fontSize="7" fill={TEXT_MUTED}>
          =
        </text>
        <rect x="8" y="20" width="10" height="40" fill="none" stroke={ACCENT} strokeWidth="1" strokeDasharray="3 2" className="animate-dash-shift" />
      </g>
    </Frame>
  );
}

export function ScenariosIllustration() {
  // Base line that branches into three futures.
  return (
    <Frame>
      <Grid />
      {/* base history */}
      <path
        d="M 6 44 L 16 42 L 28 46 L 40 40 L 48 42"
        fill="none"
        stroke={TEXT_MUTED}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* branches */}
      <path
        d="M 48 42 L 62 28 L 76 18 L 90 10"
        fill="none"
        stroke={POSITIVE}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="200"
        className="animate-draw-line"
      />
      <path
        d="M 48 42 L 62 40 L 76 38 L 90 34"
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="200"
        className="animate-draw-line"
        style={{ animationDelay: "180ms" }}
      />
      <path
        d="M 48 42 L 62 50 L 76 56 L 90 62"
        fill="none"
        stroke={ANOMALY}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="200"
        className="animate-draw-line"
        style={{ animationDelay: "360ms" }}
      />
      {/* branch point */}
      <circle cx="48" cy="42" r="3" fill={ACCENT} />
      <circle cx="48" cy="42" r="6" fill="none" stroke={ACCENT} strokeWidth="0.8" opacity={0.4} className="animate-ping-slow" />
      {/* endpoint tips */}
      <circle cx="90" cy="10" r="2" fill={POSITIVE} />
      <circle cx="90" cy="34" r="2" fill={ACCENT} />
      <circle cx="90" cy="62" r="2" fill={ANOMALY} />
    </Frame>
  );
}

export function SegmentsIllustration() {
  // Three side-by-side bar groups (regions/products) with a highlighted winner.
  return (
    <Frame>
      <Grid />
      {[
        { x: 10, heights: [12, 20, 16], color: NEUTRAL, label: "A" },
        { x: 38, heights: [22, 30, 26], color: ACCENT, label: "B", winner: true },
        { x: 66, heights: [10, 14, 12], color: TEXT_MUTED, label: "C" },
      ].map((group) => (
        <g key={group.label}>
          {group.heights.map((h, i) => (
            <rect
              key={i}
              x={group.x + i * 7}
              y={60 - h}
              width={5}
              height={h}
              fill={group.color}
              opacity={group.winner ? 0.9 : 0.55}
            />
          ))}
          <text
            x={group.x + 10}
            y={68}
            fontFamily="JetBrains Mono"
            fontSize="5"
            fill={group.winner ? ACCENT : TEXT_MUTED}
            textAnchor="middle"
          >
            {group.label}
          </text>
        </g>
      ))}
      {/* crown over winner */}
      <g transform="translate(42,10)" className="animate-float-y-slow">
        <path
          d="M 0 6 L 2 2 L 5 6 L 8 0 L 11 6 L 14 2 L 16 6 L 14 10 L 2 10 Z"
          fill={ACCENT}
          opacity={0.85}
        />
      </g>
    </Frame>
  );
}
