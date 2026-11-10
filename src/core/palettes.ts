import {
  interpolateBlues,
  interpolateBrBG,
  interpolateGreens,
  interpolateGreys,
  interpolateOranges,
  interpolatePiYG,
  interpolatePRGn,
  interpolatePuOr,
  interpolatePurples,
  interpolateRdBu,
  interpolateRdYlBu,
  interpolateRdYlGn,
  interpolateReds,
  interpolateSpectral,
  interpolateViridis,
  schemeAccent,
  schemeDark2,
  schemePaired,
  schemePastel1,
  schemeSet2,
  schemeSet3,
  schemeTableau10,
} from "d3-scale-chromatic";

// An interpolator is a function t ∈ [0, 1] → CSS color ("rgb(8, 81, 156)").
export type Interpolator = (t: number) => string;

// Two different name types on purpose: using a diverging palette on a sequential map (or the other
// way round) is a cartographic error, and this way TypeScript catches it at compile time instead of
// the end user's eye. It is the same principle as the `variant` discriminated union used for `variant`.
export const SEQUENTIAL_PALETTES = {
  blues: interpolateBlues,
  greens: interpolateGreens,
  greys: interpolateGreys,
  oranges: interpolateOranges,
  purples: interpolatePurples,
  reds: interpolateReds,
  viridis: interpolateViridis,
} as const satisfies Record<string, Interpolator>;

export const DIVERGING_PALETTES = {
  rdbu: interpolateRdBu,
  brbg: interpolateBrBG,
  piyg: interpolatePiYG,
  prgn: interpolatePRGn,
  puor: interpolatePuOr,
  rdylbu: interpolateRdYlBu,
  rdylgn: interpolateRdYlGn,
  spectral: interpolateSpectral,
} as const satisfies Record<string, Interpolator>;

export type SequentialPaletteName = keyof typeof SEQUENTIAL_PALETTES;
export type DivergingPaletteName = keyof typeof DIVERGING_PALETTES;

export const DEFAULT_SEQUENTIAL_PALETTE: SequentialPaletteName = "blues";
export const DEFAULT_DIVERGING_PALETTE: DivergingPaletteName = "rdbu";

// ColorBrewer's sequential palettes start almost white (blues(0) ≈ #f7fbff). With the page
// background also white, the lowest-class region would look like "no data".
// We start at 0.15 so the lowest class is still visibly a color.
const SEQUENTIAL_START = 0.15;

/**
 * One color per class, taken from the palette. Used for the methods with discrete classes
 * (quantize, quantile, threshold).
 */
export const sampleSequentialColors = ({
  interpolate,
  classes,
}: {
  interpolate: Interpolator;
  classes: number;
}): string[] =>
  Array.from({ length: classes }, (_, i) =>
    // With a single class there is no "from less to more": a mid tone is used, not the light extreme.
    interpolate(
      classes === 1 ? 0.6 : SEQUENTIAL_START + ((1 - SEQUENTIAL_START) * i) / (classes - 1),
    ),
  );

export const sampleDivergingColors = ({
  interpolate,
  classes,
}: {
  interpolate: Interpolator;
  classes: number;
}): string[] =>
  // Center of each band: with 5 classes t = 0.1, 0.3, 0.5, 0.7, 0.9. With an odd number the middle
  // class falls exactly at t = 0.5, the palette's neutral color, which is the one that must
  // represent the midpoint. That is why the diverging one does not use SEQUENTIAL_START: its light
  // end is in the center, and that is intentional.
  Array.from({ length: classes }, (_, i) => interpolate((i + 0.5) / classes));

/** Categorical palettes: loose colors with no order (unlike the ramps above). */
export const CATEGORICAL_PALETTES = {
  tableau10: schemeTableau10,
  set2: schemeSet2,
  set3: schemeSet3,
  accent: schemeAccent,
  dark2: schemeDark2,
  paired: schemePaired,
  pastel1: schemePastel1,
} as const satisfies Record<string, readonly string[]>;

export type CategoricalPaletteName = keyof typeof CATEGORICAL_PALETTES;

export const DEFAULT_CATEGORICAL_PALETTE: CategoricalPaletteName = "tableau10";
