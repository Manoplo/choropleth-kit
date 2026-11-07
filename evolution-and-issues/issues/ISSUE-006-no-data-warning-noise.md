# ISSUE-006 · The «no data» warning clutters the console with legitimately sparse data

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Finding of step 37 when testing the README example.

## What happens

With 3 countries over a world of 175 regions, the development diagnostic emits `console.warn` «172 region(s) have no data and will use emptyFill». That is normal for sparse data.

## Ideas

Lower it to `console.info`/`debug`, warn only if the share of regions without data exceeds a threshold, or only when `joinData` detects ids that did not join. Today it is turned off with `diagnostics={false}`.

## Where

`src/core/diagnostics.ts` and the effect in `use-choropleth.ts`.
