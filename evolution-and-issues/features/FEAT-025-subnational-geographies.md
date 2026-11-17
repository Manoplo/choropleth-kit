# FEAT-025 · Subnational geographies: US states, Spanish regions, NUTS

- **Type:** Feature
- **Status:** in progress (experiment, branch `feat/subnational-geographies`)
- **Priority (proposed):** medium
- **Origin:** a question from the maintainer: the kit only draws countries; users want to map states of the US or
  autonomous communities of Spain.

## What

Make it possible to draw and color **regions inside a country** (US states, Spanish autonomous communities and
provinces, NUTS regions in Europe), with the same API as countries today.

The engine already supports it: `drill` takes a list of levels and each level has its own `geography`
(`src/core/drill-levels.ts`, `geographyKey` for lazy loading, LRU cache). Ids follow ISO 3166-2 (`ES-MD`, `US-CA`).
So what is missing is **data**, and a decision about where that data lives.

Three options, to be compared in the experiment branch:

1. **Consumer-provided geometry.** The consumer loads its own TopoJSON per level. Cost in the library: zero. Works
   today; the feature would only add documentation and a story.
2. **Separate data package** (`choropleth-kit-geo-admin1`, name to decide) with one subpath per dataset
   (`/us-states`, `/es-ccaa`, `/nuts-2`…). Installed only when used; the core package does not grow.
3. **Optional entry point inside the library** (`choropleth-kit/geo/us-states`), tree-shakeable. Most convenient,
   but it adds maintenance to the main package and risks `size-limit` budgets if someone imports it by mistake.

**Decided (maintainer, 2026-11-14): option 3, one package with subpaths** (`choropleth-kit/geo/admin1/us`). Option 1
stays valid for anyone who brings their own geometry. See _Step 3_ below.

## Why

Real questions are often regional: "sales by US state", "unemployment by Spanish autonomous community". Today the
consumer must find, download, simplify and join those geometries alone, and the ids of each dataset rarely match
ISO 3166-2. The goal is a tested, documented source of subnational geometry with ids that match the join.

## Data sources to evaluate

| Source                            | Scope                       | License                | Note                                                           |
| --------------------------------- | --------------------------- | ---------------------- | -------------------------------------------------------------- |
| Natural Earth admin-1             | States and provinces, world | Public domain          | Preferred. 1:10m is heavy; simplify or use 1:50m.              |
| Eurostat NUTS                     | EU regions, levels 1-3      | Reuse with attribution | Good for Spain at NUTS 2 (comunidades) and NUTS 3 (provinces). |
| US Census cartographic boundaries | States, counties            | Public domain          | Direct source for US states.                                   |
| GADM                              | Everything                  | Non-commercial         | **Discarded** for a library that may be used commercially.     |
| geoBoundaries                     | Admin levels, world         | Varies by country      | Check the license per country before using.                    |

Sizes are unknown until measured: the first step generates the TopoJSON and records its size before and after
simplification.

## Acceptance criteria

- **Experiment (first step, in this branch):** a throwaway script (not committed) that builds one dataset
  (US states, then Spanish comunidades) from its source, simplifies it, and renders it with the real
  `createProjection` and `getFocusGeometry`. Record size (raw, gzip), render time and any framing problem
  (islands such as Hawaii or the Canaries, which are not in 1:110m).
- **Decision recorded here** after the experiment: which option (1, 2 or 3), which source, which resolution.
- If option 2 or 3 is chosen:
  - Build script (in the style of `scripts/build-geo/build-world-110m.mjs`) that downloads, converts to TopoJSON,
    simplifies and normalizes ids to ISO 3166-2. Reproducible, the output is committed or built on install,
    and the decision is written down.
  - Tests: every id of the geometry matches a row of the data table; no duplicate ids; ids follow `CC-XX`.
  - Attribution and license file for the data.
  - A story per dataset, with drill from the country: `ES` → `ES-MD` (Madrid), `US` → `US-CA`. Visual check in the
    browser before marking ✅.
  - `pnpm size` stays within budget for the core package (the data must not enter it unless option 3 is chosen,
    and then only in its own entry point).
- README section with the one-liner first.

## Experiment results (2026-11-14, throwaway scripts in the scratchpad, nothing committed)

Source: Natural Earth admin-1 (`states_provinces`), version 5.1.1 files as published on 2022-05-08, downloaded from
`naciscdn.org/naturalearth/{10m,50m}/cultural/`. Both are public domain.

**Coverage and size** (GeoJSON with only `id`, `name`, `country`; coordinates rounded to 5 decimals):

