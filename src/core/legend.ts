import type { ColorScale } from "./scales";

export type LegendItem = {
  color: string;
  label: string;
  /** Lower bound of the class (inclusive). Absent on the "no data" item. */
  from?: number;
  /** Upper bound of the class (exclusive, except on the last class). */
  to?: number;
  /** Number of regions in that class. */
  count: number;
  /** It is the "no data" item (not a class: it has no class index). */
  empty?: true;
};

export type BuildLegendOptions = {
  scale: ColorScale;
  /** One value per region. The same ones used to create the scale. `null`/`NaN` = no data. */
  values: readonly (number | null | undefined)[];
  formatValue?: (value: number) => string;
  /** If given, a "no data" item with this text and the scale's `emptyFill` is appended at the end. */
  emptyLabel?: string;
};

export const defaultFormatValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

// Class index = number of breaks <= value. A value exactly on a break falls in the class ABOVE,
// like d3.scaleThreshold; if it differed, the legend would count regions in one class and the map
// would paint them another color.
export const classIndex = (thresholds: readonly number[], value: number): number => {
  let lo = 0;
  let hi = thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((thresholds[mid] as number) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Turns the scale into legend items reusing ITS breaks and colors (nothing is recomputed), and
 * counts how many regions fall in each class.
 *
 * Continuous scale (`linear`): there are no classes, it returns [] (drawn as a gradient with `scale.domain`).
 */
export const buildLegend = (options: BuildLegendOptions): LegendItem[] => {
  const { scale, values, emptyLabel } = options;
  const format = options.formatValue ?? defaultFormatValue;
  if (scale.kind === "continuous") return [];

  const counts = Array.from({ length: scale.colors.length }, () => 0);
  let empty = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) empty += 1;
    else
      counts[classIndex(scale.thresholds, v)] = (counts[classIndex(scale.thresholds, v)] ?? 0) + 1;
  }

  const items: LegendItem[] = scale.colors.map((color, i) => {
    const from = i === 0 ? scale.domain[0] : (scale.thresholds[i - 1] as number);
    const to = i === scale.colors.length - 1 ? scale.domain[1] : (scale.thresholds[i] as number);
    return { color, from, to, label: `${format(from)} – ${format(to)}`, count: counts[i] ?? 0 };
  });

  if (emptyLabel !== undefined) {
    items.push({ color: scale.emptyFill, label: emptyLabel, count: empty, empty: true });
  }
  return items;
};
