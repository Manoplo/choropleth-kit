# FEAT-027 · Features inspired by bklit's choropleth (analysis and plan)

- **Type:** Feature (umbrella: analysis, viability and the plan for several child features)
- **Status:** in progress (package A done; B to E not started)
- **Priority (proposed):** high (top priority, set by the maintainer on 2026-11-23)
- **Origin:** maintainer, after reviewing bklit's choropleth chart (2026-11-23). Branch: `feat/patterns-and-graticule`.

## What

Evaluate what bklit's choropleth offers that we lack (graticule, dot-matrix map, background patterns, click-to-zoom with
a cinematic camera, marker presets) and how viable each piece is for us. Package A (the three "very high" items) is
being built first; the rest stays as analysis until the maintainer picks it.

## Sources and caveats

- Docs: <https://bklit.com/docs/components/choropleth-chart> · Gallery: <https://bklit.com/charts/choropleth-chart>
- Both pages were read as **text** (props tables, code samples, one-line captions). **The live visual effects
  (the tilt, the flight, the dot lattice) were not rendered or seen**; what I say about how they look comes from
  their captions and props. Before committing to anything in sections 4 and 5, open their gallery and
  judge the feel yourself.
- The pages do not state the rendering technology (SVG vs canvas). From the props (`motion` dependency,
  CSS `perspective` distance in px, `depth`) the 3D effect is almost certainly CSS 3D transforms on the
  map's container. That is an inference, not a fact from the docs.
- bklit is a **shadcn-style registry** (you copy the source into your project). Its stack: `d3-geo` (Mercator only),
  `topojson-client` and `motion`. We are an npm library with a different set of strengths (see the last section).

## Summary

| #   | Feature                                         | bklit has it | We have it today                                     | Viability                     | Effort | Suggested order   |
| --- | ----------------------------------------------- | ------------ | ---------------------------------------------------- | ----------------------------- | ------ | ----------------- |
| 1   | Graticule (+ `Sphere`)                          | yes          | no (FEAT-003, proposed)                              | **very high**                 | S      | 1                 |
| 2   | Background pattern behind the map               | yes          | region patterns only (`hatch`, `dots`)               | **very high**                 | S      | 1                 |
| 3   | More region pattern presets                     | yes          | 2 built-in + custom `Defs`                           | **very high**                 | S      | 1                 |
| 4   | Marker presets (shape, pulse, glow, label)      | yes          | `Marker` (HTML, counter-scaled) with a plain dot     | **high**                      | S–M    | 2                 |
| 5   | Alternatives to bubbles                         | no           | `bubbles` variant (you dislike it)                   | **high**                      | M      | 2–3               |
| 6   | Click to zoom (fly to region, back on Esc)      | yes          | flights (`zoomTo`, `resetView`), drill-down on click | **high**                      | S–M    | 2                 |
| 7   | Dot-matrix map (the whole map as a dot lattice) | yes          | no                                                   | **high, with one design cap** | M      | 3                 |
| 8   | Perspective camera (tilt/yaw, pointer-driven)   | yes          | no                                                   | **medium** (risky)            | M–L    | 4                 |
| 9   | Small extras (edge fade, hover grace, etc.)     | yes          | partly (`dimOthers`)                                 | high                          | S      | with their parent |

Effort: S = a day or less, M = a few days, L = a week or more, each with tests and stories as `AGENTS.md` requires.

## Our starting point (what makes most of this cheap)

Checked in the code, not assumed:

- **The map is one SVG with a `<g class="cm-viewport">` whose `transform` is written by `d3-zoom` every frame**,
  not by React ([viewport.tsx](../../src/react/components/viewport.tsx), [use-zoom.ts](../../src/react/use-zoom.ts)).
  The same loop writes `--cm-k`, `--cm-x` and `--cm-y` on the root, so anything that wants to follow
  the camera (labels, HTML markers) does it in CSS, with **zero React renders** while moving. New
  layers should use this mechanism.
- **Camera flights already exist.** `zoomTo(target, { duration, padding })` uses `d3-interpolate`'s
  `interpolateZoom` (van Wijk flights), takes a region id, bounds or center+zoom, returns a promise, and frames a
  region's **main body** (France without Guiana; Spain with the Canaries) ([zoom.ts](../../src/core/zoom.ts), [handle.ts](../../src/react/handle.ts)).
  bklit's "France frames France, not French Guiana" is already solved here.
- **`Marker`** is an HTML element anchored to `[lon, lat]`, positioned with CSS `calc()` over `--cm-*`, counter-scaled by default
  ([marker.tsx](../../src/react/components/marker.tsx)). **Region labels** have collision handling (`placeLabels`).
