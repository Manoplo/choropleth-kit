# FEAT-001 · `Labels` layer (country names)

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** high
- **Origin:** `dd.md §12` and §21 task 24; build diary, «Post-MVP → Decorative layers». Human decision: out of the MVP, first post-MVP piece.

## What

A layer with region names: collision avoidance, a halo for legibility and visibility by zoom level (`data-zoom-bucket`). It is what a map misses the most.

## Why

Without names on the map, users depend on the tooltip to know what they are looking at.

## Acceptance criteria

- Labels placed with `getAnchorPoint` / `polylabel` (they already exist).
- No overlaps: lower-priority labels are hidden; zooming in reveals more.
- A halo that stays legible over any fill color, also in the `dark` and `contrast` themes.
- A `labels` slot in `classNames` and `--cm-label-*` variables.
- A `Layers/Labels` story and collision tests in `src/core` (a pure function).

## Notes

Depends on the open question about the anchor of Russia's bubbles (ISSUE-004): both share the anchor computation.