| Resolution | Features | Countries | GeoJSON raw | GeoJSON gzip |
| ---------- | -------- | --------- | ----------- | ------------ |
| 50m        | 294      | **9**     | 1.46 MB     | 0.51 MB      |
| 10m        | 4,596    | **241**   | 26.9 MB     | 8.75 MB      |

**TopoJSON at 10m** (one file with all features, quantized to 1e5, simplified with `topojson-simplify`):

| Simplification (min weight) | Raw     | gzip    |
| --------------------------- | ------- | ------- |
| none                        | 7.05 MB | 1.71 MB |
| 0.01                        | 3.76 MB | 1.07 MB |
| 0.05                        | 2.57 MB | 0.65 MB |

Conclusions:

1. **50m does not cover the goal.** It has states for only 9 countries (RU, US, IN, ID, CN, BR, CA, AU, ZA). Anything
   beyond "the big nine" needs 10m.
2. **10m is the working resolution**, and the 50m tier is not worth carrying as a second option.
3. Per country the files are small (one country is a fraction of the total), so the total of 0.65-1.7 MB gzip is
   the cost of shipping **everything**; a consumer loading one country pays only that country. Per-country sizes
   still to be measured when the build is written.
4. The Natural Earth README and this table use version 5.1.1 data. The exact version must be recorded in the build
   script.

**Problems in the ids (the real finding of the experiment):**

- **188 features have no real ISO 3166-2 code.** They carry placeholders such as `-99-X16~`, `AE-X01~` or `XK-X02~`:
  Dhekelia, Somaliland, UNDOF, Western Sahara, Kosovo's municipalities, St. Martin… Several are disputed territories,
  so they connect to the library's disputed-borders policy. They must get a documented policy (exclude, or give them a stable id outside ISO).
- **60 real codes are shared by several units.** Examples: Bosnia's nine cantons all carry `BA-BIH`; `MZ-L` and
  `MW-CT` appear twice with the same name (probably split polygons of one unit); `KZ-ALA` covers both the region and
  Almaty City. A join by id is ambiguous for those rows, so the build must either merge the duplicated polygons or
  pick a different id for the units that the source gets wrong.
- Net effect: 4,596 features give **4,313 distinct valid codes**, plus 188 placeholders.

### Render (US and Spain, real `createProjection` / `getFocusExtent` / `boundsToTransform`, Edge headless)

The child level is drawn on the **world projection** with the camera framed on the parent country's focus extent,
which is how the drill works (the child projection derives from the root one). Findings:

- **United States: the drill framing is right.** The 48 contiguous states fill the view; Alaska and Hawaii fall outside
  it. Fitting a projection to all 51 features instead (what a naive child level would do) shrinks the contiguous US to
  a fraction of the view because of Alaska. So the child must not fit its own collection; Alaska and Hawaii stay
  unreachable until FEAT-023.
- **Spain: the drill framing works, with the existing `DEFAULT_FOCUS_BOUNDS` for `ES`** (peninsula + Canary Islands).
  The Canaries are there at 10m, which 1:110m does not draw. The peninsula takes about a third of the view because the
  box includes the Atlantic strip down to the Canaries; that is the framing choice already made, not a data problem.
- **Bug found in the build pipeline: simplification inverts tiny rings.** After `topojson-simplify` (min weight 0.01),
  two polygons (a 5-point island of North Carolina's Outer Banks and one in Hong Kong) come out with reversed
  winding, and d3 reads each as "the whole sphere minus the island": the first render painted the whole map purple and
  hid several states. The source data had zero such features. Re-orienting the 2 polygons (`geoArea > 2π` → reverse
  the rings) fixes it. **The build must do this and the tests must assert `geoArea < 2π` for every feature.**
- **Natural Earth's admin-1 is not the same level everywhere.** For Spain it gives the **52 provinces** (`ES-M`,
  `ES-L`, `ES-GI`… with old Spanish names such as Lérida or Gerona), **not the 17 autonomous communities**
  (`ES-MD`…). The US gives 51 (50 states + DC), France 101 (departments), Germany 16 (Länder), China 32, the UK 232
  (districts). The example `ES` → `ES-MD` in the drill JSDoc therefore does not match this data. Autonomous
  communities need another source (Eurostat NUTS 2 or IGN) and are a separate decision.
- Counting is cheap, naming is not: every country's level and naming scheme has to be documented in a table.

The experiment's own scripts stay in the scratchpad.

## Step 2 (2026-11-14): the build, with the decisions taken

