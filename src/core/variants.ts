import {
  buildSizeLegend,
  createRadiusScale,
  DEFAULT_MAX_RADIUS,
  type SizeLegendItem,
} from "./bubbles";
import { buildCategoricalLegend, createCategoricalScale, type CategorySpec } from "./categories";
import type { Classification } from "./classify";
import { buildLegend, classIndex, type LegendItem } from "./legend";
import type {
  CategoricalPaletteName,
  DivergingPaletteName,
  SequentialPaletteName,
} from "./palettes";
import { createColorScale, type ColorScale } from "./scales";

/** Point [x, y] in pixels or [lon, lat] in degrees, depending on context. */
export type Point = readonly [number, number];

/**
 * Configuration per `variant`. A discriminated union: each variant requires its
 * own things (`categorical` asks for `getCategory`, `bubble` accepts `getCoordinates`…) and TypeScript
 * rejects invalid combinations, such as a diverging palette on a sequential map.
 */
export type VariantConfig<TDatum> =
  | {
      variant: "sequential";
      getValue: (datum: TDatum) => number | null;
      classification?: Classification;
      palette?: SequentialPaletteName;
    }
  | {
      variant: "diverging";
      getValue: (datum: TDatum) => number | null;
      classification?: Classification;
      palette?: DivergingPaletteName;
      midpoint?: number;
    }
  | {
      variant: "categorical";
      getCategory: (datum: TDatum) => string | null;
      /** Fixed order and colors. */
      categories?: readonly CategorySpec[];
      palette?: CategoricalPaletteName;
    }
  | {
      variant: "bubble";
      /** ABSOLUTE value that gives the circle's AREA. `null`s and values ≤ 0 draw no circle. */
      getValue: (datum: TDatum) => number | null;
      /** Second metric → the bubble's color (bivariate, diverging scale). */
      getColorValue?: (datum: TDatum) => number | null;
      /** The datum's [lon, lat]. Without this, the bubble goes at its region's centroid. */
      getCoordinates?: (datum: TDatum) => readonly [number, number] | null;
      maxRadius?: number;
      /** Single color when there is no `getColorValue`. */
      color?: string;
      classification?: Classification;
      palette?: DivergingPaletteName;
      midpoint?: number;
    };

export type VariantName = VariantConfig<unknown>["variant"];

export type VariantEntry<TDatum> = {
  /** The region's id, or `undefined` if it has none. */
  id: string | undefined;
  /** Datum joined with the region, or `undefined` if there is none. */
  datum: TDatum | undefined;
};

export type Bubble<TDatum> = {
  id: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  /** Value that gives the area. */
  value: number;
  colorValue: number | null;
  datum: TDatum;
  /**
   * The datum's own [lon, lat] (`getCoordinates`), or `null` if the bubble is at its region's centroid.
   * Tells a point (a store) apart from a region's bubble, for interaction purposes.
   */
  coordinates: Point | null;
};

export type VariantResult<TDatum> = {
  /** Color of each region, in the order of `entries`. */
  fills: string[];
  /** Value of each region: number, category (`categorical`) or `null`. */
  values: (number | string | null)[];
  /** `values` already formatted for display ("1.5 %", "Europe"); empty string if there is no value. */
  labels: string[];
  /** Numeric color scale. `null` in `categorical` and in `bubble` without `getColorValue`. */
  scale: ColorScale | null;
  legend: LegendItem[];
  /**
   * Index of the legend CLASS each region belongs to (same order as `fills`), or `null` if it belongs to none
   * (no data, continuous scale, `bubble`). It is what makes it possible to highlight a class without re-rendering.
   */
  classes: (number | null)[];
  bubbles: Bubble<TDatum>[];
  sizeLegend: SizeLegendItem[];
};

export type ResolveVariantOptions<TDatum> = {
  config: VariantConfig<TDatum>;
  entries: readonly VariantEntry<TDatum>[];
  /** All data rows (bubbles with `getCoordinates` do not go through the regions). */
  data: readonly TDatum[];
  getId: (datum: TDatum) => string;
  /** Projected centroid of each region, in the order of `entries` (only `bubble` uses it). */
  centroids: readonly (Point | null)[];
  /** [lon, lat] → [x, y] in pixels (only `bubble` uses it). */
  project: (coordinates: Point) => Point | null;
  emptyFill: string;
  formatValue: (value: number) => string;
  /** Text of the legend's "no data" item; without this, the legend does not include it. */
  emptyLabel?: string;
};

export const DEFAULT_BUBBLE_FILL = "#2563eb";

const isUsable = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Each variant's "preset": a PURE function that receives the data already joined with the
 * regions and returns how it is painted (colors, legend, bubbles). The hook only orchestrates; adding
 * a new variant means adding a branch here and a case in the type union.
 */
