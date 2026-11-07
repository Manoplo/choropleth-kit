import type { Feature, FeatureCollection, MultiPoint } from "geojson";
import { geoBounds, geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { getFocusGeometry, normalizePadding, type LonLatBounds, type Padding } from "./bounds";
import {
  createProjection,
  projectionFactory,
  rebaseProjection,
  type ProjectionName,
} from "./projection";

/** What is drawn at each depth: the (already filtered) features and how they are identified. */
export type ChainLevel = {
  features: readonly Feature[];
  idOf: (feature: Feature) => string | undefined;
};

export type BuildProjectionChainParams = {
  /** `levels[d]` = what is shown at depth `d`. It has `path.length + 1` elements. */
  levels: readonly ChainLevel[];
  /** Ids from the root: `path[d]` is the region of `levels[d]` that is entered. */
  path: readonly string[];
  name?: ProjectionName;
  width: number;
  height: number;
  padding?: number | Padding;
  /** Explicit framings by id in lon/lat (Spain with the Canary Islands). Overrides the main body. */
  focusBounds?: Readonly<Record<string, LonLatBounds | null | undefined>>;
};

export type ProjectionChain = {
  /** `projections[d]` frames region `path[d − 1]` within `projections[d − 1]` (0 being the world). */
  projections: GeoProjection[];
  /**
   * Id of the region that could not be framed (it is not in the parent level, or has no extent).
   * From there on, the projections repeat the last valid one, so the map does not break.
   */
  missing: string | null;
};

/** Lon/lat bounds as an object `fitExtent` understands: 4 corners and 4 midpoints. */
const boundsToObject = ([[west, south], [east, north]]: LonLatBounds): MultiPoint => ({
  type: "MultiPoint",
  coordinates: [
    [west, south],
    [(west + east) / 2, south],
    [east, south],
    [east, (south + north) / 2],
    [east, north],
    [(west + east) / 2, north],
    [west, north],
    [west, (south + north) / 2],
  ],
});

/**
 * If some bounds cross the antimeridian (`west > east`: Russia, Fiji), on a flat map there is no
 * rectangle containing both halves —it would be as wide as the world—. The wider half is kept,
 * just like `getFocusExtent` does for `zoomTo`.
 */
const widerHalf = ([[west, south], [east, north]]: LonLatBounds): LonLatBounds => {
  if (west <= east)
    return [
      [west, south],
      [east, north],
    ];
  return 180 - west >= east + 180
    ? [
        [west, south],
        [180, north],
      ]
    : [
        [-180, south],
        [east, north],
      ];
};

/** A geometry's focus: itself, or (if it crosses the antimeridian) the box of its wider half. */
const mainBody = (geometry: GeoPermissibleObjects | null): GeoPermissibleObjects | null => {
  if (geometry === null) return null;
  const [[west, south], [east, north]] = geoBounds(geometry);
  return west > east
    ? boundsToObject(
        widerHalf([
          [west, south],
          [east, north],
        ]),
      )
    : geometry;
};

/**
 * The projection chain for the whole route (dd.md §11.2.4): the root is fitted to the world and each
 * level is its parent's with `scale`/`translate` readjusted to the chosen region's main body
 * (`rebaseProjection`). A pure function of (levels, route, size, padding). On resize it is
 * recomputed entirely: one `fitExtent` per level.
 */
export const buildProjectionChain = ({
  levels,
  path,
  name,
  width,
  height,
  padding,
  focusBounds,
}: BuildProjectionChainParams): ProjectionChain => {
  const root = levels[0];
  const collection = (features: readonly Feature[]): FeatureCollection => ({
    type: "FeatureCollection",
    features: [...features],
  });
  const projections: GeoProjection[] = [
    createProjection({
      name,
      width,
      height,
      featureCollection: collection(root?.features ?? []),
    }),
  ];
  const factory = projectionFactory(name);
  const pad = normalizePadding(padding);

  let missing: string | null = null;
  for (let depth = 1; depth <= path.length; depth++) {
    const parent = projections[depth - 1] as GeoProjection;
    const id = path[depth - 1] as string;
    if (missing !== null) {
      projections.push(parent);
      continue;
    }
    const level = levels[depth - 1];
    const feature = level?.features.find((f) => level.idOf(f) === id);
    const bounds = focusBounds?.[id];
    const focus: GeoPermissibleObjects | null =
      bounds != null
        ? boundsToObject(widerHalf(bounds))
        : feature === undefined
          ? null
          : mainBody(getFocusGeometry({ feature, path: geoPath(parent) }));
    if (focus === null) {
      missing = id;
      projections.push(parent);
      continue;
    }
    try {
      projections.push(
        rebaseProjection({ parent, factory, focus, width, height, padding: pad }).projection,
      );
    } catch {
      missing = id;
      projections.push(parent);
    }
  }
  return { projections, missing };
};