**Decided by the maintainer:** include **everything Natural Earth admin-1 has** (no per-country screening), at
**1:10m**, and for Spain go with the **provinces** that admin-1 gives. Autonomous communities, or any other
grouping, are decided later, country by country, if they are needed.

**What exists now** (nothing committed; run `git status`):

- `scripts/build-geo/build-admin1.mjs`: downloads the pinned Natural Earth file (tag `v5.1.1`, **SHA-256 checked**,
  the build refuses to run on a different file), applies the id policy, and writes `src/geo/admin1/<cc>.json`
  (one TopoJSON per country, lower-case alpha-2) plus `src/geo/admin1/manifest.json`. Run by hand, output committed
  (like `world-110m.json`). Needs Node >= 22.18. New devDependencies: `topojson-server`, `@types/topojson-server`.
- `src/geo/admin1-build.ts`: the pure logic (id policy, pruning), **not exported from any index**.
- `src/geo/admin1-build.test.ts`: 16 tests, on the logic and on the generated data.

**Result:** 238 country files, 4,564 units, 7.57 MB raw (about 2.0 MB gzip for all countries together; the
largest country, Canada, is about 106 KB gzip; most are a few KB). Quantization is a 1e4 grid **per country** with no
simplification: `topojson-simplify` made the files bigger (it adds a third coordinate to every point).

**Id policy** (it is in the JSDoc of `normalizeAdmin1` and in the tests):

