import { interpolateZoom } from "d3-interpolate";
import type { Point } from "./variants";

/**
 * The camera: an affine `transform` `{ k, x, y }` over the already-projected canvas.
 * A canvas point `[px, py]` appears on screen at `[px·k + x, py·k + y]`. `k = 1` is the level's fit
 * (the map fits the container exactly).
 *
 * This whole file is pure math, with no DOM or d3-zoom: it is tested without a browser. What writes
 * the transform to the DOM (`use-zoom.ts`) comes in the next step.
 */
export type CameraTransform = { k: number; x: number; y: number };

/** The camera at the level's fit. */
export const FIT_TRANSFORM: CameraTransform = { k: 1, x: 0, y: 0 };

/** Is the camera (almost) at the fit? Used to disable "reset view". */
export const isFitTransform = (t: CameraTransform, epsilon = 1e-3): boolean =>
  Math.abs(t.k - 1) < epsilon && Math.abs(t.x) < epsilon && Math.abs(t.y) < epsilon;

export type Size = { width: number; height: number };

/** Rectangle [[x0, y0], [x1, y1]]. */
export type Extent = readonly [Point, Point];

/** Canvas → screen. */
export const applyTransform = ({ k, x, y }: CameraTransform, [px, py]: Point): Point => [
  px * k + x,
  py * k + y,
];

/** Screen → canvas. */
export const invertTransform = ({ k, x, y }: CameraTransform, [sx, sy]: Point): Point => [
  (sx - x) / k,
  (sy - y) / k,
];

// ── limits (`constrain`) ────────────────────────────────────────────────────────────────────────

export type ConstrainAxisParams = {
  /** Current translation on this axis. */
  t: number;
  k: number;
  /** Extremes of the content on the canvas (before scaling). */
  c0: number;
  c1: number;
  /** Extremes of the view on screen. */
  v0: number;
  v1: number;
  /** Elastic slack as a fraction of the view size. Defaults to 0 (hard limit). */
  overscroll?: number;
};

/**
 * Allowed translation on ONE axis. d3's default `constrain` leaves a map smaller
 * than the view stuck in a corner; this one **centers** it if it fits and, if it does not fit,
 * prevents its edges from entering the view (plus an optional elastic slack).
 */
export const constrainAxis = ({
  t,
  k,
  c0,
  c1,
  v0,
  v1,
  overscroll = 0,
}: ConstrainAxisParams): number => {
  const size = (c1 - c0) * k;
  const view = v1 - v0;
  if (size <= view) return v0 + (view - size) / 2 - c0 * k; // cabe: centrado
  const slack = view * overscroll;
  const min = v1 - c1 * k - slack; // the content's right edge does not enter the view
  const max = v0 - c0 * k + slack; // nor does the left one
  return Math.min(max, Math.max(min, t));
};

export type ConstrainTransformParams = {
  transform: CameraTransform;
  /** The canvas: normally [[0, 0], [width, height]]. */
  content: Extent;
  /** The view: normally [[0, 0], [width, height]]. */
  view: Extent;
  overscroll?: number;
};

/** `constrainAxis` on both axes. The scale `k` is not touched. */
export const constrainTransform = ({
  transform,
  content,
  view,
  overscroll,
}: ConstrainTransformParams): CameraTransform => ({
  k: transform.k,
  x: constrainAxis({
    t: transform.x,
    k: transform.k,
    c0: content[0][0],
    c1: content[1][0],
    v0: view[0][0],
    v1: view[1][0],
    overscroll,
  }),
  y: constrainAxis({
    t: transform.y,
    k: transform.k,
    c0: content[0][1],
    c1: content[1][1],
    v0: view[0][1],
    v1: view[1][1],
    overscroll,
  }),
});

// ── resizing without a jump ─────────────────────────────────────────────────────────────────────

export type PreserveViewParams = {
  transform: CameraTransform;
  oldSize: Size;
  newSize: Size;
  /** OLD canvas pixels → [lon, lat] (`oldProjection.invert`). */
  invertOld: (point: Point) => Point | null;
  /** [lon, lat] → NEW canvas pixels (`newProjection`). */
  projectNew: (coordinates: Point) => Point | null;
};

/**
 * Equivalent camera after a resize. When the size changes, the projection
 * is refitted and the pixels change: without this, the view would "go back to the fit". The
 * **geographic center** and `k` are preserved: it looks at which [lon, lat] was at the center of the
 * view and places it at the center of the new view.
 *
 * If the center falls outside the projection (ocean beyond the globe) there is no geographic center
 * to preserve: the fit is returned.
 */