- **Patterns** are drawn over region colors via `<Choropleth.Defs>`; `empty.pattern` and `getRegionStyle().pattern` exist
  ([patterns.tsx](../../src/react/components/patterns.tsx), [defs.tsx](../../src/react/components/defs.tsx)).
- **Constraints we have to respect:** no animation libraries (FEAT-004 / `dd.md §12.6`: so no `motion`), pure logic in
  `src/core` with tests, bundle budgets in [.size-limit.json](../../.size-limit.json) (`ChoroplethMap` with d3 is limited to 85 KB gzip (raised from 80 KB with the marker labels), and
  FEAT-026 notes it is already near it), `prefers-reduced-motion` must be honored, English everywhere.

---

## 1. Graticule (and `Sphere`)

**What bklit does.** `<ChoroplethGraticule step={[10,10]} stroke strokeWidth hideOnFocus />`: meridians and parallels every 10° by default,
faded out while the camera is focused on a region (`hideOnFocus`, default true).

**Viability: very high.** It is already FEAT-003 (low priority). `d3-geo` is a dependency, so `geoGraticule()` costs
almost nothing in bytes.

**How.**

- `src/core`: a function that returns the graticule path string for the current projection (`geoGraticule().step(step)` through the
  same `geoPath` used for regions), plus the outline (`{ type: "Sphere" }`) for the ocean background. Test it without a DOM.
- `src/react`: a `<Choropleth.Graticule>` layer inside the `Viewport`, drawn **under** regions (or over, configurable), `pointer-events: none`,
  `aria-hidden`, with `vector-effect: non-scaling-stroke` so lines keep their width when zooming.
- Theme tokens for stroke/opacity, tuned for `light`, `dark`, `minimal`, `contrast` (an acceptance criterion already in FEAT-003).
- A `ChoroplethMap` prop (`graticule: true | { step, ... }`) for the one-liner API.

**Risks / decisions.**

- Regional maps and admin-1 geographies fit the projection to a country: a 10° grid is meaningless at that scale. Default `step`
  should depend on the fitted extent, or the graticule should be opt-in (recommended).
- `hideOnFocus` only makes sense with click-to-zoom (section 6); for us, a general "fade when zoom > N" is simpler.

## 2. Background pattern behind the map

**What bklit does.** `<ChoroplethBackground pattern="dots" color opacity fadeHorizontal fadeVertical hideOnFocus />`: a static
pattern behind the map that does **not** zoom, pan or tilt with the camera, with soft fades at the edges.

**Viability: very high.** This is the cheapest feature on the list, and it needs no SVG at all.

**How.** A `<div>` behind the `<svg>` with a CSS `background-image` (`radial-gradient` for dots, `linear-gradient` for grid
and diagonal lines) and a `mask-image` gradient for the edge fade. It is outside the `Viewport`, so it ignores the camera for free.
It could be a `background` prop on `Root` (`{ pattern, color, opacity, fade }`) plus the compound `<Choropleth.Background>`.
Theming through `--cm-background-pattern-*` variables. Pure CSS means zero bundle cost beyond ~0.5 KB of CSS (the CSS budget is 5 KB;
check how close it is).

**Risks.** Low. Print and export (FEAT-007) must decide whether the background is included.

## 3. More region pattern presets

**What bklit does.** `<ChoroplethFeatureComponent patterns={<PatternPreset id preset="diagonal-up" color strokeWidth/>} getFeaturePattern={(f) => id} />`,
from a shared preset catalogue.

**Viability: very high.** We already draw patterns over region colors, and `Defs` accepts custom ones. What we lack is a **catalogue**
(`hatch`, `dots` only). Add `diagonal-up`, `diagonal-down`, `cross-hatch`, `grid`, `waves`, `dots-large`, and let
`getRegionStyle().pattern` accept any preset name. This is a perfect fit for accessibility (telling classes apart without color),
which is a differentiator against bklit. Related: FEAT-012 (patterns that do not scale with zoom) should be done together, otherwise zooming
in makes the hatch lines look thick.

## 4. Marker presets: shape, pulse, glow, label

