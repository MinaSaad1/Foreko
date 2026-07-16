# DESIGN.md, Foreko

Visual system of record. Answers how it looks. Strategy lives in
[PRODUCT.md](PRODUCT.md).

This documents the system as built in `app/frontend/src/styles/index.css` and
`tailwind.config.ts`. The identity below is settled and in force. Where the UI
currently disagrees with this file, the UI is wrong.

## Theme

**Both, dark-leaning, user-controlled.** Not a default, and not decoration.

The scene: a demand planner at a desk under office fluorescents at 11am,
rebuilding next quarter's number before a 2pm review, with a spreadsheet open on
the other monitor. That scene forces **light** to be a first-class citizen, not
a courtesy. It is bright in the room and the neighbouring surface is white.

The counter-scene is real too: the same tool open late against a wall of charts,
where a bright field is fatiguing and the accent needs to carry.

So both themes are fully designed, toggled by the user, persisted, and never
inferred. `html.light` and `html.dark` each define the full token set. Neither
is a filter over the other.

## Color

**Strategy: restrained.** Tinted slate neutrals carry the surface. One accent,
held under roughly 10% of the field, reserved for signal.

This is deliberate for a forecasting tool. Color is a data channel here. If
chrome spends the accent, charts have nothing left to say with it. When
everything is emphasized, nothing is.

Values are stored as space-separated RGB channels in CSS variables, consumed via
Tailwind's `rgb(var(--token) / <alpha-value>)`.

### Light (`:root`, `html.light`)

| Role | RGB | Note |
|---|---|---|
| `bg-base` | `248 250 252` | Page field. Never `#fff`. |
| `bg-surface` | `255 255 255` | Raised panels only. |
| `bg-elevated` | `241 245 249` | Insets, wells. |
| `border` | `203 213 225` | Default rule. |
| `border-strong` | `148 163 184` | Structural rule. |
| `text-primary` | `15 23 42` | Slate-tinted, never `#000`. |
| `text-secondary` | `71 85 105` | Body. |
| `text-muted` | `100 116 139` | Labels. |
| `text-faint` | `148 163 184` | Non-essential only. |
| `accent` | `14 116 144` | Deep cyan. Darkened for AA on light. |
| `accent-2` | `234 88 12` | Orange. Comparison series. |

### Dark (`html.dark`)

| Role | RGB | Note |
|---|---|---|
| `bg-base` | `3 7 18` | Near-black, blue-tinted. |
| `bg-surface` | `15 23 42` | Panels. |
| `bg-elevated` | `30 41 59` | Insets. |
| `border` | `30 41 59` | Default rule. |
| `border-strong` | `51 65 85` | Structural rule. |
| `text-primary` | `248 250 252` | Never pure white. |
| `accent` | `0 240 255` | Electric cyan. The signature. |
| `accent-2` | `251 146 60` | Orange. |

### Semantic (both themes)

`positive` green, `warning` amber, `anomaly` red, `neutral` blue. These are
data-carrying, not decorative. **Never the only channel**: every state that uses
them also carries a text label (PRODUCT.md, §12).

The accent inverts across themes (deep cyan → electric cyan) because the same
hue cannot hold both contrast and character across a 245-point lightness swing.

## Typography

Three families, self-hosted. **No Google Fonts, no external font CDN.** A
runtime request to `fonts.googleapis.com` contradicts the privacy claim the
product is built on. This has regressed before; treat it as a bug, not a nit.

| Family | Use |
|---|---|
| **Outfit** (`font-display`) | Page titles, headings. Geometric, quiet. |
| **Inter** (`font-sans`) | Body, controls, long-form. |
| **JetBrains Mono** (`font-mono`) | Numbers, metrics, micro-labels, code. |

### The mono micro-label

The signature device: `font-mono text-[10px] uppercase tracking-[0.18em]`.
Kickers, rail labels, key/value keys, status chips.

**It is a seasoning, not a staple.** It has been over-applied. Rules:

- Use it to label a region or a value, never for anything a user must *read*.
- Never for sentences, help text, or prose. Uppercase at 10px with 0.18em
  tracking is measurably slower to read and actively hostile in long runs.
- One per region. Stacked mono labels flatten hierarchy into noise, which is
  the specific failure the rail pages exhibit.

### Scale and measure

Hierarchy comes from scale and weight, ratio ≥1.25 between steps. Page title
`2rem/1.1`, section `1rem`, body `13px/relaxed`, micro `10px`. Body measure caps
at 65–75ch.

## Shape and elevation

**Radius is zero. Everywhere.** Every Tailwind radius token is overridden to
`0`, except `full` for dots and pills. Hard edges are the identity: an
instrument, machined, not a rounded consumer card. Do not introduce `rounded-*`.

Structure comes from **1px rules**, not shadow. The prevailing pattern is a
shared-border grid: `border-l border-t` on the container, `border-r border-b`
on each cell, producing hairline seams with no doubling.

Elevation is used sparingly, via `--shadow-elev-*`. A border already says
"distinct region"; a shadow on top of it says it twice.

**Cards are not the default answer.** The grid-with-seams is usually better, and
nested cards are always wrong.

## Motion

Purposeful and short. Transitions run on `colors`, `opacity`, and `transform`.
Never animate layout properties. Ease out; no bounce, no elastic.

The ambient loops (`scan`, `float-y`, `border-flow`, `pulse-slow`) belong to
first-run and empty states where there is nothing else to look at. They do not
belong next to a number a user is trying to read.

Honor `prefers-reduced-motion`.

## Layout

- **App shell:** `StatusBar` on top, collapsible left sidebar (56 open / 68px
  collapsed), scrolling `main`. Sidebar is project-first (design §5.1).
- **Grid seams** over floating cards.
- **Rails:** `ThreeRailLayout` (260px / fluid / 320px) is the V1 pattern on 11
  pages. It is under active review. Its known failure is that configuration,
  context, and interpretation all shout at equal volume, so the center column
  loses primacy. Prefer the V2 Studio composition for new work.
- Rails collapse below `lg` and pages must surface the same context inline.
  A rail is never the only home for essential information.

## Components

- `btn-terminal` / `btn-terminal-primary`: mono, uppercase, tracked, square.
- `StudioStepper`: stage state as text plus ARIA, never hue alone.
- `Rails.tsx` primitives: `RailSection`, `RailRow`, `RailChoiceGrid`,
  `WhatYoullGet`.
- `Term`: glossary popover. The mechanism for depth-on-demand; prefer it over
  inline explanation that everyone pays for.

## Focus

Never remove the ring. `2px solid accent` plus a soft accent glow. The workflow
is fully keyboard accessible, so focus is a primary state, not an afterthought.

## Bans

Repo-specific, on top of the global design laws:

- No em dashes in any user-facing copy.
- No external font, script, or asset requests. Nothing leaves the machine.
- No `rounded-*`. Radius is zero.
- No gradient text, no glassmorphism as decoration, no side-stripe accent
  borders, no hero-metric template, no identical-card grids.
- No color-only state.
- No telemetry hooks, no paywall or tier affordances, ever.