1. A real ISO 3166-2 code that belongs to one feature is the `id`.
2. Same code and same name (several polygons of one unit): **merged** into one feature. 20 codes.
3. Same code, different names (Bosnia's nine cantons all carry `BA-BIH`): **no id for any of them**, because giving it to
   one would silently join the wrong row. 40 codes, listed in `manifest.json` (`ambiguous`).
4. Placeholders (`XK-X02~`) are kept **without an id**: drawn as a non-interactive layer, like Northern Cyprus today.
5. The 12 features with no recognizable country (`-99-X16~`: Somaliland, Dhekelia…) are **dropped** and listed in
   `manifest.json` (`noCountry`).
6. The country of a unit is the **prefix of its code**: `FR-GF` (French Guiana) is in `fr.json`, and `US-PR`
   (Puerto Rico) is in `us.json`, so the US has 52 units (50 states + DC + PR) and there is no `pr.json`.
7. Polygons that quantization leaves wound the wrong way are **pruned** (3 of them); the script fails if any unit
   still covers more than a hemisphere, and so does a test.

**Guards against growing the bundle:** a test fails if `src/react`, `src/core` or `src/geo` index files mention
`admin1`; after `pnpm size`, `dist/` has no admin-1 data and the budgets are unchanged (own code 31.29 KB, real cost
74.12 KB).

**Side effect to review:** `pnpm add` also synced `node_modules` to `tsup` 9.0.0 (already declared in `HEAD` by the
Dependabot PR #22) and pruned orphan `esbuild@0.27.7` entries from `pnpm-lock.yaml`. `pnpm build` and `pnpm size` pass
with it.

## Step 3 (2026-11-14): one package, one subpath per country

**Decided by the maintainer:** the data ships **in the same package**, one subpath per country, loaded on demand.
`0.1.0` is already on npm ([choropleth-kit](https://www.npmjs.com/package/choropleth-kit)), so this goes out in the
next version.

**How it works:**

- `pnpm build` ends with `scripts/build-geo/emit-admin1.mjs`, which writes `dist/admin1/<cc>.js` (an ES module whose
  `default` is the TopoJSON, wrapped in `JSON.parse("…")` because engines parse a JSON string faster than an object
  literal) and `dist/admin1/<cc>.d.ts` (`Topology`) for each of the 238 countries.
- `package.json` has **one wildcard**: `exports["./geo/admin1/*"]` and `typesVersions["*"]["geo/admin1/*"]`.
- Nothing in the library imports those files, so they reach a consumer only through its own `import()`.

**The recipe (explicit loaders, one per country you need):**

```tsx
const admin1 = {
  US: () => import("choropleth-kit/geo/admin1/us"),
  ES: () => import("choropleth-kit/geo/admin1/es"),
};

const levels = defineDrillLevels<Row>([
  { id: "country", geography: world110m, objectName: "countries" },
  { id: "state", objectName: "admin1", geography: (ctx) => admin1[ctx.parentId]() },
]);
```

The drill engine already accepts a function that returns a promise of an ES module and unwraps its `default`, and it
caches the result by parent id. The level ids and `data` must use the ISO 3166-2 ids (`US-CA`, `ES-M`).

> ⚠️ **Write the specifiers out. Do not use a template with a variable** (``import(`choropleth-kit/geo/admin1/${cc}`)``).
> Checked with Vite: it leaves that call as a runtime import of a bare specifier, emits **no chunk** for any country, and
> the browser cannot resolve it. With explicit specifiers Vite emits one `assets/us-….js` chunk per country you list,
> and only those. (This also means the consumer's build contains only the countries it names.)

**Verified:**

- `pnpm check:package` (`publint`, `attw`): clean. `attw` reports the wildcard as `(wildcard)` and does not test it, so the
  smoke test does.
- `pnpm smoke:package` (extended): installs the packed tarball with npm in an empty project, with React 18 and 19,
  renders the 52 US units from `choropleth-kit/geo/admin1/us`, type-checks a strict consumer that passes it as
  `geography`, and **bundles a consumer with Vite**: the US data ends up in its own dynamic chunk (`assets/us-….js`,
  287 KB) and the entry chunk (React + the library) does not contain it.
- `size-limit` has a limit per country: United States 46.7 KB gzip (limit 55), Canada, the largest, 106 KB (limit 120).
  The existing budgets did not move (own code 31.29 KB, real cost 74.12 KB).

**What it costs everyone who installs the package, used or not:** the tarball goes from 13 to 489 files and its
download from about 0.46 MB unpacked to about 2.25 MB packed. The consumer's **bundle** does not grow; its
`node_modules` does. This is the price of option 3 and the reason to revisit option 2 before `1.0` if it bothers.

**Side effects to review:**

- `scripts/smoke-package.mjs` did not run on Windows (it spawned `pnpm` without a shell); it now does. Node prints a
  `DEP0190` deprecation warning for that.
- `choropleth-prepub.md` (a 2026-11-09 review that said `0.1.0` was unpublished) was deleted, and the docs that said
  nothing was published were corrected: `PUBLISHING.md`, `PUBLISHING.es.md`, `README.md`, the publishing decisions (resolved) and
  FEAT-015.

## Step 4 (2026-11-14): the stories

`stories/admin1.stories.tsx`, under **Geo/Admin1 (subnational)** (China is left out of the stories by decision):

- **Drill: US states and Spanish provinces**: world → click the United States or Spain → its units load on demand, with
  the recipe above (`geography: (ctx) => admin1[ctx.parentId]()`).
- **United States (direct)**: the contiguous states with `filterFeatures` (Alaska, Hawaii and Puerto Rico left out).
- **Spain provinces (direct)**: the 50 provinces without the Canary Islands, with a note that Madrid is `ES-M` and
  `ES-MD` does not exist in this data.

**Visual check** (Storybook static build, Edge headless over CDP, real clicks): the direct stories draw 49 and 50
regions; in the drill, clicking the US gives 52 `US-*` units and clicking Spain 52 `ES-*` units, with breadcrumbs
`World › United States of America` / `World › Spain`, a state tooltip, the gray context of the neighbours and **no
console errors**. Spain's framing includes the Canary Islands (`DEFAULT_FOCUS_BOUNDS`), so the peninsula is in the
upper part with a lot of sea and Africa around it: it is the framing already chosen, not a data problem.
**The maintainer's own look at the stories is still pending** (`pnpm storybook`).

The stories import each country's JSON statically as well, only to invent one synthetic row per unit; Vite warns that
the dynamic import then does not move into its own chunk. A real app has its own data and does not do that (the smoke
test already proves the split).

**Not done yet:** the README / npm documentation with the table of countries, their level (provinces in Spain,
departments in France, Länder in Germany…), the recipe and the data notice (Natural Earth, disputed borders).

## Notes

- **Depends on / related to:** FEAT-010 (LOD) because a state map needs more detail than 1:110m;
  FEAT-022 (`region`) for restricting a subnational map; FEAT-023 (overseas) for Hawaii and the Canaries, which the
  1:110m data does not draw (`src/geo/world-110m.json`).
- **Not in scope yet:** provinces of countries other than Spain and the US, municipal levels, custom geometry
  editing, and any data that is not public domain or openly licensed.
- **Decided · scope.** Everything in admin-1 at 1:10m; Spain as provinces; China is **not** in the stories (it is in
  the data). The first pilots are the US and Spain.
- **Decided · packaging.** One package with subpaths (option 3). Revisit a separate data package before `1.0` only if
  the install weight (about 2.25 MB packed) becomes a complaint.
- **Open question · detail of small countries.** The 1e4 grid per country is coarse for the biggest ones (Russia,
  Canada) and fine for small ones; check it in the stories before fixing it.
