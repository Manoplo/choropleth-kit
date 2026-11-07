import type { Feature, Geometry, Polygon, Position } from "geojson";
import { geoBounds, type GeoPath } from "d3-geo";
import polylabel from "polylabel";
import type { CameraTransform, Extent, Size } from "./camera";
import type { Point } from "./variants";

export type GetFocusGeometryParams = {
  feature: Feature;
  /** An already-projected `geoPath`: areas and distances are measured in pixels, not degrees. */
  path: GeoPath;
  /**
   * A polygon counts as part of the "main body" if the center of its bounds is closer than
   * `near × diagonal(main)` to the center of the main polygon. Defaults to 0.5.
   */
  near?: number;
};

const polygonsOf = (geometry: Geometry): Polygon[] | null => {
  if (geometry.type === "Polygon") return [geometry];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
  }
  return null;
};

/**
 * The "main" sub-geometry of a feature: the polygon with the largest projected area plus the ones
 * close to it (Mallorca, Corsica or Sicily yes; Guyana, Hawaii or the Canary Islands no).
 *
 * Why it exists (dd.md §11.1.5): `geoPath.bounds` / `centroid` of the whole feature include the
 * distant territories. Zooming to "France" would show half the Atlantic, and its bubble would land
 * in the Bay of Biscay. It is used to frame the view and to anchor bubbles and labels.
 *
 * Returns `null` if the feature has no geometry. Non-polygon geometries and lone polygons are
 * returned as they are.
 */
export const getFocusGeometry = ({
  feature,
  path,
  near = 0.5,
}: GetFocusGeometryParams): Geometry | null => {
  const { geometry } = feature;
  if (geometry === null) return null;
  const polygons = polygonsOf(geometry);
  if (polygons === null || polygons.length <= 1) return geometry;

  const measured = polygons.map((polygon) => {
    const [[x0, y0], [x1, y1]] = path.bounds(polygon);
    return {
      polygon,
      area: path.area(polygon),
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      diagonal: Math.hypot(x1 - x0, y1 - y0),
    };
  });
  // A polygon that cannot be measured (outside the projection) cannot be the main one.
  const usable = measured.filter((m) => Number.isFinite(m.area) && Number.isFinite(m.cx));
  const main = usable.reduce<(typeof usable)[number] | undefined>(
    (best, m) => (best === undefined || m.area > best.area ? m : best),
    undefined,
  );
  if (main === undefined) return geometry;

  const kept = usable.filter(
    (m) => m === main || Math.hypot(m.cx - main.cx, m.cy - main.cy) <= near * main.diagonal,
  );
  const [only] = kept;
  return kept.length === 1 && only !== undefined
    ? only.polygon
    : { type: "MultiPolygon", coordinates: kept.map((m) => m.polygon.coordinates) };
};

const ringArea = (ring: readonly Point[]): number => {
  let sum = 0;
  ring.forEach(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length] ?? [x, y];
    sum += x * ny - nx * y;
  });
  return Math.abs(sum / 2);
};

/**
 * Anchor point for bubbles and labels: the "pole of inaccessibility" (`polylabel`) of the largest
 * projected polygon of `geometry`, i.e. the interior point farthest from the edge. Unlike the
 * centroid, it always falls INSIDE the polygon (Chile, Croatia, France).
 *
 * `project` turns [lon, lat] into pixel [x, y] and returns `null` if it cannot. `precision` is in
 * pixels. Returns `null` if there is no projectable polygon.
 */
