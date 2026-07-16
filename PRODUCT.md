# PRODUCT.md, Foreko

Strategic design context. Answers who, what, and why. Visual decisions live in
[DESIGN.md](DESIGN.md).

Sources of record: `CLAUDE.md` (mission and boundaries),
`docs/superpowers/specs/2026-07-15-foreko-v2-design.md` (V2 design, especially
§1 product decision, §5 information architecture, §12 accessibility).

## Register

**Product.** Design serves the work, it does not perform.

Foreko is a local app the user has already downloaded, installed, and launched
before they see a single screen. The sales pitch has already worked. Every
pixel after launch is there to help someone finish a forecast, not to convince
them to want one. Marketing lives in the separate `foreko-landing` repo.

The one exception is first run, where a user with no projects and no data needs
orientation. That is onboarding, not marketing.

## Users and purpose

**Who:** business users who own a recurring number. Demand planners, supply
chain analysts, finance and sales-ops people. They are fluent in spreadsheets
and in their own domain. They are not ML engineers and should never need to be.

**Context of use:** a work laptop, during the working day, usually under a
deadline that belongs to someone else. The forecast is an input to a decision
that a person will be held accountable for. It is rarely the user's only task
that hour.

**The job:** from the V2 design §1, verbatim, because it is the product's
whole thesis:

> A business user can create a recurring forecast across one or many series,
> validate the model policy, enter future assumptions, issue the forecast, load
> actual results later, and reproduce the complete decision without rebuilding
> the analysis.

Two words carry the weight. **Recurring**: this happens again next month, so
the work must persist. **Reproduce**: the user must be able to defend the
number to someone who doubts it.

**What success feels like:** the user can answer "where does this number come
from?" without reopening the analysis, and can hand the answer to a skeptic.

## Brand personality

An instrument, not an assistant. Foreko is the well-made tool on the bench:
precise, legible, honest about its own limits, and completely uninterested in
being charming while you work.

- **Candid over reassuring.** When the data is thin or a model cannot read a
  factor, say so plainly and early. A forecast tool that flatters is worthless.
- **Quiet by default, loud when it matters.** Color and emphasis are reserved
  for real signal: an exception, a failure, a decision point.
- **Numbers first, prose second.** Explain, do not narrate.
- **No false confidence.** Never imply more certainty than the evidence carries.
  Foreko does not label confidence High just because two models agree (§12).

## Anti-references

What Foreko must never look or behave like. The first four are the mission
boundaries in `CLAUDE.md` and are non-negotiable product law, not taste.

- **An AI assistant.** No chat, no narrative generation, no "insights" written
  by a language model. Foreko's only model is the forecaster.
- **A SaaS dashboard product.** No paywalls, no tier gating, no hardware-tier
  UI, no upgrade prompts, no commercialization hooks. Nothing to sell.
- **A telemetry-backed web app.** No tracking, no remote logging, no phone-home.
  Data stays on the machine. This is a load-bearing product promise, not a
  setting.
- **A general AutoML platform.** Not a dashboard builder, not a recommender,
  not text NLP. Anything that does not enrich forecasting does not belong.
- **A hero-metric marketing page wearing an app's clothes.** The landing page's
  current 9-tile feature grid pitches a product the user already installed.
- **An analytics tool that hides its work.** If a user cannot trace a number
  back to its data version, configuration, and evidence, the design has failed.

## Strategic design principles

1. **Project-first, not page-first.** V2's central move (§5.1). The V1
   information architecture made users carry context between Preflight,
   Forecast, Backtest, Factors, and Scenarios by hand. Navigation is organized
   around the user's recurring work, not around our analytical modules.
2. **One primary action per screen.** These users are interrupted and
   deadline-bound. If a screen offers four equally-weighted next steps, it has
   offered none. Rails that present configuration, context, and interpretation
   at equal volume are the current violation of this.
3. **Progressive disclosure, and mean it.** Specialist analyses stay reachable
   but must not compete with the primary workflow (§5.1). Depth is earned by
   asking, not paid for upfront by everyone.
4. **State is text, not just color.** Stage state and health carry an
   accessible label, never hue alone (§12).
5. **Honest empty and failure states.** The most dangerous defect in a
   forecasting tool is a confident, plausible, wrong number. A blank chart that
   looks fine is a bug. Say what broke and which stage must be rerun.
6. **Persistence is the feature.** Anything that reads as throwaway, a result
   that vanishes on reload, an assumption with no record, contradicts the
   thesis.

## Accessibility requirements

From design §12, all mandatory:

- The complete workflow is keyboard accessible.
- The Studio stepper exposes stage state through text and ARIA, not color alone.
- Charts retain accessible summaries and data-table alternatives for critical
  results.
- Progress uses live regions without announcing every percentage tick.
- Target WCAG AA contrast in both light and dark themes.

## Copy rules

- **No em dashes.** Not in UI copy, not in docs. Commas, colons, or periods.
  This is a global preference and a repo convention.
- Distinguish association, predictive evidence, backtest performance, and
  post-issue accuracy. These are four different claims and must not blur (§12).
- Plain business language. "Data Quality", not "Preflight". The user's
  vocabulary, not ours.
