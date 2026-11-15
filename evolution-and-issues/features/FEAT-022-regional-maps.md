# FEAT-022 · Regional maps: `region="europe"` / `region={["ES", "PT"]}`

- **Type:** Feature
- **Status:** steps 1-3 are done on branch `feat/regional-maps`. Step 1: the data tables and the pure functions with
  tests. Step 2: the `region` prop in `useChoropleth` / `ChoroplethMap` (`src/react/region.ts`), including `drill` (root
  level), `joinReport.outOfRegion`, the fallback points of microstates, the "region matches nothing" warning and a
  README section. Step 3: `stories/regions.stories.tsx` (a Playground with a region dropdown, a free list, five
  synthetic data sets, drill-down, custom tooltip and hatch toggles, plus one story per preset family), reviewed in
  a real browser (Edge over CDP): Europe, the six continents, France, Russia, Oceania, the worldwide-data story and
  Europe → France → stores → back to Europe. **Left:** the human's visual review of the stories, and the Canary
  Islands / `DEFAULT_FOCUS_BOUNDS` follow-up of FEAT-023. Bundle: `ChoroplethMap` with d3 went from 71.6 to 74.1 KB
  gzip (limit 75 KB), own code from 28.8 to 31.3 KB.

**Found while reviewing the stories (not in the original plan): the antimeridian.** `oceania` (Fiji, New Zealand,
Samoa…) and `RU` straddle ±180°, so a flat world cut there tears them across both edges (Australia ended up as a
sliver). Fix: `regionRotation(features, points)` finds the widest stretch of longitudes the region does not use and
cuts the world there (`projection.rotate([λ, 0])`, longitude only); it returns `undefined` for every region that does
not touch ±180° (Europe, Africa, Asia, the Americas…), which keep the world's orientation. `createProjection`,
`computeAspectRatio` and `buildProjectionChain` take an optional `rotate`; the drill children inherit it because they
copy the parent's rotation. Microstate dots count in the computation so Samoa lands next to Fiji.

## What

One declarative prop, the same in `<ChoroplethMap>` and in `useChoropleth`, that restricts the map to a
set of countries **from the first frame** (no animation, no world visible around it):

```tsx
<ChoroplethMap geography={world110m} region="europe" data={rows} … />
<ChoroplethMap geography={world110m} region={["ES", "PT", "FR"]} … />
<ChoroplethMap geography={world110m} region="ES" … />          // a single country
<ChoroplethMap geography={world110m} region={["europe", "MA"]} … />   // presets and codes can be mixed
```

- `region` accepts a **preset name** (continent, subregion or political/commercial grouping) or an
  **ISO 3166-1 alpha-2 code**, or an array mixing both. Anything else is an error that lists the valid names
  (`[choropleth] region: unknown "Europa". Presets: africa, asia, …`).
- **Overseas territories are always dropped in this FEAT**, using a **curated table** (`OVERSEAS_TERRITORIES`,
  country → lon/lat boxes): France without Guiana, Norway without Svalbard, the US without Hawaii (Alaska
  stays: it is part of the North American mass). **Showing them is a separate feature**
  ([FEAT-023](./FEAT-023-overseas-territories.md), another PR); the table is the extension point (a
  per-country policy just chooses which entries to apply). Not a distance rule: see **Experiment**.
- **Drill-down works on a regional map.** `region` restricts the **root level** of a `drill` list
  (the engine already applies the map-level `filterFeatures` there, `use-drill-engine.ts`); deeper levels
  keep their own geometry. Europe → click Spain → Spanish regions flies and rebases exactly as on the world
  map, because the child projection is derived from the (regional) root projection, not from the world.
  Going back up returns to the regional view, never to the world.
- The projection is fitted to the result, so the region fills the container; `aspectRatio: "auto"` follows
  the region's shape (Chile-like for a tall region, wide for Europe).
- It is **the home view**: `resetView()` returns to it and `zoom.scaleExtent` / pan limits are computed from
  it, so the user cannot zoom out into the rest of the world.

### Presets

Three kinds, all in one flat namespace (camelCase names), all just lists of alpha-2 ids:

1. **Continents** (disjoint, each country in exactly one): `africa`, `asia`, `europe`, `northAmerica` (with
   Central America and the Caribbean), `southAmerica`, `oceania`. Antarctica has no preset.
