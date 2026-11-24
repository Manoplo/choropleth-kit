/**
 * Marker presets: the built-in shapes of `<Choropleth.Marker>` and the normalization of their options.
 *
 * Pure data, no React or DOM. Each shape is ONE closed path in its own `viewBox`, drawn with `currentColor`
 * so the consumer colors it with a prop or CSS. Strokes are centered on the edge, so every path leaves
 * a margin inside its box for them.
 */

export const MARKER_SHAPES = ["circle", "triangle", "square", "diamond", "pin"] as const;
export type MarkerShape = (typeof MARKER_SHAPES)[number];

export const MARKER_PULSES = ["none", "hover", "always"] as const;
/** `"hover"`: a ripple while the pointer is over the marker. `"always"`: a continuous ripple. */
export type MarkerPulse = (typeof MARKER_PULSES)[number];

export type MarkerShapeSpec = {
  /** The viewBox's width and height. The shape's box on screen keeps this proportion. */
  width: number;
  height: number;
  /** Path data, in viewBox units. `evenodd` is used, so a second subpath punches a hole. */
  d: string;
};

export const MARKER_SHAPE_SPECS: Readonly<Record<MarkerShape, MarkerShapeSpec>> = {
  circle: { width: 24, height: 24, d: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z" },
  triangle: { width: 24, height: 24, d: "M12 2L22 21H2z" },
  square: { width: 24, height: 24, d: "M3 3H21V21H3z" },
  diamond: { width: 24, height: 24, d: "M12 1L23 12L12 23L1 12z" },
  // The tip is the bottom-center point of the box, so the pin sits ON the coordinate. The second
  // subpath is the hole in its head.
  pin: {
    width: 24,
    height: 32,
    d: "M12 32C12 32 2 20.5 2 12a10 10 0 1 1 20 0c0 8.5-10 20-10 20zM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z",
  },
};

export const DEFAULT_MARKER_SIZE = 12;
const MIN_SIZE = 2;
const MAX_SIZE = 128;
export const DEFAULT_MARKER_STROKE_WIDTH = 1.5;

export const isMarkerShape = (value: unknown): value is MarkerShape =>
  typeof value === "string" && Object.hasOwn(MARKER_SHAPE_SPECS, value);

export type MarkerPresetOptions = {
  /** Defaults to `"circle"`. */
  shape?: MarkerShape;
  /** Width of the shape's box, in px (a pin is taller, in proportion). Defaults to 12. */
  size?: number;
  /** Ripple. Defaults to `"none"`. */
  pulse?: MarkerPulse;
  /** Blur radius of the outer glow in px; `0` is off. Defaults to 0. */
  glow?: number;
  /** Outline width in px. Defaults to 1.5. */
  strokeWidth?: number;
};

export type ResolvedMarkerPreset = {
  shape: MarkerShape;
  /** The box on screen, in px. */
  width: number;
  height: number;
  d: string;
  /** The viewBox, `"0 0 w h"`. */
  viewBox: string;
  pulse: MarkerPulse;
  glow: number;
  strokeWidth: number;
};

const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Normalizes the options: unknown shapes and pulses fall back to the defaults, numbers are clamped. */
export const resolveMarkerPreset = (options: MarkerPresetOptions = {}): ResolvedMarkerPreset => {
  const shape: MarkerShape = isMarkerShape(options.shape) ? options.shape : "circle";
  const spec = MARKER_SHAPE_SPECS[shape];
  const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, finiteOr(options.size, DEFAULT_MARKER_SIZE)));
  return {
    shape,
    width: size,
    height: (size * spec.height) / spec.width,
    d: spec.d,
    viewBox: `0 0 ${spec.width} ${spec.height}`,
    pulse: MARKER_PULSES.includes(options.pulse as MarkerPulse)
      ? (options.pulse as MarkerPulse)
      : "none",
    glow: Math.max(0, finiteOr(options.glow, 0)),
    strokeWidth: Math.max(0, finiteOr(options.strokeWidth, DEFAULT_MARKER_STROKE_WIDTH)),
  };
};

/**
 * Where the shape sits on its coordinate when the consumer does not say: a pin has its tip there
 * (`"bottom"`); any other shape is centered.
 */
export const defaultMarkerAnchor = (shape: MarkerShape): "bottom" | "center" =>
  shape === "pin" ? "bottom" : "center";
