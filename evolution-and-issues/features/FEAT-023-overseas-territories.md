# FEAT-023 · Overseas territories: show them or not, per country

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** maintainer, while specifying [FEAT-022](./FEAT-022-regional-maps.md): the Canary Islands (and
  other overseas territories) should be something the consumer can choose to show or hide. Deliberately
  left out of FEAT-022 so it can be its own PR.

## What

A way to say, per country, whether its overseas territories are drawn and framed. Today the library
already takes the opposite decision in two places that disagree with each other:

- `zoomTo("ES")` frames Spain **with** the Canary Islands (`DEFAULT_FOCUS_BOUNDS`, a business decision);
  `zoomTo("FR")` frames France **without** Guiana (main body via `getFocusGeometry`).
- FEAT-022 regional maps drop every overseas territory.

Sketch of the API (to be designed, nothing is decided):

```tsx
<ChoroplethMap region="europe" overseas="drop" />        // default: today's behavior in FEAT-022
<ChoroplethMap region="ES" overseas="keep" />            // Spain with the Canary Islands
<ChoroplethMap region="europe" overseas={{ ES: "keep" }} />   // per country
```

Ideas to evaluate: draw the kept territories in place (the fit grows to contain them), or as **insets**
(Canary Islands, Guiana, Réunion in a box next to the mainland, the usual cartographic solution); which
polygons count as "overseas" for each country (today it is a distance heuristic, `near`; a curated list per
country may be needed); whether `DEFAULT_FOCUS_BOUNDS` and this setting become one thing.

## Why

For Spain the Canary Islands are part of the business (stores, sales); for France, Guiana and Réunion may
or may not be. The decision belongs to the consumer, not to a heuristic. With FEAT-022 shipped, a regional
map has no way to include them.

## Acceptance criteria

- `src/core` tests for whichever policy function results, using the `zoom-problem-countries` fixtures
  (FR, ES, PT, NO, NL, US, NZ, RU).
- Stories (visual): Spain with and without the Canary Islands (in place and as an inset), France with and
  without its overseas departments, a regional map mixing both policies.
- Interaction with drill-down: drilling into a country with its territories kept frames the same thing the
  parent showed.

## Notes

- Depends on FEAT-022 (the `trimToMainBody` policy parameter is the extension point).
- Related: ISSUE-004 (Russia and the antimeridian), `DEFAULT_FOCUS_BOUNDS`.
