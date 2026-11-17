import { color, lab } from "d3-color";
import { interpolateHcl, interpolateLab, interpolateRgb, piecewise } from "d3-interpolate";
import type { Interpolator } from "./palettes";

/**
 * Color space the ramp is interpolated in. `rgb` is what a CSS gradient does; `lab` and `hcl` give steps
 * that look evenly spaced to the eye (a black → blue ramp in `rgb` loses most of its contrast in the lower half).
 */
export type RampSpace = "rgb" | "lab" | "hcl";

/**
 * A ramp the consumer defines, instead of a named palette:
 *  - `["#fff", "#888", "#2563eb"]`: N stops, evenly spaced;
 *  - `{ from, to }`: two colors;
 *  - `{ stops, space }` / `{ from, to, space }`: the same, choosing the interpolation space (default `rgb`).
 */
export type CustomRamp =
  | readonly string[]
  | { from: string; to: string; space?: RampSpace }
  | { stops: readonly string[]; space?: RampSpace };

/**
 * A diverging ramp of your own: one color per side and one for the middle (the midpoint), e.g.
 * `{ negative: "#dc2626", neutral: "#f5f5f5", positive: "#2563eb" }`.
 */
export type DivergingRamp = {
  negative: string;
  neutral: string;
  positive: string;
  space?: RampSpace;
};

export const DEFAULT_RAMP_SPACE: RampSpace = "rgb";

const SPACES = { rgb: interpolateRgb, lab: interpolateLab, hcl: interpolateHcl } as const;

/** `palette` is a custom ramp, not the name of a built-in one. */
export const isCustomRamp = (palette: unknown): palette is CustomRamp | DivergingRamp =>
  typeof palette === "object" && palette !== null;

const describe = (ramp: unknown): string => {
  try {
    return JSON.stringify(ramp);
  } catch {
    return String(ramp);
  }
};

const stopsOf = (
  ramp: CustomRamp | DivergingRamp,
): { stops: readonly string[]; space: RampSpace } => {
  if (Array.isArray(ramp)) return { stops: ramp as readonly string[], space: DEFAULT_RAMP_SPACE };
  const object = ramp as {
    from?: string;
    to?: string;
    stops?: readonly string[];
    negative?: string;
    neutral?: string;
    positive?: string;
    space?: RampSpace;
  };
  const space = object.space ?? DEFAULT_RAMP_SPACE;
  if (object.neutral !== undefined) {
    return { stops: [object.negative as string, object.neutral, object.positive as string], space };
  }
  if (Array.isArray(object.stops)) return { stops: object.stops, space };
  if (object.from !== undefined || object.to !== undefined) {
    return { stops: [object.from as string, object.to as string], space };
  }
  throw new Error(
    `[choropleth] palette: a custom ramp is ["#from", …, "#to"], { from, to }, { stops } or { negative, neutral, positive } (received: ${describe(ramp)}).`,
  );
};

/**
 * Turns a custom ramp into the function `t ∈ [0, 1] → CSS color` the scales use. Throws, saying what to pass,
 * on fewer than two colors, on a color the browser would not understand, or on an unknown space: an invalid
 * color would otherwise paint the whole map with `rgb(NaN, NaN, NaN)`.
 */
export const createRampInterpolator = (ramp: CustomRamp | DivergingRamp): Interpolator => {
  const { stops, space } = stopsOf(ramp);
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error(
      `[choropleth] palette: a custom ramp needs at least two colors, a start and an end (received: ${describe(ramp)}).`,
    );
  }
  for (const stop of stops) {
    if (typeof stop !== "string" || color(stop) === null) {
      throw new Error(
        `[choropleth] palette: "${String(stop)}" is not a CSS color. Use "#2563eb", "rgb(37, 99, 235)" or a color name.`,
      );
    }
  }
  if (!(space in SPACES)) {
    throw new Error(
      `[choropleth] palette: unknown space "${String(space)}". Use one of: ${Object.keys(SPACES).join(", ")}.`,
    );
  }
  return piecewise(SPACES[space], [...stops]);
};

/**
 * A ramp whose ends differ in lightness (L\* in CIE Lab, 0 = black, 100 = white) by less than this does not read as
 * "more → less": the low and the high end are hard to tell apart. A rule of thumb, not a standard: ColorBrewer's
 * sequential ramps span 60 or more; black → #2563eb spans 42, white → #2563eb 55.
 */
export const MIN_LIGHTNESS_SPAN = 50;

/**
 * Readability problem of a custom ramp, as a message, or `null` if there is none. Called in development only, so a
 * ramp that looks fine in the code but reads badly on the map says so in the console: its two ends are too close in
 * lightness (see `MIN_LIGHTNESS_SPAN`).
 */
export const diagnoseRamp = (ramp: CustomRamp): string | null => {
  createRampInterpolator(ramp); // an invalid ramp fails here, with its own message
  const { stops } = stopsOf(ramp);
  const first = stops[0] as string;
  const last = stops[stops.length - 1] as string;
  const span = Math.abs(lab(first).l - lab(last).l);
  return span < MIN_LIGHTNESS_SPAN
    ? `[choropleth] palette: ${first} and ${last} differ by ${Math.round(span)} points of lightness (L*), under ${MIN_LIGHTNESS_SPAN}: the low and high ends are hard to tell apart. Use a lighter start or a darker end, or silence this with \`diagnostics={false}\`.`
    : null;
};

/**
 * One color per class from a custom ramp, **end to end**: the first class is exactly the first color and the
 * last one the last color. (The named ramps start at 0.15 because ColorBrewer's begin almost white; here the
 * consumer chose the ends, so none of the range is thrown away.) A single class gets the middle of the ramp.
 */
export const sampleRampColors = ({
  interpolate,
  classes,
}: {
  interpolate: Interpolator;
  classes: number;
}): string[] =>
  Array.from({ length: classes }, (_, i) => interpolate(classes === 1 ? 0.5 : i / (classes - 1)));
