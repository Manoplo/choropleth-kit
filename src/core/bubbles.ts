import { scaleSqrt } from "d3-scale";
import { defaultFormatValue } from "./legend";

export const DEFAULT_MAX_RADIUS = 24;

export type RadiusScale = {
  /** Value → radius in pixels. Area proportional to the value. */
  getRadius: (value: number) => number;
  /** Maximum value (radius = `maxRadius`). 0 if there are no positive values. */
  max: number;
  maxRadius: number;
};

export type SizeLegendItem = { value: number; radius: number; label: string };

const isPositive = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * SQUARE-ROOT radius scale: the eye compares areas, not radii. If a store sells twice
 * as much, its circle must have twice the AREA (radius ×1.41), not twice the radius, which would be
 * four times the area.
 *
 * The domain starts at 0 (not at the minimum): a circle of radius 0 represents 0. With a [min, max]
 * domain the minimum value would vanish and the ratios between areas would be false.
 */
export const createRadiusScale = ({
  values,
  maxRadius = DEFAULT_MAX_RADIUS,
}: {
  values: readonly (number | null | undefined)[];
  maxRadius?: number;
}): RadiusScale => {
  let max = 0;
  for (const v of values) if (isPositive(v) && v > max) max = v;

  // With no positive values there is no scale: a [0, 0] domain is avoided, where d3 would return NaN.
  const scale = scaleSqrt()
    .domain([0, max || 1])
    .range([0, maxRadius])
    .clamp(true);
  return { getRadius: (value) => (max === 0 ? 0 : scale(value)), max, maxRadius };
};

/** Three reference circles (¼, ½ and the maximum) to read the size. Empty without positive values. */
export const buildSizeLegend = ({
  scale,
  formatValue = defaultFormatValue,
}: {
  scale: RadiusScale;
  formatValue?: (value: number) => string;
}): SizeLegendItem[] => {
  if (scale.max === 0) return [];
  return [0.25, 0.5, 1].map((fraction) => {
    const value = scale.max * fraction;
    return { value, radius: scale.getRadius(value), label: formatValue(value) };
  });
};
