# Evolution and issues

> **The initial phase (MVP, steps 1-37) is closed.** Everything from here on is managed in this folder,
> not in the build diary (`choropleth-build-proccess.md`), which stays as the MVP's historical record.

## How it works

- **One document per item**, so each can be linked, discussed and closed on its own.
- Two types, each in its own folder:
  - [`features/`](./features/): new things to build (`FEAT-NNN-slug.md`).
  - [`issues/`](./issues/): bugs, technical debt, pending decisions and user reports (`ISSUE-NNN-slug.md`).
- Codes are **sequential and never reused**, even if an item is discarded.
- Every document has the same header: type, status, priority (proposed) and origin.
- The priorities of the initial items are a **proposal** made when the MVP closed; the maintainer changes them.

Statuses: `proposed` → `accepted` → `in progress` → `done` (or `discarded`, with the reason in the document).

## How to add one

1. Copy the template ([feature](./TEMPLATE-feature.md) or [issue](./TEMPLATE-issue.md)) into the right folder
   with the next free code and a short `slug`.
2. Fill it in and add a row to the table below.
3. When you start working on it, change its status; when you finish, leave the link to the change and mark it `done`.

The working rules in `AGENTS.md` still apply (one step at a time, tests in `src/core`, no commits
without an explicit request).

## Features (24)

| Code                                                      | Title                                                     | Priority | Status   |
| --------------------------------------------------------- | --------------------------------------------------------- | -------- | -------- |
| [FEAT-001](./features/FEAT-001-labels-layer.md)           | `Labels` layer (country names)                            | high     | proposed |
| [FEAT-002](./features/FEAT-002-marker-layer.md)           | `Marker` layer (HTML that follows the map)                | medium   | proposed |
| [FEAT-003](./features/FEAT-003-sphere-graticule.md)       | `Sphere` and `Graticule` layers                           | low      | proposed |
| [FEAT-004](./features/FEAT-004-motion.md)                 | Motion ⭐: animations and the `animation` prop            | medium   | proposed |
| [FEAT-005](./features/FEAT-005-legend-extras.md)          | Legend: count tween, `filter`, `orientation`, `showEmpty` | low      | proposed |
| [FEAT-006](./features/FEAT-006-accessibility-complete.md) | Full accessibility                                        | high     | proposed |
| [FEAT-007](./features/FEAT-007-export.md)                 | Export: `toSVGString` and `toPNG`                         | medium   | proposed |
| [FEAT-008](./features/FEAT-008-visual-regression.md)      | Visual tests with Playwright                              | medium   | proposed |
| [FEAT-009](./features/FEAT-009-drill-deferred.md)         | Drill-down: what was deferred                             | medium   | proposed |
| [FEAT-010](./features/FEAT-010-zoom-lod.md)               | Zoom: level of detail (LOD)                               | low      | proposed |
| [FEAT-011](./features/FEAT-011-palette-reverse.md)        | Ramp reversal (`palette: { name, reverse: true }`)        | low      | proposed |
| [FEAT-012](./features/FEAT-012-pattern-counterscale.md)   | Patterns that do not scale with zoom                      | low      | proposed |
| [FEAT-013](./features/FEAT-013-scroll-jacking-warning.md) | `scroll-jacking` warning in development                   | low      | proposed |
| [FEAT-014](./features/FEAT-014-docs-site-astro.md)        | Landing page and documentation site (Astro)               | high     | proposed |
| [FEAT-015](./features/FEAT-015-production-v1.md)          | Production and v1.0                                       | high     | proposed |
| [FEAT-016](./features/FEAT-016-globe.md)                  | Globe (`geoOrthographic`)                                 | low      | proposed |
| [FEAT-017](./features/FEAT-017-heatmap-canvas.md)         | `heatmap` on Canvas                                       | low      | proposed |
| [FEAT-018](./features/FEAT-018-clustering.md)             | Point clustering (`supercluster`)                         | low      | proposed |
| [FEAT-019](./features/FEAT-019-vanilla-api.md)            | Vanilla API (no React)                                    | low      | proposed |
| [FEAT-020](./features/FEAT-020-small-multiples.md)        | Small multiples                                           | low      | proposed |
| [FEAT-021](./features/FEAT-021-use-timeline.md)           | `useTimeline`                                             | low      | proposed |
| [FEAT-022](./features/FEAT-022-regional-maps.md)          | Regional maps (`region="europe"`, country lists)          | high     | proposed |
| [FEAT-023](./features/FEAT-023-overseas-territories.md)   | Overseas territories: show or hide, per country           | medium   | proposed |
| [FEAT-024](./features/FEAT-024-custom-color-ramps.md)     | Custom color ramps and fixed domains                      | high     | proposed |

## Issues (13)

| Code                                                         | Title                                                                    | Priority | Status   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ | -------- | -------- |
| [ISSUE-001](./issues/ISSUE-001-bundle-total-with-d3.md)      | The total weight with d3 exceeds 50 KB gzip                              | high     | proposed |
| [ISSUE-002](./issues/ISSUE-002-slow-test-suite.md)           | The test suite is slow                                                   | medium   | proposed |
| [ISSUE-003](./issues/ISSUE-003-cdp-script-not-ci.md)         | `scripts/cdp-story.mjs` is neither wired up nor in CI                    | medium   | proposed |
| [ISSUE-004](./issues/ISSUE-004-russia-bubble-anchor.md)      | Anchor of Russia's bubbles (antimeridian)                                | medium   | proposed |
| [ISSUE-005](./issues/ISSUE-005-disputed-borders.md)          | Disputed borders and regions without an id                               | high     | done     |
| [ISSUE-006](./issues/ISSUE-006-no-data-warning-noise.md)     | The «no data» warning clutters the console with legitimately sparse data | low      | proposed |
| [ISSUE-007](./issues/ISSUE-007-visual-review-pending.md)     | Visual review pending from the human                                     | medium   | done     |
| [ISSUE-008](./issues/ISSUE-008-esm-only.md)                  | ESM-only package                                                         | low      | proposed |
| [ISSUE-009](./issues/ISSUE-009-first-render-not-measured.md) | Render budgets not rigorously measured                                   | low      | proposed |
| [ISSUE-010](./issues/ISSUE-010-profiler-dev-only.md)         | The `Profiler` in the performance story only measures in development     | low      | proposed |
| [ISSUE-011](./issues/ISSUE-011-publishing-pending.md)        | Pending decisions before the first publish                               | high     | proposed |
| [ISSUE-012](./issues/ISSUE-012-historical-docs-spanish.md)   | Two historical documents are still in Spanish                            | low      | proposed |
| [ISSUE-013](./issues/ISSUE-013-legend-single-value.md)       | The legend of a map whose values are all equal shows identical classes   | medium   | proposed |

## Where the initial items come from

The initial items were taken from «Post-MVP», «Known technical debt» and «Open questions» in the diary,
from `coropleth-library.md` (`§17`, `§21`) and from the findings of step 37.
