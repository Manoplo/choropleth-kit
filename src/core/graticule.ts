import { geoGraticule } from "d3-geo";
import type { MultiLineString } from "geojson";

/** Spacing of the grid in degrees: one number for both axes, or `[longitude, latitude]`. */
export type GraticuleStep = number | readonly [number, number];

export type GraticuleOptions = {
  /** Degrees between meridians and parallels. Defaults to 10. */
  step?: GraticuleStep;
  /** Also draw the outline of the projected world (the `Sphere`). Defaults to `false`. */
  outline?: boolean;
  /** Stroke color (any CSS color). Defaults to `var(--cm-graticule-color)`, then a discreet theme color. */
  stroke?: string;
  /** Stroke width in px; it does not scale with zoom. Defaults to `var(--cm-graticule-width)`, then 0.5. */
  strokeWidth?: number;
  /** Draw it over the regions instead of under them. Defaults to `false`. */
  above?: boolean;
};

export type ResolvedGraticule = {
  step: [number, number];
  outline: boolean;
  stroke: string | undefined;
  strokeWidth: number | undefined;
  above: boolean;
};

export const DEFAULT_GRATICULE_STEP = 10;

const validStep = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 90;

/** `true` = defaults; a number = that step; an object = its options. `false`/`undefined` = no layer. */
export const resolveGraticule = (
  input: boolean | number | GraticuleOptions | undefined,
): ResolvedGraticule | null => {
  if (input === undefined || input === false) return null;
  const options: GraticuleOptions =
    input === true ? {} : typeof input === "number" ? { step: input } : input;
  const raw = options.step ?? DEFAULT_GRATICULE_STEP;
  const [x, y] = typeof raw === "number" ? [raw, raw] : raw;
  return {
    step: [validStep(x) ? x : DEFAULT_GRATICULE_STEP, validStep(y) ? y : DEFAULT_GRATICULE_STEP],
    outline: options.outline === true,
    stroke: options.stroke,
    strokeWidth: options.strokeWidth,
    above: options.above === true,
  };
};

/** The meridians and parallels as one GeoJSON `MultiLineString`, ready for a `geoPath` of the map's projection. */
export const graticuleGeometry = (step: readonly [number, number]): MultiLineString =>
  geoGraticule().step([step[0], step[1]])();
