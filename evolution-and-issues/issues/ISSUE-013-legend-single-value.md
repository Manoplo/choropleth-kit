# ISSUE-013 · The legend of a map whose values are all equal shows five identical classes

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** found while reviewing the `Regions/region prop → Russia` story (FEAT-022, 2026-11-13). It
  is not specific to `region`: any map whose joined values are all the same does it. `region` just makes it
  likely (a one-country map has one value; so does a one-country drill level).

## What happens

With a single region with data (`region="RU"`, one datum), the sequential legend prints five classes with the
same range, `26 M€ – 26 M€ (0)` four times and `26 M€ – 26 M€ (1)` once. The scale's domain collapses to a
point (`min === max`), so every threshold equals that value. It reads as a bug to the end user and the classes
carry no information.

Same shape with any equal values: two countries both at 40 %, or a drill level whose children share one figure.

## How to reproduce

1. Storybook → `Regions/region prop → Russia` (it uses `stories/regions.stories.tsx`).
2. Look at the legend (bottom-left).
3. Expected: one entry for the value (or no legend). Actual: five entries, all `26 M€ – 26 M€`.

Without Storybook: `<ChoroplethMap region="RU" data={[{ id: "RU", value: 26 }]} variant="sequential" … />`.

## Environment

`choropleth-kit` 0.1.0 on `feat/regional-maps`; Edge 157 on Windows 11. React 19.

## Ideas / notes

- **Where:** `createColorScale` (`src/core/scales.ts`, domain → thresholds) and `buildLegend` (`src/core/legend.ts`).
  `classify.ts` already guards `classes < 1`; nothing guards `domain[0] === domain[1]`.
- **Fix option A (preferred):** when the domain is a point, collapse to ONE class with a single color (the
  middle of the ramp, or its dark end) and a single legend item labelled with the value (`26 M€`).
- **Fix option B:** hide the legend when there are fewer than two distinct values. Simpler, but the map then
  has no key at all; the tooltip is the only reading.
- **Related edges to cover in the same change:** two distinct values with five classes (`quantize` leaves three
  empty classes: show only the non-empty ones, or fewer classes), `diverging` with all values at the midpoint
  (already special-cased with `|| 1` in the domain), `quantile` with ties.
- **Tests:** `src/core` (`scales` and `legend`) for one value, two values, all-equal values; a story is the
  `Russia` one already in `regions.stories.tsx`.