**What bklit does.** `<ChoroplethMarker coordinates label shape size color stroke pulse glow showLabel />`.
Shapes `circle | triangle | square | diamond | pin` (the pin's tip sits on the coordinate), pulse `none | hover | always`,
outer glow, label beside the marker, label also shown in the tooltip, constant on-screen size, and click flies the camera to it.

**Viability: high.** We have the hard part (anchoring + counter-scaling + clipping + no per-frame React). What is missing is a
**default look**: today the default is a plain dot and you supply your own children.

**How.**

- `shape` as small inline SVG presets (pin, diamond, triangle, square, circle) rendered inside the existing `Marker`; `anchor` already
  covers pin-tip vs center.
- `pulse` and `glow`: **CSS only** (a `@keyframes` ring, `filter: drop-shadow`), with `@media (prefers-reduced-motion: reduce)` turning
  the pulse off. No animation library needed.
- `label` + `showLabel`: render the text next to the marker. Reuse `placeLabels` ([label-layout.ts](../../src/core/label-layout.ts)) so marker labels and
  region labels avoid each other (bklit does not appear to do collision handling; that would be an edge for us).
- Tooltip integration (marker label in the tooltip) and click-to-fly, which depend on section 6.
- Data-driven API on `ChoroplethMap`: `markers={[{ coordinates, label, shape, color }]}`, so level-1 users do not need the compound API.

**Risks.** Marker clusters in dense areas (FEAT-018 covers clustering). A11y: each marker needs a focusable, labelled element if it
is interactive (FEAT-006).

## 5. Alternatives to bubbles

You said bubbles do not convince you. Nothing in bklit replaces them (its markers have a **fixed** px size; "bubble-sized markers" are not
documented), so this is our own design space. The pieces above make most options cheap. Ordered by how much I would recommend them:

| Option                     | What it is                                                                               | Fit                                                                                                  | Effort |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| **Value badges**           | A small pill with the number (`42k`) at each region's anchor, colored by class           | Reads exact values; no overlap-by-size problem; reuses `placeLabels` and the anchor logic of bubbles | S–M    |
| **Marker shapes by class** | Section 4 markers where shape/color encodes the class instead of size (e.g. 3 sizes max) | Honest for ordinal data; no area-perception issues                                                   | S      |
| **Spike / bar markers**    | A thin vertical bar at the anchor whose height encodes the value (the "spike map")       | Overlaps far less than circles in dense areas (Benelux, Balkans); strong visual impact               | M      |
| **Composition markers**    | Pie/donut/stacked bar per region (already FEAT-026)                                      | Only for parts of a whole, not a replacement for a single value                                      | M      |
| **Dot density**            | N dots per region proportional to the value, scattered inside the polygon                | Beautiful, but needs polygon sampling and is hard to read at the exact-value level                   | M–L    |

**Recommendation:** value badges first (smallest change, directly addresses "labels that are not bubbles"), then spike markers if
you want a proportional-symbol alternative. Existing bubble plumbing (anchor point, overlap order, counter-scale) is shared by all of them,
so a `symbol` option on the bubble variant (`"circle" | "badge" | "spike"`) might be cleaner than new variants. This needs a decision from you.

## 6. Click to zoom

**What bklit does.** `clickToZoom`: clicking a region or marker flies the camera to it; clicking it again, clicking empty map or
pressing Escape flies back. `focusMaxZoom` (default 6), `zoomTransition: { duration: 700, ease: [0.83,0,0.17,1] }`.
While focused, only the focused target reacts to hover, other regions stay clickable.

**Viability: high, and mostly wiring.** The flight math exists. What is missing is the **interaction layer**:

- A `clickToZoom` option that calls `zoomTo(regionId)` on region click and `resetView()` on a second click, an empty-map click or `Esc`.
- A custom `ease` (a cubic-bezier) next to `duration`. `d3-ease` is already a dependency; a 4-number bezier is ~15 lines in `core`.
- A max focus zoom (`focusMaxZoom`) so tiny countries (Luxembourg) do not zoom to absurd levels.
- Visual state for the focused region (reuse `Selection`) and dimming of the rest (reuse `dimOthers`).

**The decision it needs.** Clicking a region already means other things for us: `onRegionClick` and **drill-down**. These need to be an explicit
choice instead of two behaviors fighting: a single `onRegionClick` mode (`"drill" | "zoom" | "select" | "none"`), or `clickToZoom` being
mutually exclusive with `drill` (and a console warning prefixed `[choropleth]` if both are set). Drill-down could even reuse the flight as its
transition. Worth deciding before writing code.

## 7. Dot-matrix map

**What bklit does.** `<ChoroplethDotGrid gap dotSize zoomDotSize lattice="hex"|"square" showOcean oceanColor oceanOpacity oceanDotScale edgeFade getFeatureColor />`.
The whole world is a lattice of dots; each dot belongs to the region under its center and is always drawn whole, so borders never cut a dot.
Ocean continues the grid with smaller, dimmer dots; edges fade out. Dots grow as the camera zooms in, and the gallery example caps
`focusMaxZoom` at 2.

**Viability: high.** It is a different _renderer_ for the same data, not a new data model. The important decisions:

**Approach.**

1. `src/core`: given the projected region geometry and a size, generate the lattice (hex or square) and assign each point to a region.
   Point-in-polygon on the projected rings (planar, after projecting; a bounding-box prefilter makes it cheap). The result is a cached list
   `{ x, y, regionId | null }`. This is pure and unit-testable without a DOM. Roughly 10k land+ocean points for a 900×500 map at gap 7:
   computed once per geometry/size, **not** per frame.
2. Rendering without 10k React nodes: group dots **by color class** and draw each group as **one `<path>`** of zero-length segments
   (`M x y h0`) with `stroke-linecap: round` and `stroke-width` = dot diameter. A handful of paths instead of thousands of circles, trivial
   to repaint while `d3-zoom` moves the group. (Canvas is the other option, but our SVG pipeline, markers and a11y all assume SVG.)
3. **Interaction stays on the existing regions**: keep the normal region paths in the DOM as an invisible hit layer (transparent fill), so
   tooltip, selection, keyboard focus and drill-down work unchanged, and the legend and classification (`classify`, `ramps`) are reused as is.
   The dots are purely the visual layer, `aria-hidden`.
4. A `variant`-independent option, e.g. `renderer: "dots"` on the map, so any variant (sequential, diverging, categorical) can be shown as dots.

**The design cap (important).** A dot lattice has a fixed resolution. Zooming in just makes dots bigger (bklit's answer is `zoomDotSize` and
limiting the zoom to 2×). Our zoom goes much further (admin-1 maps, regional maps), where a lattice gets coarse. Options: (a) cap zoom for this
renderer (cheapest, same as bklit), (b) regenerate the lattice at higher density when zoom settles, which is exactly the LOD idea of
**FEAT-010** (more work, but it makes the renderer actually usable with our zoom). Recommend (a) for the first version and (b) only if
people ask.

**Other risks.** Small countries (Luxembourg, Singapore) can get zero or one dot at a coarse gap: need a rule such as "every region with data
gets at least one dot" (assign the nearest lattice point). Edge fade is a CSS/SVG `mask` with a gradient (cheap). Size: the lattice code is
small; no new dependency.

## 8. Perspective camera (tilt, yaw, pointer-driven)

**What bklit does.** `perspective={{ overview: { view: "flat"|"west"|"east"|"pointer", yaw, tilt }, focus: { view: ..."auto", yaw, tilt }, depth: 1600, edgeFade }}`.
The map is tilted in 3D; on focus the camera leans toward the side of the map where the target is (`"auto"`); in `"pointer"` mode the map swings
from a west view to an east view as the mouse crosses it. The tilt animates in the **same eased transition** as the zoom flight. With reduced motion
the camera jumps instead of flying and the pointer camera stays still.

**Viability: medium. Feasible, but this is the one with real risk.** I would keep it **last, opt-in and labelled experimental**.

**How it would work for us.**

- Pure math in `src/core`: resolve `view` + the target's x-position into a `{ yaw, tilt }` pair, interpolate between overview and focus, clamp. Tests
  without a DOM. This part is easy.
- Apply it as a CSS 3D transform on the map's container (`perspective` + `rotateX/rotateY`), driven by CSS variables written per frame by
  the same loop that already writes `--cm-k` (no React renders). The flight in `use-zoom` would also tick the tilt with the same easing.
  Pointer mode is a small `requestAnimationFrame` smoother. No `motion` dependency needed.

**Risks, in order of seriousness.**

1. **Input mapping while tilted.** `d3-zoom` converts pointer coordinates assuming a flat SVG; a CSS 3D transform on the element makes drag and
   wheel-zoom focal points wrong. Hit-testing (which element is hovered) is done by the browser and stays correct, but pan deltas do not.
   Likely solution: while a non-zero tilt is active, manual pan/zoom is disabled and the camera is driven only by clicks/flights/pointer (which is
   what bklit's examples effectively do: they combine `clickToZoom` with perspective, and `zoomEnabled` is a separate prop that is off by default).
   This must be verified in a browser; I have not tested it.
2. **Everything that is not map is tilted too** unless carefully separated: legend, tooltip, zoom controls and breadcrumbs must stay outside the
   transformed element, while HTML `Marker`s (which are positioned from the same `--cm-*` variables) need to be inside it to stay glued to the map.
3. **Rendering quality and performance.** Text inside 3D-transformed layers can blur in Chrome; Safari has its own SVG + 3D quirks; a large SVG
   on a composited layer repaints every frame during a flight. Needs the performance story and a Safari/Firefox check.
4. **Accessibility/comfort.** Must be off under `prefers-reduced-motion` and must never be the default.
5. Interaction with region labels: labels are counter-scaled in 2D; skewed 3D text will look wrong and may need hiding while tilted.

**Cheaper intermediate step.** Ship click-to-zoom (section 6) first. It delivers most of the "cinematic" value (the flight with a custom ease).
Then build a **static** tilt (a fixed `tilt` with no pointer logic) as the proof of concept; if it survives input mapping and the browser matrix, add `focus.view: "auto"`
and the pointer camera.

## 9. Small extras worth taking along

| Extra                                                 | bklit                                            | Our situation                                              | Note                                                                  |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Edge fade (dots, perspective)                         | `edgeFade` (% per side)                          | none                                                       | One CSS `mask-image`; ships with sections 2, 7, 8                     |
| Tooltip grace delay and fade-out                      | `hideDelay: 120`, `exit`                         | not checked                                                | Avoids tooltip flicker when crossing borders; check ours first        |
| Dim other regions on hover                            | `fadedOpacity: 0.4`                              | `dimOthers` + `theme.dim.opacity` exist                    | Already covered                                                       |
| Camera hook                                           | `useChoroplethCamera()` (focus/reset/focusedKey) | `useCamera(selector)` + the handle (`zoomTo`, `resetView`) | Covered; maybe expose a `focusedRegion` selector once section 6 lands |
| Category colors for no-data regions that stay visible | `--chart-scale-01` advice                        | `empty.fill` + `empty.pattern`                             | Covered, and ours is more accessible                                  |
| Distribution as a copy-paste registry (shadcn)        | yes                                              | npm package                                                | Not a goal; mention only if you ever want it                          |

## Where we are already ahead of bklit

So the comparison is balanced: from its docs, bklit has no documented **drill-down**, no **legend component on this chart**, no data
classification (`quantile`, `jenks`, etc.), no **region/admin-1 geographies**, no **declared accessibility story**, no built-in region
**labels with collision handling**, no theming presets, and Mercator is the only projection. Its strengths are purely **presentation**: the
graticule, the dot lattice, the background, the markers and the cinematic camera. That is why most of this list is cheap for us: it is
decoration and camera work on top of an engine that already has the hard parts.

## Progress

- **Package A: done** (including its documentation guide, «Patterns, background and graticule»; with a live example with switches, added after the 0.4.0 release). Graticule (FEAT-003, now `done`), background pattern with edge fades, and a
  catalogue of 32 pattern presets for regions (`emptyPattern`, `getRegionStyle().pattern`) and the background. Story: «Layers / Patterns and graticule».
- **Extra, from validation:** `showAntarctica` (default `false`; a map that drops it uses `aspectRatio="auto"` unless set), so Mercator maps are usable.
  Antarctica is no longer drawn by default on any world map (breaking, pre-1.0).
- **Package B (markers and click): in progress**, tracked in FEAT-028 (marker presets). Click-to-zoom not started.
- Packages C to E: not started.

## Suggested plan

1. **Package A, "decoration" (S, low risk, visible):** graticule + `Sphere` (FEAT-003), background pattern, pattern presets, edge fade.
2. **Package B, "markers and click":** marker presets (shape, pulse, glow, label), click-to-zoom with the `onRegionClick` mode decision,
   custom ease and `focusMaxZoom`.
3. **Package C, "beyond bubbles":** value badges first, then spike markers (needs your decision on a `symbol` option vs new variants).
4. **Package D, dot-matrix renderer:** core lattice + one-path-per-class rendering + invisible hit layer, zoom capped.
5. **Package E, perspective camera:** static tilt proof of concept in a story, then decide.

Per `AGENTS.md`, each package would be split into bounded steps, each with its own story opened in a browser before being marked done.

## Decisions I need from you

1. **Click behavior:** should `clickToZoom` be exclusive with `drill`, or should there be a single `onRegionClick` mode?
2. **Bubble replacement:** value badges, spike markers, or both (and as a `symbol` option or new variants)?
3. **Dot-matrix zoom:** accept the zoom cap for the first version (bklit's approach), or invest in LOD from the start?
4. **Perspective:** is the 3D camera something you want despite its risks, or should we stop at click-to-zoom with a nice ease?
5. **Registration:** do you want me to turn the accepted packages into `FEAT-NNN` documents and add them to the `evolution-and-issues/README.md` table?