export const resolveVariant = <TDatum>(
  options: ResolveVariantOptions<TDatum>,
): VariantResult<TDatum> => {
  const { config, entries, emptyFill, formatValue, emptyLabel } = options;
  const numeric = (get: (datum: TDatum) => number | null) =>
    entries.map((e) => (e.datum === undefined ? null : get(e.datum)));
  const formatted = (values: readonly (number | string | null)[]) =>
    values.map((v) => (isUsable(v) ? formatValue(v) : ""));

  if (config.variant === "categorical") {
    const values = entries.map((e) => (e.datum === undefined ? null : config.getCategory(e.datum)));
    const scale = createCategoricalScale({
      values,
      categories: config.categories,
      palette: config.palette,
      emptyFill,
    });
    return {
      fills: values.map((v) => scale.getColor(v)),
      values,
      labels: values.map((v) => scale.getLabel(v)),
      scale: null,
      legend: buildCategoricalLegend({ scale, values, emptyLabel }),
      classes: values.map((v) => {
        const index = v == null ? -1 : scale.categories.findIndex((c) => c.id === v);
        return index < 0 ? null : index;
      }),
      bubbles: [],
      sizeLegend: [],
    };
  }

  if (config.variant === "bubble") return resolveBubbles(options, config);

  const values = numeric(config.getValue);
  const scale = createColorScale({
    values,
    classification: config.classification,
    emptyFill,
    ...(config.variant === "diverging"
      ? { variant: "diverging", palette: config.palette, midpoint: config.midpoint }
      : { variant: "sequential", palette: config.palette }),
  });
  return {
    fills: values.map((v) => scale.getColor(v)),
    values,
    labels: formatted(values),
    scale,
    legend: buildLegend({ scale, values, formatValue, emptyLabel }),
    classes: values.map((v) =>
      isUsable(v) && scale.kind !== "continuous" ? classIndex(scale.thresholds, v) : null,
    ),
    bubbles: [],
    sizeLegend: [],
  };
};

const resolveBubbles = <TDatum>(
  options: ResolveVariantOptions<TDatum>,
  config: Extract<VariantConfig<TDatum>, { variant: "bubble" }>,
): VariantResult<TDatum> => {
  const { entries, data, getId, centroids, project, emptyFill, formatValue, emptyLabel } = options;

  // Value of each region (for the tooltip and `labels`); regions are painted neutral: the color
  // belongs to the bubbles, and coloring the region too would compete with them.
  const values = entries.map((e) => (e.datum === undefined ? null : config.getValue(e.datum)));

  // Position: by the datum's own coordinates (stores) or by its region's centroid (countries).
  type Source = { id: string; datum: TDatum; at: Point; coordinates: Point | null };
  const sources: Source[] = [];
  if (config.getCoordinates !== undefined) {
    for (const datum of data) {
      const coordinates = config.getCoordinates(datum);
      const at = coordinates === null ? null : project(coordinates);
      if (coordinates !== null && at !== null) {
        sources.push({ id: getId(datum), datum, at, coordinates });
      }
    }
  } else {
    entries.forEach((entry, index) => {
      const at = centroids[index];
      if (entry.id !== undefined && entry.datum !== undefined && at != null) {
        sources.push({ id: entry.id, datum: entry.datum, at, coordinates: null });
      }
    });
  }

  const sized = sources
    .map((source) => ({ ...source, value: config.getValue(source.datum) }))
    .filter((s): s is typeof s & { value: number } => isUsable(s.value) && s.value > 0);

  const radius = createRadiusScale({
    values: sized.map((s) => s.value),
    maxRadius: config.maxRadius ?? DEFAULT_MAX_RADIUS,
  });

  const colorValues = sized.map((s) =>
    config.getColorValue ? config.getColorValue(s.datum) : null,
  );
  const colorScale =
    config.getColorValue === undefined
      ? null
      : createColorScale({
          variant: "diverging",
          values: colorValues,
          classification: config.classification,
          palette: config.palette,
          midpoint: config.midpoint,
          emptyFill,
        });

  const bubbles: Bubble<TDatum>[] = sized
    .map((s, i) => ({
      id: s.id,
      x: s.at[0],
      y: s.at[1],
      r: radius.getRadius(s.value),
      fill:
        colorScale === null
          ? (config.color ?? DEFAULT_BUBBLE_FILL)
          : colorScale.getColor(colorValues[i]),
      value: s.value,
      colorValue: colorValues[i] ?? null,
      datum: s.datum,
      coordinates: s.coordinates,
    }))
    // The big ones first: the small ones are drawn on top and are not covered.
    .sort((a, b) => b.r - a.r);

  return {
    fills: entries.map(() => emptyFill),
    values,
    labels: values.map((v) => (isUsable(v) ? formatValue(v) : "")),
    scale: colorScale,
    legend:
      colorScale === null
        ? []
        : buildLegend({ scale: colorScale, values: colorValues, formatValue, emptyLabel }),
    // The bubbles carry the color, not the regions: there is no per-region class here.
    classes: entries.map(() => null),
    bubbles,
    sizeLegend: buildSizeLegend({ scale: radius, formatValue }),
  };
};
