# FEAT-028 · Marker presets: shape, pulse, glow, label

- **Type:** Feature
- **Status:** in progress (steps 1 to 3 and 5 done; step 4, click a marker to fly there, waits for click-to-zoom)
- **Priority (proposed):** high
- **Origin:** FEAT-027, section 4 (package B). The maintainer asked for markers other than bubbles.

## What

A default look for `<Choropleth.Marker>` (and the `markers` prop of `ChoroplethMap`), so a marker is useful without writing HTML:

```tsx
<ChoroplethMap
  markers={[
    {
      id: "mad",
      coordinates: [-3.7, 40.4],
      label: "Madrid",
      shape: "pin",
      pulse: "always",
      glow: 6,
    },
    { id: "nyc", coordinates: [-74, 40.7], shape: "diamond", size: 14, color: "#e11d48" },
  ]}
/>
```

## Steps

1. **Done:** `shape` (`circle`, `triangle`, `square`, `diamond`, `pin`), `size`, `color`, `stroke`, `strokeWidth`, `pulse`
   (`none`, `hover`, `always`) and `glow`. Pure data and normalization in `src/core/marker-shapes.ts`; the look in `styles.css`.
   A pin has its tip on the coordinate; the other shapes are centered. Any preset option turns the preset on; your own
   `children` still win. The ripple does not run with `prefers-reduced-motion`.
2. **Done:** `showLabel`, `labelPosition` and `labelPriority`. The label sits beside the marker. Without `labelPosition` the side is automatic
   (right, then left, top, bottom: the first that fits); a label that fits on no side, or would be cut by the map's edge, is hidden.
   Collisions are resolved on the real, measured boxes (`use-marker-label-layout.ts`) when a zoom or pan ends; the logic is pure in
   `src/core/marker-labels.ts`. **Not done:** marker labels do not yet avoid the region names (`regionLabels`), only each other.
3. **Done:** `tooltip` on a marker: `true` shows the `label`, or any content. It is anchored to the marker (not the cursor), shown on hover and
   keyboard focus (the marker becomes focusable and `aria-describedby` points at it), and picks the side that fits inside the map
   (top, bottom, right, left) and slides to stay in (`chooseTooltipSide`, pure, in `src/core/marker-tooltip.ts`). It is separate from the
   map's own `<Tooltip>` (regions and data points).
4. **Blocked on click-to-zoom (FEAT-027, section 6):** click a marker to fly the camera to it.
5. **Done:** documentation, in the «Bubbles and markers» guide and a live example with switches (shape, pulse, glow, labels, tooltip), added once 0.4.0 was published. The options reference page is generated from the published package.

## Acceptance criteria

- Pure logic in `src/core` with tests (done for step 1).
- A story for each step, opened in a browser (step 1: «Layers / Markers → Presets» and «Shapes»).
- Constant on-screen size at any zoom (the existing counter-scale), `scaleWithMap` still works.
- Accessibility: a marker with a `label` has an accessible name; the ripple and glow are decoration.

## Notes

- **Pulse default is `none`**, unlike bklit (`hover`): a ripple is motion, and it should be asked for.
- **No `bubble`-sized markers here.** Alternatives to bubbles (value badges, spikes) are FEAT-027, package C.
- **Open question:** the default outline is white (`--cm-marker-stroke`), like the plain dot. A themed `--cm-marker-*` set may be needed for `dark`.
