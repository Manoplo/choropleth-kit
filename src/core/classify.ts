import { scaleQuantile, scaleQuantize } from "d3-scale";

export type Classification =
  | { method: "linear" }
  | { method: "quantize"; classes?: number }
  | { method: "quantile"; classes?: number }
  | { method: "threshold"; thresholds: number[] };

export const DEFAULT_CLASSES = 5;

/**
 * Discards whatever is not a usable number: `null`, `undefined` and `NaN`/`Infinity`.
 * It goes before any statistical computation: a single `NaN` in the array contaminates a minimum, a
 * maximum or a whole quantile (they would all become `NaN`) and the map would come out in one color.
 * A `0` IS kept: it is a datum, not an absence ("no data" ≠ 0).
 */
export const finiteValues = (values: readonly (number | null | undefined)[]): number[] =>
  values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

const assertValidClasses = (classes: number): void => {
  if (!Number.isInteger(classes) || classes < 1) {
    throw new Error(
      `[choropleth] classify: "classes" must be an integer ≥ 1 (received: ${classes}).`,
    );
  }
};

/**
 * Computes the **breaks** between classes: N classes ⇒ N-1 ascending numbers. A value `v` falls in
 * class `i`, where `i` is the number of breaks `v` reaches or exceeds, so a value exactly on a break
 * belongs to the class ABOVE (the behavior of `d3.scaleThreshold`).
 *
 * It returns numbers, not colors, on purpose: separating "which classes exist" from "what color
 * each one is" lets the statistics be tested without looking at colors, and lets the legend (a later
 * step) use the same breaks as the map without recomputing them.
 *
 * `values` must already be filtered with `finiteValues`. `domain` is the range `quantize` is split
 * over; the caller decides it (in a diverging map it is symmetric around the midpoint, see scales.ts).
 */
export const computeThresholds = ({
  values,
  classification,
  domain,
}: {
  values: readonly number[];
  classification: Classification;
  domain: readonly [number, number];
}): number[] => {
  switch (classification.method) {
    case "linear":
      // Continuous scale: there are no classes, so there are no breaks.
      return [];

    case "threshold": {
      // Breaks given by the user (e.g. [0, 5, 10] ⇒ <0, 0–5, 5–10, ≥10). d3 requires ascending order
      // and, if it is not met, it does not fail: it assigns wrong colors. It is better to fail here with
      // a message than to let the map lie silently.
      const { thresholds } = classification;
      const ascending = thresholds.every(
        (t, i) => Number.isFinite(t) && (i === 0 || t > (thresholds[i - 1] ?? t)),
      );
      if (!ascending) {
        throw new Error(
          `[choropleth] classify: "thresholds" must be a list of finite numbers in strictly ascending order (received: [${thresholds.join(", ")}]).`,
        );
      }
      return [...thresholds];
    }

    case "quantize": {
      // Splits the RANGE [min, max] into equal bands. If there is a very high extreme value, almost
      // every country falls in the first classes: it is faithful to the scale but misleading with very
      // skewed data (that is what quantile is for).
      const classes = classification.classes ?? DEFAULT_CLASSES;
      assertValidClasses(classes);
      return scaleQuantize<number>()
        .domain([...domain])
        .range(Array.from({ length: classes }, (_, i) => i))
        .thresholds();
    }

    case "quantile": {
      // Splits the DATA into groups with (almost) the same number of regions each. The whole color range
      // is always used, but a color jump can represent a small or a huge difference depending on where
      // the data fall. With many repeated values (e.g. many zeros) several breaks coincide and empty
      // classes appear: it is a known limitation.
      const classes = classification.classes ?? DEFAULT_CLASSES;
      assertValidClasses(classes);
      if (values.length === 0) return [];
      return scaleQuantile<number>()
        .domain([...values])
        .range(Array.from({ length: classes }, (_, i) => i))
        .quantiles();
    }
  }
};
