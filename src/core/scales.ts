import { scaleDiverging, scaleSequential, scaleThreshold } from "d3-scale";
import { computeThresholds, DEFAULT_CLASSES, finiteValues, type Classification } from "./classify";
import {
  DEFAULT_DIVERGING_PALETTE,
  DEFAULT_SEQUENTIAL_PALETTE,
  DIVERGING_PALETTES,
  SEQUENTIAL_PALETTES,
  sampleDivergingColors,
  sampleSequentialColors,
  type DivergingPaletteName,
  type SequentialPaletteName,
} from "./palettes";
import {
  createRampInterpolator,
  isCustomRamp,
  sampleRampColors,
  type CustomRamp,
  type DivergingRamp,
} from "./ramps";

// Color of regions without data. It must be distinguishable from the WHOLE ramp, including 0.
export const DEFAULT_EMPTY_FILL = "#d4d4d4";

type CommonOptions = {
  /** One value per region (or per datum). `null`/`undefined`/`NaN` are treated as "no data". */
  values: readonly (number | null | undefined)[];
  classification?: Classification;
  emptyFill?: string;
};

export type ColorScaleOptions = CommonOptions &
  (
    | {
        variant: "sequential";
        /** A named ramp, or your own colors: `{ from, to }` or `["#fff", "#888", "#2563eb"]`. */
        palette?: SequentialPaletteName | CustomRamp;
        /**
         * Fixed `[min, max]` instead of the data's. Values outside it take the end colors (they are clamped, not
         * extrapolated). It sets the range of `linear` and `quantize` and the ends of the legend; `quantile`
         * and `threshold` take their breaks from the data and from `thresholds`, as always.
         */
        domain?: readonly [number, number];
      }
    | {
        variant: "diverging";
        /** A named ramp, or your own colors: `{ negative, neutral, positive }`. */
        palette?: DivergingPaletteName | DivergingRamp;
        midpoint?: number;
        /**
         * Fixed `[min, max]` instead of the symmetric range of the data. Used as given, even if it is not
         * symmetric around the midpoint (`[-10, 40]` with `midpoint: 0`): each side gets its own scale.
         */
        domain?: readonly [number, number];
      }
  );

export type ColorScale = {
  /** Value → CSS color. `null`/`undefined`/`NaN` → `emptyFill`. `0` is a datum and gets colored. */
  getColor: (value: number | null | undefined) => string;
  /** "classed": colors by bands. "continuous": a gradient with no classes (`linear`). */
  kind: "classed" | "continuous";
  /** Data range covered by the scale. In diverging it is symmetric around the midpoint. */
  domain: readonly [number, number];
  /** Breaks between classes (N-1). Empty in continuous. The legend will use these same ones. */
  thresholds: readonly number[];
  /** One color per class (N). Empty in continuous. */
  colors: readonly string[];
  emptyFill: string;
};

const extent = (values: readonly number[]): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // With no data there is no range; [0, 1] avoids passing Infinity to d3 and getting NaN everywhere.
  return values.length === 0 ? [0, 1] : [min, max];
};

/**
 * Creates the function that decides each region's color.
 *
 * The order of the steps matters because each one feeds the next:
 * clean data → domain → breaks → colors → scale.
 */
export const createColorScale = (options: ColorScaleOptions): ColorScale => {
  const emptyFill = options.emptyFill ?? DEFAULT_EMPTY_FILL;

  // ── STEP 1: clean. Before any statistics (see finiteValues). ─────────────────────────────────
  const values = finiteValues(options.values);

  // ── STEP 2: domain. Needs the clean values and decides the breaks of step 3. ─────────────────
  // Diverging: the domain is made SYMMETRIC around the midpoint (from mid-d to mid+d, with d the
  // greatest distance to the middle). Without this, with data from -20 to +5, blue and red would not
  // weigh the same and a +5 would look as intense as a -20. That is the whole point of a diverging map.
  const midpoint = options.variant === "diverging" ? (options.midpoint ?? 0) : 0;
  const [min, max] = extent(values);
  let domain: [number, number] = [min, max];
  if (options.domain !== undefined) {
    // A fixed domain is the consumer's statement of what the range MEANS (0 % … 100 %): it wins over the data.
    const [low, high] = options.domain;
    if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) {
      throw new Error(
        `[choropleth] domain: expected finite [min, max] with min < max (received: [${String(low)}, ${String(high)}]).`,
      );
    }
    domain = [low, high];
    if (midpoint < low || midpoint > high) {
      throw new Error(`[choropleth] midpoint: ${midpoint} is outside domain [${low}, ${high}].`);
    }
  }
  if (options.variant === "diverging" && options.domain === undefined) {
    // `|| 1`: if all values equal the midpoint, d = 0 and the domain would degenerate into a point,
    // where d3 does not know which color to give. With d = 1 that value falls exactly on the neutral center.
    const spread = Math.max(Math.abs(min - midpoint), Math.abs(max - midpoint)) || 1;
    domain = [midpoint - spread, midpoint + spread];
  }

  // ── STEP 3: breaks. Needs the domain (quantize) and the values (quantile). ───────────────────
  // By default: sequential → quantile (every class is used); diverging → quantize over the
  // symmetric domain, which with an odd number of classes leaves the midpoint at the center of the
  // neutral class. (This is a "symmetric threshold", computed automatically.)
  const classification: Classification =
    options.classification ??
    (options.variant === "diverging"
      ? { method: "quantize", classes: DEFAULT_CLASSES }
      : { method: "quantile", classes: DEFAULT_CLASSES });
  const thresholds = computeThresholds({ values, classification, domain });

  // ── STEP 4: build the scale depending on whether there are classes. ──────────────────────────
  const custom = options.variant === "sequential" && isCustomRamp(options.palette);
  const interpolate =
    options.variant === "diverging"
      ? isCustomRamp(options.palette)
        ? createRampInterpolator(options.palette)
        : DIVERGING_PALETTES[options.palette ?? DEFAULT_DIVERGING_PALETTE]
      : isCustomRamp(options.palette)
        ? createRampInterpolator(options.palette)
        : SEQUENTIAL_PALETTES[options.palette ?? DEFAULT_SEQUENTIAL_PALETTE];

  const isUsable = (v: number | null | undefined): v is number =>
    typeof v === "number" && Number.isFinite(v);

  if (classification.method === "linear") {
    // Continuous gradient. `clamp(true)` prevents a value outside the domain (for example a new
    // datum with an already-created scale) from extrapolating to colors outside the palette.
    const continuous =
      options.variant === "diverging"
        ? scaleDiverging(interpolate).domain([domain[0], midpoint, domain[1]]).clamp(true)
        : scaleSequential(interpolate).domain(domain).clamp(true);
    return {
      getColor: (value) => (isUsable(value) ? continuous(value) : emptyFill),
      kind: "continuous",
      domain,
      thresholds: [],
      colors: [],
      emptyFill,
    };
  }

  // Discrete colors: ALWAYS one more than breaks (N classes = N-1 breaks + 1).
  const classes = thresholds.length + 1;
  const colors =
    options.variant === "diverging"
      ? sampleDivergingColors({ interpolate, classes })
      : custom
        ? sampleRampColors({ interpolate, classes })
        : sampleSequentialColors({ interpolate, classes });
  const classed = scaleThreshold<number, string>().domain(thresholds).range(colors);

  return {
    getColor: (value) => (isUsable(value) ? classed(value) : emptyFill),
    kind: "classed",
    domain,
    thresholds,
    colors,
    emptyFill,
  };
};