export const preserveView = ({
  transform,
  oldSize,
  newSize,
  invertOld,
  projectNew,
}: PreserveViewParams): CameraTransform => {
  const center = invertOld(invertTransform(transform, [oldSize.width / 2, oldSize.height / 2]));
  const projected = center === null ? null : projectNew(center);
  if (projected === null) return FIT_TRANSFORM;
  return {
    k: transform.k,
    x: newSize.width / 2 - transform.k * projected[0],
    y: newSize.height / 2 - transform.k * projected[1],
  };
};

// ── flights ─────────────────────────────────────────────────────────────────────────────────────────

/** Minimum and maximum duration of a flight, in ms. */
export const MIN_FLIGHT_MS = 350;
export const MAX_FLIGHT_MS = 1200;

/** Default curvature (ρ) for dashboards (1.2–1.3): less "jump" than √2. */
export const DEFAULT_FLIGHT_CURVATURE = 1.25;

/**
 * The camera as a `interpolateZoom` "view" (van Wijk and Nuij): [center x, center y, visible width],
 * all three in canvas coordinates.
 */
export const transformToZoomView = (
  { k, x, y }: CameraTransform,
  { width, height }: Size,
): [number, number, number] => [(width / 2 - x) / k, (height / 2 - y) / k, width / k];

// NOTE: at runtime `rho` is a method of the `interpolateZoom` FUNCTION (it returns another function
// with that curvature), but `@types/d3-interpolate` declares it on the already-created interpolator,
// where it does not exist (it is `undefined`). What it really does is typed here; a test checks it.
export const createZoomInterpolator = (rho: number): typeof interpolateZoom =>
  (interpolateZoom as unknown as { rho: (rho: number) => typeof interpolateZoom }).rho(rho);

export type FlightDurationParams = {
  from: CameraTransform;
  to: CameraTransform;
  size: Size;
  /** Speed multiplier (> 1 = slower). Defaults to 1. */
  speed?: number;
  curvature?: number;
};

/**
 * Duration of a flight between two cameras: the "natural" one from `interpolateZoom` (depends on the
 * distance and the scale change) × `speed`, clamped to [350, 1200] ms. Short flights are fast;
 * long ones, readable.
 */
export const flightDuration = ({
  from,
  to,
  size,
  speed = 1,
  curvature = DEFAULT_FLIGHT_CURVATURE,
}: FlightDurationParams): number => {
  const natural = createZoomInterpolator(curvature)(
    transformToZoomView(from, size),
    transformToZoomView(to, size),
  ).duration;
  const scaled = natural * speed;
  if (!Number.isFinite(scaled)) return MIN_FLIGHT_MS;
  return Math.min(MAX_FLIGHT_MS, Math.max(MIN_FLIGHT_MS, scaled));
};

// ── inertia ────────────────────────────────────────────────────────────────────────────────────────

/** Inertia time constant, in ms: iOS's. */
export const INERTIA_TAU_MS = 325;

export type InertiaOffsetParams = {
  /** Release velocity on this axis, px/ms. */
  velocity: number;
  /** ms since release. */
  elapsed: number;
  tau?: number;
};

/**
 * Accumulated displacement (px) `elapsed` ms after release, with exponential decay:
 * `v·τ·(1 − e^(−t/τ))`. It tends to `v·τ` and never exceeds it; with negative or `NaN` `elapsed` it does not move.
 */
export const inertiaOffset = ({
  velocity,
  elapsed,
  tau = INERTIA_TAU_MS,
}: InertiaOffsetParams): number => {
  if (!(elapsed > 0) || !Number.isFinite(velocity)) return 0;
  return velocity * tau * (1 - Math.exp(-elapsed / tau));
};

/** Minimum speed (px/ms) for releasing a drag to start inertia. */
export const INERTIA_MIN_VELOCITY = 0.3;

/** Window of samples used to measure the release velocity, in ms. */
export const INERTIA_WINDOW_MS = 100;

/** A camera position at an instant (ms, from `performance.now()`). */
export type CameraSample = { time: number; k: number; x: number; y: number };

export type ReleaseVelocityParams = {
  samples: readonly CameraSample[];
  /** Instant of release. */
  now: number;
  windowMs?: number;
  minVelocity?: number;
};

