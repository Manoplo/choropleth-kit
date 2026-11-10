# ISSUE-001 · The total weight with d3 exceeds 50 KB gzip

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** high
- **Origin:** Step 37 (`size-limit`); `dd.md §14.2`.

## What happens

`dd.md §14.2` sets «< 50 KB gzip (core + react, without geodata)» without clarifying whether d3 counts. Measured at step 37:

| Measure                                 | Gzip      |
| --------------------------------------- | --------- |
| Own code (core + react, external deps)  | ≈ 28.8 KB |
| `ChoroplethMap` with all of d3 included | ≈ 71.6 KB |
| `core` alone with its deps              | ≈ 43.9 KB |

The MVP meets the «own code» reading. With d3 included (what a consumer's bundler sees) it does not.

## Where the weight is

d3-geo ≈ 25 KB min, d3-scale-chromatic ≈ 17 KB min (22 palettes), d3-selection + d3-transition ≈ 24 KB min (only used for zoom), d3-zoom ≈ 9 KB min.

## Ideas

- Load zoom/drill lazily (`import()`), so a static map does not pay for d3-zoom/selection/transition.
- Drop `d3-transition` if flights can be done with `d3-interpolate` + `requestAnimationFrame`.
- Palettes per subpath.

## Pending decision

Fix what the budget counts. Today `.size-limit.json` guards 50 KB (own code) and 75 KB (total with d3).
