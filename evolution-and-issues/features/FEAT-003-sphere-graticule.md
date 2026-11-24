# FEAT-003 · `Sphere` and `Graticule` layers

- **Type:** Feature
- **Status:** done (branch `feat/patterns-and-graticule`; see FEAT-027)
- **Priority (proposed):** low
- **Origin:** `dd.md §21` task 24; build diary, «Post-MVP → Decorative layers».

## What

The globe background (`Sphere`) and the grid of meridians and parallels (`Graticule`) as optional layers, with `classNames` slots and CSS variables.

## Outcome

`graticule` on `ChoroplethMap` / `Svg` (`true`, a step in degrees, or `{ step, outline, above, stroke, strokeWidth }`) and the
`<Choropleth.Graticule>` layer. `outline` draws the outline of the projected world; a filled ocean `Sphere` was not built.
Styled with `--cm-graticule-color` / `--cm-graticule-width`. The grid follows the projection (straight parallels and curved
meridians in `equalEarth`, a rectangular grid in `mercator`); with `mercator` the sphere outline does not draw (it is unbounded).

## Acceptance criteria

- They respect the projection and do not capture pointer events.
- Themes: visible but discreet in `light`, `dark`, `minimal` and `contrast`.