2. **Subregions** (UN geoscheme, disjoint, each nested in one continent): `northernAfrica`, `easternAfrica`,
   `middleAfrica`, `southernAfrica`, `westernAfrica`, `centralAsia`, `easternAsia`, `southeasternAsia`,
   `southernAsia`, `westernAsia`, `northernEurope`, `westernEurope`, `southernEurope`, `easternEurope`,
   `usAndCanada` (the UN's "Northern America", renamed so it cannot be mixed up with `northAmerica`; it
   includes Greenland and Bermuda), `centralAmerica`, `caribbean`, `australiaAndNewZealand`, `melanesia`,
   `micronesia`, `polynesia`.
3. **Political / commercial groupings** (may overlap with the above and with each other): first cut `eu27`,
   `latam`, `nordics`, `iberia`, `mena`; to confirm with the Inditex tools before building (see Notes).

Pure logic goes in `src/core` (no React, no DOM), exported from `choropleth-kit/core`; the data tables need
the alpha-2 ids, so they live in `src/geo` next to `world110m`:

| Piece                                            | Where      | What it does                                                         |
| ------------------------------------------------ | ---------- | -------------------------------------------------------------------- |
| `REGION_PRESETS`                                 | `src/geo`  | `{ europe: ["AL", "AT", …], westernEurope: […], … }`, exported       |
| `OVERSEAS_TERRITORIES`                           | `src/geo`  | `{ FR: [boxGuiana], NO: [boxSvalbard], US: [boxHawaii] }`, curated   |
| `resolveRegion(region, presets)` → `Set<string>` | `src/core` | validates names, expands presets, merges codes                       |
| `dropOverseas(features, table)` → `Feature[]`    | `src/core` | removes the polygons whose middle is in a listed box; keeps identity |

**Status:** step 1 (the four pieces above, with tests) is done on branch `feat/regional-maps`; the `region`
prop, the join/diagnostics changes and the stories are the next steps.

## Why

Real tools rarely need the whole world: "our European stores", "LATAM", "Spain". Today the consumer must
(a) look up the ISO ids of every country of a continent, (b) pass them to `filterFeatures`, and (c) still
get a broken framing because of overseas territories (below), and (d) silence the join warnings for the
data rows that fall outside. The goal is **one prop and zero geography knowledge** on the consumer side.

## Experiment (2026-11-13): what `filterFeatures` alone gives today

Europe (39 countries, ISO list) over `world110m`, Equal Earth fitted to 560×420, rendered in Edge from a
throwaway script (not committed) that calls the real `createProjection` and `getFocusGeometry`:

| Case                                                       | Result                                                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · `filterFeatures`, Europe without RU                    | **Broken.** Europe is squeezed into the top-right corner: French Guiana (bottom-left) and Svalbard/other far polygons enter the fit. Only 444×420 px used, and most of it is empty sea. |
| B · `filterFeatures`, Europe + RU                          | **Unusable.** Russia (Chukotka included) stretches the box to the whole northern hemisphere; Europe is a few pixels tall.                                                               |
| C · main body only (`getFocusGeometry`), Europe without RU | **Good.** Europe fills the container (521×420). Residual: slivers of Svalbard at the top edge (kept by the default `near = 0.5`).                                                       |
| D · main body only, Europe + RU                            | **Still unusable** (560×88): Russia's _main body_ is all of Siberia. Trimming overseas is not enough for transcontinental countries.                                                    |

Conclusions that shape this FEAT:

1. A plain filter is not enough: **dropping overseas territories is what makes a regional map work**.
2. **A distance rule is not enough either** (measured on every multi-polygon country of `world110m`, polygons
   clustered by bounding-box gap on a fixed 1000×500 Equal Earth): a threshold that drops Svalbard also
   drops Peninsular Malaysia and half of Indonesia, and one that keeps those keeps Svalbard. Hawaii and
   Guiana are easy; Svalbard vs. Malaysia is not separable. So the overseas list is **curated data**, and
   `getFocusGeometry` stays what it is (framing one country). With the curated table the final result
   (`europe`, `northAmerica`, `westernEurope`, `southeasternAsia`, `latam`) fills the container: Europe uses
   541×380 of 560×380, no Svalbard, no Guiana.
