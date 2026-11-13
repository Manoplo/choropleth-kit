import type { FeatureCollection } from "geojson";
import {
  geoAlbers,
  geoPath,
  geoEqualEarth,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import type { Padding } from "./bounds";
import type { CameraTransform } from "./camera";

// The registry stores FUNCTIONS that create a projection, not already-created projections.
// Why: a d3 projection is a MUTABLE object (scale, center, translation) and `fitSize` modifies it.
// If the registry stored a shared instance, two maps on the same page (or a map that resizes) would
// overwrite each other's scale and look shifted. With a factory, each `createProjection` call gets
// its own clean instance.
const PROJECTIONS = {
  // Equal areas: each country takes up the area that belongs to it. Recommended for the world.
  equalEarth: geoEqualEarth,
  // Compromise projection, pleasant to the eye; distorts areas somewhat.
  naturalEarth: geoNaturalEarth1,
  // Inflates polar areas (Greenland ≈ Africa). Useful for street maps, not for world choropleths:
  // the eye associates more painted area with more importance.
  mercator: geoMercator,
  // Conic for the US (with Alaska and Hawaii repositioned). Looks bad over the whole world.
  albers: geoAlbers,
  // Globe view: only one hemisphere is visible.
  orthographic: geoOrthographic,
} as const satisfies Record<string, () => GeoProjection>;

export type ProjectionName = keyof typeof PROJECTIONS;

/** The factory of a projection by name (each call, a new instance). */
export const projectionFactory = (
  name: ProjectionName = DEFAULT_PROJECTION,
): (() => GeoProjection) => PROJECTIONS[name];

export const DEFAULT_PROJECTION: ProjectionName = "equalEarth";

export type CreateProjectionOptions = {
  /** Projection by name. Defaults to `equalEarth`. */
  name?: ProjectionName;
  /** Container size in pixels. */
  width: number;
  height: number;
  /** Geometry that must fit entirely in `width × height`. */
  featureCollection: FeatureCollection;
  /**
   * `[λ, φ]` rotation applied BEFORE the fit (d3's `projection.rotate`). It moves the antimeridian cut away
   * from the geometry (`regionRotation`): the Pacific or Russia would otherwise be torn across both edges.
   */
  rotate?: readonly [number, number];
};

/**
 * Creates an already-fitted d3 projection (`fitSize`) so the geometry fits the container snugly.
 *
 * Without the fit, a d3 projection uses a fixed scale designed for 960×500: in a different
 * container the map would come out cropped or tiny. `fitSize` computes scale and translation for us
 * (no zoom or center math by hand).
 */
export const createProjection = ({
  name = DEFAULT_PROJECTION,
  width,
  height,
  featureCollection,
  rotate,
}: CreateProjectionOptions): GeoProjection => {
  // ── STEP 1: validate the size. Before creating anything. ──────────────────────────────────────
  // With width or height 0 (a hidden container, or one not yet measured), `fitSize` does not fail: it
  // returns a scale of 0 or NaN, and every `path` comes out as "MNaN,NaN…". The symptom would be an
  // invisible map with no console error. Here it is cut short with a message; the React layer must
  // avoid getting here with size 0 (the container-size hook's job).
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error(
      `[choropleth] createProjection: width and height must be finite numbers > 0 (received: ${width} × ${height}).`,
    );
  }

  // ── STEP 2: new instance. Before the fit, because the fit modifies it. ───────────────────────
  const projection = PROJECTIONS[name]();
  if (rotate !== undefined) projection.rotate([rotate[0], rotate[1]]);

  // ── STEP 3: fit to the container. LAST: it needs the validated size and the instance. ────────
  // With no features there is nothing to fit: `fitSize` would compute with an empty area (infinities).
  // The projection is returned with its default scale, which is valid and simply draws nothing.
  if (featureCollection.features.length === 0) return projection;

  return projection.fitSize([width, height], featureCollection);
};

/** Aspect ratio used if the geometry cannot be measured (the world in Equal Earth). */
export const DEFAULT_ASPECT_RATIO = 960 / 500;

const MIN_ASPECT_RATIO = 0.2;
const MAX_ASPECT_RATIO = 5;

/**
 * width / height the geometry takes up with that projection (`aspectRatio: "auto"`).
 *
 * Chile is very tall and Norway very wide: with a fixed ratio there would be too much or too little
 * space. The projection is fitted to a reference width and the resulting rectangle is measured; the
 * ratio does not depend on the chosen width. It is clamped to [0.2 – 5] so an odd datum (a single
 * island) does not leave a container 1 px tall.
 */
