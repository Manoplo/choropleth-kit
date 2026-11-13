# FEAT-024 · Custom color ramps and fixed domains (share / percentage maps)

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** high
- **Origin:** maintainer, 2026-11-13, on the Inditex tools: "a gradient from black to blue depending on the
  percentage of sales that come from physical stores vs. the .com, for instance on a map of Spain".

## What

Let the consumer say **which colors** and **which range** a continuous scale uses, instead of choosing only
from the named d3 palettes with a range taken from the data.

```tsx
// Share of online sales per province, 0 % (all physical) → 100 % (all .com)
<ChoroplethMap
  variant="sequential"
  getValue={(r) => r.onlineShare} // 0…100
  palette={{ from: "#0a0a0a", to: "#2563eb" }} // custom two-color ramp (or an array of stops)
  domain={[0, 100]} // fixed: 0 % is always the "from" color
  classification={{ method: "linear" }} // continuous gradient, no classes
  formatValue={(v) => `${v} %`}
  legend={{ variant: "bar" }} // gradient bar with 0 % … 100 %
/>
```

Three small pieces, each useful alone:

1. **`palette` as an object or a list of colors**: `{ from, to }`, `["#000", "#888", "#2563eb"]`, optionally
   with the interpolation space (`"rgb"` default, `"lab"` or `"oklab"` for perceptually even steps). Named
   palettes keep working.
2. **`domain: [min, max]`**: today the domain is always the data's min and max (`createColorScale`), so a
   share map whose real values go from 31 % to 74 % stretches the colors over that range and stops meaning
   "0 % → 100 %". A fixed domain also makes two maps comparable (the same color = the same value) and fixes
   the legend ends.
3. **A legend that follows**: the gradient bar already exists for `linear`; it must read the custom colors and
   the fixed domain, and format its ends with `formatValue`.

Typical uses in Inditex tools: online share per country or province, penetration, conversion, growth where
the scale has a natural meaning (0–100 %).

## Why

Business metrics that are shares or rates have a natural range, and the color has to carry it. Today the
only way is to pick the closest named ramp and live with its colors and its data-driven range. A brand or
product convention (black = physical, blue = online) cannot be expressed at all.

## Acceptance criteria

- `src/core` tests: custom ramp from two colors and from N stops; fixed `domain` (values outside it are
  clamped, not extrapolated); `domain` with `classification: quantize`/`threshold`; invalid input (one color,
  `domain[0] >= domain[1]`, unparsable color) fails with a message that says what to pass; coverage stays ≥ 90 %.
- The legend (swatches and bar) shows the fixed ends and the custom colors; `formatValue` applies to both.
- Stories (visual, to be opened in a browser): Spain with a black → blue online-share ramp (needs Spain's
  regions: see Notes), the same data with a named palette for comparison, a fixed vs. data-driven domain.
- `diverging` gets the same treatment (`palette={{ negative, neutral, positive }}`) in a second step, or this
  FEAT says why not.
- README section «Your own colors».
- Bundle: it must fit the budget (`ChoroplethMap` with d3 is at ~74.1 KB of 75 KB gzip, see FEAT-022).
  `d3-interpolate` is already a dependency; `interpolateLab` is a few hundred bytes more, verify with `pnpm size`.

## Notes

- **Contrast warning.** Black → blue is hard to read: both ends are dark, so the lower half of the range
  looks almost the same, and the dark end also sits close to the label and border colors. Worth offering a
  lightness-aware interpolation (`lab`/`oklab`) and a dev-mode warning when the two ends differ in
  luminance by less than a threshold. A light → dark ramp (white → blue) is the safe version; the legend
  and the "no data" gray (`#d4d4d4`) must stay distinguishable from the whole ramp (the code already
  comments this requirement on `DEFAULT_EMPTY_FILL`).
- **Spain's regions.** The library ships countries only; provinces or autonomous communities come from the
  consumer's own geometry (a `geography`, ideally with a `getFeatureId`). A Spain story would need a small
  synthetic or Natural Earth admin-1 file; decide when starting.
- **Two metrics at once** (physical vs. online sales as two numbers, not one share) is already covered by the
  bivariate `bubble` (size = sales, color = another metric). This FEAT is the one-metric, one-ramp case.
- **Related:** ISSUE-013 (legend with equal values: a fixed domain makes it less likely but does not remove it),
  FEAT-011 (ramp reversal: `{ name, reverse: true }` becomes a special case once palettes are objects; decide
  whether to merge the two), FEAT-005 (legend extras).
