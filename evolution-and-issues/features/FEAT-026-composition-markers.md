# FEAT-026 · Composition per region: pie or stacked-bar markers

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** maintainer, 2026-11-16, on the Inditex tools: the split of sales per country between physical
  stores, the .com and marketplaces (three or more parts of a whole), where a single color ramp cannot say
  "how is it split".

## What

A small chart **anchored to each region**, showing its composition: a pie or donut (the "quesito") or a
stacked bar, one slice per part.

```tsx
<ChoroplethMap
  variant="composition"
  getParts={(r) => ({ stores: r.stores, online: r.online, marketplace: r.marketplace })}
  parts={[
    { key: "stores", label: "Stores", color: "#0a0a0a" },
    { key: "online", label: "Online", color: "#2563eb" },
    { key: "marketplace", label: "Marketplace", color: "#f59e0b" },
  ]}
  chart="pie" // "pie" | "donut" | "bar"
  sizeBy={(r) => r.totalSales} // optional: the chart's area encodes the total, like a bubble
/>
```

- One chart per region, placed at the **anchor point** the bubbles already use (centroid or `getCoordinates`).
- The parts, their order and their colors are declared once; the legend lists them (as the categorical one does).
- Optional `sizeBy`: the chart's area follows the total, reusing the bubble radius scale, so a big market is a
  big pie.
- Parts must be non-negative; a region without data draws nothing.

## Why

A choropleth paints one value per region. Two parts of a whole fit a diverging ramp; three or
more do not: the categorical variant shows only the dominant part and hides how close the others are.
A pie or bar per region keeps the whole split visible and stays readable at the country level, where
filling the region with a gradient would not (the area would encode the wrong thing).

## Acceptance criteria

- `src/core` tests, no React: normalizing parts (negatives, all-zero, missing parts), the angles of each
  slice, the stacked-bar widths, the radius from the total. Coverage stays ≥ 90 %.
- The legend lists the parts with their colors; `formatValue` applies to the values in the tooltip.
- Pies follow zoom: they keep a constant on-screen size (counter-scale), as the bubbles do.
- Stories (visual, to be opened in a browser): Europe by country with three channels, the same with
  `sizeBy`, a stacked-bar version, regions with no data.
- Accessibility: each chart has a text alternative with the parts and their shares.
- Bundle: it must fit the budget (see Notes). The charts should be hand-written SVG arcs; `d3-shape` is not
  needed for a pie.

## Notes

- **Related:** the `Marker` layer (HTML anchored to lon/lat, `<Choropleth.Marker>`): a pie could be a marker with SVG content, or
  this FEAT could reuse its anchoring; decide which comes first. The bubble variant already solves anchor
  point, radius scale, overlap order and zoom counter-scale, so most of the plumbing exists.
- **Discarded: gradients inside each region.** A gradient or hard-stop fill per country makes the fill's
  _area_ (a function of the country's shape and bounding box) carry the share, so the same 30 % looks larger
  in Norway than in Switzerland. Two-part splits are covered by a diverging ramp, three or more by
  this FEAT.
- **Open questions:** overlapping pies in dense areas (Benelux, the Balkans) — shrink, offset with a leader
  line, or rely on zoom; whether `bar` is worth shipping in the first version or only `pie`/`donut`.
- **Budget:** `ChoroplethMap` with all of d3 is at the 75 KB limit (closed with the custom color ramps work); this FEAT needs the
  limit reviewed or code moved to a separately imported entry point.