3. **Transcontinental countries cannot be solved by trimming.** Decision (maintainer): **no continent preset
   includes Russia**; it is asked for explicitly with its code (`region="RU"`). A preset-level `view`
   (lon/lat box used instead of the geometry's bounds) was considered and is **not** part of this FEAT.
   Combining `["FR", "RU"]` is possible but unusable (Russia stretches the map), by design.
4. **`world110m` does not draw the Canary Islands, the Azores, Madeira, the Balearics or the Caribbean
   territories of the Netherlands** (they are below the 1:110m cutoff). The curated table only lists what
   exists in the data, so Spain, Portugal and the Netherlands come back untouched. The Canaries and the
   rest become relevant with a 1:50m geometry (FEAT-010 / FEAT-023). Side effect to remember:
   `DEFAULT_FOCUS_BOUNDS` frames Spain _with_ the Canaries, but at 1:110m there is nothing drawn there.

## Acceptance criteria

- `src/core` tests (coverage stays ≥ 90 %):
  - `resolveRegion`: preset, code, array, mixed, unknown name (error lists valid ones), duplicates, case
    (`"europe"`, `"Europe"` → decide and test), empty array.
  - `dropOverseas`: France, Norway, US (Hawaii out, Alaska in), identity for untouched countries, no dead
    entries in the table, Europe fits its bounding box, synthetic edge cases.
  - Every id in every preset exists in `world110m` or in `worldFallbackPoints` (guards against typos).
  - Continent presets are pairwise disjoint; subregions are pairwise disjoint and each one is contained in
    exactly one continent; `europe` does not contain `RU`; groupings are free to overlap.
- React tests: `region` filters the features, the projection fit ignores the removed polygons, `resetView()`
  returns to the region, `focusId` / `zoomTo` of a country outside the region does not throw (warns in dev),
  changing `region` re-fits without remounting.
- Drill-down tests: `drill` + `region="europe"` (drill into a country and back: the root view is the
  region, the child projection is continuous with the regional root, breadcrumbs and keyboard unchanged);
  a drill into a country that is outside the region cannot happen (its region is not clickable).
- Join / diagnostics: data rows **outside** the region are not reported as "unmatched" (a separate
  `outOfRegion` count in `JoinReport`), so feeding the same worldwide dataset to several regional maps is
  silent. Rows that match nothing in the world still warn.
- `fallbackPoints` for microstates are kept only if their country is inside the region (Andorra yes in
  Europe, Singapore no).
- Stories (visual, must be opened in the browser before ✅): one per continent preset, a custom list
  (`["ES","PT","FR"]`), a single country, a subregion (`westernEurope`), a grouping (`eu27`), `region` +
  `variant="bubble"`, `region` + drill-down (Europe → Spain → regions), and a before/after of Europe with
  `filterFeatures` vs `region`.
- Bundle: presets are data (~1–2 KB gzip). `pnpm size` must stay within budget; if it does not, `REGION_PRESETS`
  moves to its own entry point so consumers of the full world map do not pay for it.
- README section "Show only a continent or some countries", with the one-liner first.

## Notes

- **Decided (maintainer, 2026-11-13):** Europe without Russia; drill-down must work with `region`; overseas
  territories are a separate feature (FEAT-023); subregions are in scope because they are meaningful
  political and commercial divisions.
- **Decided · Russia.** It is in no preset; it is its own region, asked for by code (`region="RU"`).
  The other transcontinental countries follow the UN geoscheme (TR, KZ, GE, AM, AZ, CY → asia; EG → africa).
  **Open:** the Inditex tools may count TR and CY as Europe; the lists are plain data, adjust after asking.
- **Open question · which groupings.** `eu27`, `latam`, `nordics`, `iberia`, `mena` are a guess. Ask the
  Inditex tools which ones their regional views actually use (`schengen`, `efta`, `gcc`, `asean`, `dach`…)
  and add only those; every grouping is a maintenance cost (EU membership changes).
- **Open question · name matching.** `"europe"` vs `"Europe"` vs `"western-europe"`: proposal is exact
  camelCase and a clear error listing valid names, because TypeScript can then autocomplete the union.
- **Borders.** `createBorders` receives the same filter; the shared-border mesh may still contain overseas
  segments (e.g. France–Suriname). They fall outside the fitted view and are cut by the container; verify, and
  filter the mesh by the trimmed geometry if it shows.
- **Relation to other items.** Replaces the recipe `filterFeatures` + `zoomTo` for the "restricted map" use
  case; `filterFeatures` stays as the low-level escape hatch. Overlaps with FEAT-010 (LOD) only in that a
  regional map will want 1:50m detail sooner than a world map does.
- **Alternatives discarded.** (a) Documenting the recipe only: fails the "extremely simple for the consumer" goal
  and the framing bug of case A is not something a consumer can fix. (b) `initialView: { bounds }`: no
  animation but the world is still drawn and pannable, and the container keeps the world's aspect ratio.
  (c) Shipping per-continent TopoJSON files: duplicates data and cannot express custom country lists.
