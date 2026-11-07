// Types only: `import type` is erased entirely when compiling (verbatimModuleSyntax requires it).
// Real impact: these two imports do NOT appear in dist/core.js, so `@types/geojson` and
// `@types/topojson-specification` cost not a single byte at runtime.
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
// The only import with real code in this file. We import only `feature` (not `mesh`, not `merge`):
// the bundler (tsup) can drop the rest of topojson-client and the consumer only downloads what we use.
import { feature } from "topojson-client";

/** Already-loaded geometry. */
export type GeographyData = Topology | FeatureCollection;

/**
 * What the `geography` prop accepts (dd.md §9.2): the data, a promise already in flight, or a
 * function that loads it on demand (`() => import("…/world-110m")`; the whole module with `default` works).
 */
export type GeographyInput =
  | GeographyData
  | Promise<GeographyData | { default: GeographyData }>
  | (() => Promise<GeographyData | { default: GeographyData }>);

/** An ES module (`import()`) brings the geometry in `default`. */
export const unwrapGeography = (
  value: GeographyData | { default: GeographyData },
): GeographyData => ("default" in value ? value.default : value);

export type ToFeatureCollectionOptions = {
  geography: Topology | FeatureCollection;
  /**
   * Which topology object to use (e.g. "countries" or "land" in world-atlas).
   * Ignored if `geography` is already GeoJSON.
   */
  objectName?: string;
};

/**
 * Single entry point for geodata: accepts TopoJSON or GeoJSON and ALWAYS returns a
 * `FeatureCollection`. Everything that follows (joining with the data, projection, SVG paths) can
 * assume that shape and never ask again "what format was I given?".
 *
 * It is a pure, synchronous function: it does not fetch. The deferred load (`() => import(...)`) of
 * `GeographyInput` is resolved in the React layer; here the data arrives already resolved.
 */
export const toFeatureCollection = ({
  geography,
  objectName,
}: ToFeatureCollectionOptions): FeatureCollection => {
  // ── STEP 1: tell the format apart. Must come FIRST. ──────────────────────────────────────────
  // Why it goes first: the two formats have incompatible shapes. A Topology stores `objects` +
  // `arcs`; a FeatureCollection stores `features`. If we called topojson-client's `feature()` with
  // GeoJSON, it would fail with a cryptic internal error
  // ("Cannot read properties of undefined (reading 'arcs')") far from the real cause.
  // Deciding here, with the discriminating field `type`, lets us give a clear error or a shortcut.
  //
  // `type` is read as `unknown` on purpose: at runtime outside JSON arrives (fetch, import) that
  // TypeScript cannot guarantee, so the check has to be real and not just a type check.
  const kind: unknown = (geography as { type?: unknown } | null)?.type;

  // ── STEP 2: shortcut for GeoJSON. BEFORE touching anything TopoJSON. ─────────────────────────
  // The SAME object is returned, uncopied. Real impact: later the SVG paths will be memoized with
  // `useMemo` using this object as a dependency. If we cloned here, every render would produce a new
  // reference, `useMemo` would think the geometry changed and recompute the ~177 `geoPath` paths on
  // every render (on a hover, for example). Returning the same reference is what makes the acceptance
  // criterion "changing indicator does not recompute paths" possible.
  if (kind === "FeatureCollection") {
    return geography as FeatureCollection;
  }

  // Anything else that is not a Topology is a caller error: it is cut off here, before looking for
  // objects, so the message says what really happened.
  if (kind !== "Topology") {
    throw new Error(
      `[choropleth] toFeatureCollection: unrecognized format (type = ${JSON.stringify(kind)}). ` +
        `Expected a "Topology" (TopoJSON) or a "FeatureCollection" (GeoJSON).`,
    );
  }

  const topology = geography as Topology;

  // ── STEP 3: choose the topology object. AFTER knowing it is a Topology. ──────────────────────
  // A TopoJSON can contain several layers (world-atlas ships `countries` and `land`). Painting the
  // wrong one would give a single-continental-polygon map with no id to join the data on. If the
  // user does not say which, we use the first: that is what `dd.md §9.2` does.
  const availableNames = Object.keys(topology.objects);
  const name = objectName ?? availableNames[0];

  // `noUncheckedIndexedAccess` forces us to handle `undefined`; here we turn it into an error that
  // lists the options, rather than letting `feature()` receive `undefined` and fail later.
  const object = name === undefined ? undefined : topology.objects[name];
  if (name === undefined || object === undefined) {
    throw new Error(
      `[choropleth] toFeatureCollection: object "${objectName ?? "(none)"}" does not exist in the topology. ` +
        `Available objects: ${availableNames.length > 0 ? availableNames.join(", ") : "(none)"}.`,
    );
  }

  // ── STEP 4: convert. Only here, with format and object already validated. ────────────────────
  // `feature()` does the expensive, non-trivial work: it walks the shared arcs, undoes the
  // quantization/delta-encoding (`transform`) and rebuilds the real lon/lat coordinates.
  // Real impact: it is what turns a ~100 KB file (borders stored only once) into the complete
  // geometry `geoPath` knows how to draw.
  const converted = feature(topology, object);

  // ── STEP 5: normalize the result. LAST because it depends on what `feature()` returned. ──────
  // `feature()` returns different things depending on the object: a `GeometryCollection` produces a
  // FeatureCollection, but a single-geometry object (e.g. `land` in world-atlas, which is a single
  // MultiPolygon) produces a lone Feature. If we returned it as is, the return type would lie and
  // `.features.map(...)` in the render would break only with some geodata. Wrapping it guarantees
  // the rest of the code only has to know one shape.
  if (converted.type === "FeatureCollection") {
    return converted as FeatureCollection<Geometry>;
  }
  return { type: "FeatureCollection", features: [converted] };
};
