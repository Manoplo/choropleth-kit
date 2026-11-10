# FEAT-010 · Zoom: level of detail (LOD)

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** `dd.md §11.1.8`; build diary, «Post-MVP → Zoom: extras».

## What

`geography` accepts a list by zoom threshold (`[{ maxZoom: 3, geography: world110 }, { geography: () => import("…/world-50m") }]`) and switches geometry when a gesture ends across the threshold, with a 150 ms fade.

## Why

1:110m looks polygonal at `k = 8`.
