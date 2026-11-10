# FEAT-009 · Drill-down: what was deferred

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** Build diary, «Post-MVP → Drill: what was deferred»; `dd.md §11.2`.

## What

- Tooltip and hover on the **context** (the gray layers of upper levels).
- A **different `projection` per level** (a 250 ms fade; it is not affine).
- `skipSingleChild`, `exitLevelOnZoomOut`, automatic semantic zoom.
- **Allow dragging over the target region during the flight** (today the filter ignores that press).

## Acceptance criteria

Each point with its story in `DrillDown/*` and a reducer test in `src/core/drill`.