export const getAnchorPoint = ({
  geometry,
  project,
  precision = 1,
}: {
  geometry: Geometry | null;
  project: (coordinates: Point) => Point | null;
  precision?: number;
}): Point | null => {
  if (geometry === null) return null;
  const polygons = polygonsOf(geometry)?.map((p) => p.coordinates);
  if (polygons === undefined) return null;

  const projected = polygons
    .map((rings) =>
      rings.map((ring: Position[]) =>
        ring.flatMap(([lon, lat]) => {
          const at = lon === undefined || lat === undefined ? null : project([lon, lat]);
          return at === null ? [] : [at];
        }),
      ),
    )
    .filter(([outer]) => outer !== undefined && outer.length >= 3);

  const biggest = projected.reduce<(typeof projected)[number] | undefined>((best, rings) => {
    const outer = rings[0] ?? [];
    return best === undefined || ringArea(outer) > ringArea(best[0] ?? []) ? rings : best;
  }, undefined);
  if (biggest === undefined) return null;

  const [x, y] = polylabel(
    biggest.map((ring) => ring.map(([px, py]): [number, number] => [px, py])),
    precision,
  );
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

export type Padding = { top: number; right: number; bottom: number; left: number };

/** Default padding when fitting and when flying to a region, in px (dd.md §11.1.1). */
export const DEFAULT_PADDING = 24;

/** `number` = the same padding on all four sides. */
export const normalizePadding = (padding: number | Padding = DEFAULT_PADDING): Padding =>
  typeof padding === "number"
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding;

export type BoundsToTransformParams = {
  /** What to fit, in canvas pixels: [[x0, y0], [x1, y1]]. */
  bounds: Extent;
  /** The view (the container). */
  size: Size;
  padding?: number | Padding;
  /** [minimum, maximum] of `k`. Unbounded by default. */
  scaleExtent?: readonly [number, number];
};

/**
 * Camera that fits some bounds into the view, with padding in pixels (dd.md §11.1.5). It is the
 * target of "zoom to a country" and of the initial framing. It honors `scaleExtent`: if the country
 * is so small that more zoom than allowed would be needed, it stays at the maximum (and the country
 * is centered).
 *
 * Degenerate bounds (a single point): `k` rises up to the maximum instead of producing `Infinity`. If
 * the padding eats the whole view, `k` drops to the minimum.
 */
export const boundsToTransform = ({
  bounds,
  size,
  padding = DEFAULT_PADDING,
  scaleExtent = [0, Infinity],
}: BoundsToTransformParams): CameraTransform => {
  const [[x0, y0], [x1, y1]] = bounds;
  const { top, right, bottom, left } = normalizePadding(padding);
  const innerW = size.width - left - right;
  const innerH = size.height - top - bottom;
  const raw = Math.min(innerW / (x1 - x0), innerH / (y1 - y0));
  const k = Math.min(scaleExtent[1], Math.max(scaleExtent[0], Number.isNaN(raw) ? 1 : raw));
  return {
    k,
    x: left + innerW / 2 - k * ((x0 + x1) / 2),
    y: top + innerH / 2 - k * ((y0 + y1) / 2),
  };
};

/** Geographic bounds [[lonW, latS], [lonE, latN]]. If `lonE < lonW`, they cross the antimeridian. */
export type LonLatBounds = readonly [Point, Point];

/** Points per side used to sample a geographic rectangle when projecting it. */
const EDGE_SAMPLES = 9;

/**
 * Geographic rectangle → pixel rectangle that contains it. A lon/lat rectangle is NOT a rectangle on
 * screen (parallels curve in Equal Earth, the globe narrows at the poles), so points are projected
 * along its four sides and the minimum box containing them is taken. Points the projection cannot
 * project are discarded; if none remain, it returns `null`.
 *
 * If `lonE < lonW` the rectangle crosses the antimeridian (Fiji, the Pacific). On a flat map that
 * region appears split across both edges and **no rectangle contains both halves** (it would give a
 * box as wide as the whole world): the wider half is framed, just as `getFocusGeometry` keeps the
 * main body.
 */
export const projectBounds = (
  bounds: LonLatBounds,
  project: (coordinates: Point) => Point | null,
): Extent | null => {
  const [[west, south], [east, north]] = bounds;
  if (east < west) {
    const eastHalf: LonLatBounds = [
      [west, south],
      [180, north],
    ];
    const westHalf: LonLatBounds = [
      [-180, south],
      [east, north],
    ];
    return projectBounds(180 - west >= east + 180 ? eastHalf : westHalf, project);
  }
  const samples: Point[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i += 1) {
    const t = i / (EDGE_SAMPLES - 1);
    const lon = west + (east - west) * t;
    const lat = south + (north - south) * t;
    samples.push([lon, south], [lon, north], [west, lat], [east, lat]);
  }
  const projected = samples.flatMap((at) => {
    const p = project(at);
    return p === null ? [] : [p];
  });
  if (projected.length === 0) return null;
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
};

export type GetFocusExtentParams = GetFocusGeometryParams & {
  /** [lon, lat] → canvas pixels; `null` if it does not project. */
  project: (coordinates: Point) => Point | null;
};

/**
 * Pixel bounds of a region's main body: what gets framed when flying to it (dd.md §11.1.5). It is
 * `getFocusGeometry` + its projected bounds, with one special case:
 *
 * **Antimeridian.** The main polygon of Russia (and Fiji's or Alaska's) crosses the ±180° line
 * without being split, and `path.bounds` measures both halves: the framing would span the map from
 * edge to edge, with Chukotka poking out on the opposite side. It is detected with `geoBounds` (which
 * returns `west > east` when crossing) and the wider half is framed (`projectBounds`).
 *
 * Returns `null` if the feature has no geometry or its bounds are not finite.
 */
export const getFocusExtent = ({
  feature,
  path,
  project,
  near,
}: GetFocusExtentParams): Extent | null => {
  const geometry = getFocusGeometry({ feature, path, near });
  if (geometry === null) return null;

  const [[west, south], [east, north]] = geoBounds(geometry);
  if (west > east)
    return projectBounds(
      [
        [west, south],
        [east, north],
      ],
      project,
    );

  const [[x0, y0], [x1, y1]] = path.bounds(geometry);
  return [x0, y0, x1, y1].every(Number.isFinite)
    ? [
        [x0, y0],
        [x1, y1],
      ]
    : null;
};
