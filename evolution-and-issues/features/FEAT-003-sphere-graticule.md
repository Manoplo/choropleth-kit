# FEAT-003 · `Sphere` and `Graticule` layers

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** `dd.md §21` task 24; build diary, «Post-MVP → Decorative layers».

## What

The globe background (`Sphere`) and the grid of meridians and parallels (`Graticule`) as optional layers, with `classNames` slots and CSS variables.

## Acceptance criteria

- They respect the projection and do not capture pointer events.
- Themes: visible but discreet in `light`, `dark`, `minimal` and `contrast`.
