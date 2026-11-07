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
    | { variant: "sequential"; palette?: SequentialPaletteName }
    | { variant: "diverging"; palette?: DivergingPaletteName; midpoint?: number }
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
  if (options.variant === "diverging") {
    // `|| 1`: if all values equal the midpoint, d = 0 and the domain would degenerate into a point,
    // where d3 does not know which color to give. With d = 1 that value falls exactly on the neutral center.
    const spread = Math.max(Math.abs(min - midpoint), Math.abs(max - midpoint)) || 1;
    domain = [midpoint - spread, midpoint + spread];
  }

  // ── STEP 3: breaks. Needs the domain (quantize) and the values (quantile). ───────────────────
  // By default: sequential → quantile (every class is used); diverging → quantize over the
  // symmetric domain, which with an odd number of classes leaves the midpoint at the center of the
  // neutral class. (dd.md asks for "symmetric threshold"; this is the same thing, computed automatically.)
  const classification: Classification =
    options.classification ??
    (options.variant === "diverging"
      ? { method: "quantize", classes: DEFAULT_CLASSES }
      : { method: "quantile", classes: DEFAULT_CLASSES });
  const thresholds = computeThresholds({ values, classification, domain });

  // ── STEP 4: build the scale depending on whether there are classes. ──────────────────────────
  const interpolate =
    options.variant === "diverging"
      ? DIVERGING_PALETTES[options.palette ?? DEFAULT_DIVERGING_PALETTE]
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