export const computeAspectRatio = ({
  name = DEFAULT_PROJECTION,
  featureCollection,
  rotate,
}: {
  name?: ProjectionName;
  featureCollection: FeatureCollection;
  rotate?: readonly [number, number];
}): number => {
  if (featureCollection.features.length === 0) return DEFAULT_ASPECT_RATIO;
  const base = PROJECTIONS[name]();
  if (rotate !== undefined) base.rotate([rotate[0], rotate[1]]);
  const projection = base.fitWidth(1000, featureCollection);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(featureCollection);
  const ratio = (x1 - x0) / (y1 - y0);
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT_RATIO;
  return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, ratio));
};

// ── rebase (drill-down) ─────────────────────────────────────────────────────────────

/**
 * The affine map `R` such that `to(p) === R(from(p))` for every `p`, where `R(q) = k·q + (x, y)`.
 *
 * It only holds if `from` and `to` share EVERYTHING except `scale` and `translate` (same projection,
 * rotation, center…). Then switching from one to the other is an affine transformation of the
 * pixels, and so it can be expressed as a camera (`CameraTransform`): `R` is at once "how far the
 * parent's camera must move" and "what separates the parent's pixels from the child's".
 */
export const relativeTransform = (from: GeoProjection, to: GeoProjection): CameraTransform => {
  const k = to.scale() / from.scale();
  const [fx, fy] = from.translate();
  const [tx, ty] = to.translate();
  return { k, x: tx - k * fx, y: ty - k * fy };
};

export type RebaseParams = {
  /** The parent level's projection (it is not modified). */
  parent: GeoProjection;
  /** Creates a new projection of the SAME type as `parent` (d3 projections are mutable). */
  factory: () => GeoProjection;
  /** The geometry that must fill the view: the region's main body (`getFocusGeometry`). */
  focus: GeoPermissibleObjects;
  width: number;
  height: number;
  padding: Padding;
};

export type RebaseResult = {
  /** The child's projection, fitted to `focus`. At `k = 1` the precision is full. */
  projection: GeoProjection;
  /** `projection(p) === relative(parent(p))`: the exact destination of the flight and of the context layer. */
  relative: CameraTransform;
};

/**
 * Child-level projection with perfect continuity.
 *
 * Two naive solutions fail: a single projection with a huge `k` (at `k ≈ 300` the 3 decimals of
 * `geoPath` give jagged edges) and a new `fitSize` per level (the child appears at another scale and
 * position: a visible jump). Here the child is the parent's projection with **the same rotation,
 * center and other parameters** and only `scale`/`translate` readjusted (`fitExtent`). That is an
 * affine map of the output, so if the flight ends exactly at `relative`, switching to the child
 * projection with an identity camera paints the **same pixels**.
 */
export const rebaseProjection = ({
  parent,
  factory,
  focus,
  width,
  height,
  padding,
}: RebaseParams): RebaseResult => {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error(
      `[choropleth] rebaseProjection: width and height must be finite numbers > 0 (received: ${width} × ${height}).`,
    );
  }
  const child = copyShape(factory(), parent);
  child.fitExtent(
    [
      [padding.left, padding.top],
      [width - padding.right, height - padding.bottom],
    ],
    focus,
  );
  // An empty or single-point focus has no size: `fitExtent` yields scale 0, Infinity or NaN.
  if (!(child.scale() > 0) || !Number.isFinite(child.scale())) {
    throw new Error(
      "[choropleth] rebaseProjection: the focus geometry has no extent (empty or a single point), so it cannot be fitted.",
    );
  }
  return { projection: child, relative: relativeTransform(parent, child) };
};

/**
 * Copies onto `child` everything that is not `scale`/`translate` (which `fitExtent` sets). If
 * something were missing (e.g. a conic's parallels) the child would no longer be an affine map of
 * the parent.
 */
const copyShape = (child: GeoProjection, parent: GeoProjection): GeoProjection => {
  child.rotate(parent.rotate()).center(parent.center());
  child.angle(parent.angle()).reflectX(parent.reflectX()).reflectY(parent.reflectY());
  child.precision(parent.precision());
  const clipAngle = parent.clipAngle();
  if (clipAngle !== null) child.clipAngle(clipAngle);
  const conic = parent as GeoProjection & { parallels?: () => [number, number] };
  const target = child as GeoProjection & { parallels?: (p: [number, number]) => unknown };
  if (conic.parallels !== undefined && target.parallels !== undefined) {
    target.parallels(conic.parallels());
  }
  return child;
};