/**
 * Velocity `[vx, vy]` (px/ms) at which a drag was released, or `null` if there must be no inertia:
 *  - there was a zoom (`k` changed within the window): inertia is **pan** only;
 *  - the hand stopped before releasing (the last sample is older than the window);
 *  - there are no two samples in the window, or the velocity is below the threshold (0.3 px/ms).
 */
export const releaseVelocity = ({
  samples,
  now,
  windowMs = INERTIA_WINDOW_MS,
  minVelocity = INERTIA_MIN_VELOCITY,
}: ReleaseVelocityParams): Point | null => {
  const recent = samples.filter((s) => now - s.time <= windowMs);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (first === undefined || last === undefined) return null;
  if (recent.some((s) => s.k !== last.k)) return null;
  const dt = last.time - first.time;
  if (!(dt > 0)) return null;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  return Math.hypot(vx, vy) >= minVelocity ? [vx, vy] : null;
};

// ── bubble counter-scaling ─────────────────────────────────────────────────────────────────────

/**
 * What bubbles do when zooming in:
 *  - `"sqrt"` (default): they grow with √k (a sense of depth without covering the country);
 *  - `"screen"`: constant size on screen;
 *  - `"geo"`: they grow with the map (full scale).
 */
export type BubbleScaling = "sqrt" | "screen" | "geo";

/**
 * The value of `--cm-bubble-scale` for a given `k`: the bubble is drawn inside the viewport (which
 * already multiplies by `k`), so it is compensated with `1/√k`, `1/k` or `1`.
 */
export const bubbleScale = (k: number, scaling: BubbleScaling): number => {
  if (!(k > 0) || !Number.isFinite(k)) return 1;
  switch (scaling) {
    case "screen":
      return 1 / k;
    case "geo":
      return 1;
    case "sqrt":
      return 1 / Math.sqrt(k);
  }
};

// ── public view state ───────────────────────────────────────────────────────────────────────────

/** Drill-down level. Same as `DrillLevelInfo` in `react/map-item.ts`. */
export type ViewLevel = { id: string; depth: number };

/** What `onViewChange` receives. */
export type ViewState = {
  /** Camera transform, in level pixels. */
  k: number;
  x: number;
  y: number;
  /** = `k` (1 = the level's fit): a readable alias. */
  zoom: number;
  /** [lon, lat] of the view's center. */
  center: Point;
  /** Visible [[lonW, latS], [lonE, latN]]. Approximate: does not account for the antimeridian. */
  bounds: readonly [Point, Point];
  level: ViewLevel;
};

export type ToViewStateParams = {
  transform: CameraTransform;
  size: Size;
  /** Canvas pixels → [lon, lat] (`projection.invert`); `null` if it falls outside the globe. */
  invert: (point: Point) => Point | null;
  level?: ViewLevel;
};

const WORLD_BOUNDS: readonly [Point, Point] = [
  [-180, -90],
  [180, 90],
];

/** Points per side used to sample the view to estimate the geographic bounds. */
const BOUNDS_SAMPLES = 5;

/**
 * Turns the camera into a `ViewState` with geographic coordinates. The view's corners often fall
 * outside the globe (a world map in Equal Earth is not a rectangle), so the bounds are estimated by
 * sampling a grid over the view and keeping the points that do project. If none does, it returns the
 * whole world and the center `[0, 0]`.
 */
export const toViewState = ({
  transform,
  size,
  invert,
  level = { id: "root", depth: 0 },
}: ToViewStateParams): ViewState => {
  const toCoordinates = (screen: Point): Point | null => {
    const at = invert(invertTransform(transform, screen));
    return at !== null && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? at : null;
  };

  const samples: Point[] = [];
  for (let i = 0; i < BOUNDS_SAMPLES; i += 1) {
    for (let j = 0; j < BOUNDS_SAMPLES; j += 1) {
      const at = toCoordinates([
        (size.width * i) / (BOUNDS_SAMPLES - 1),
        (size.height * j) / (BOUNDS_SAMPLES - 1),
      ]);
      if (at !== null) samples.push(at);
    }
  }

  const lons = samples.map(([lon]) => lon);
  const lats = samples.map(([, lat]) => lat);
  const bounds: readonly [Point, Point] =
    samples.length === 0
      ? WORLD_BOUNDS
      : [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ];
  const center = toCoordinates([size.width / 2, size.height / 2]) ?? [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];

  return {
    k: transform.k,
    x: transform.x,
    y: transform.y,
    zoom: transform.k,
    center,
    bounds,
    level,
  };
};
