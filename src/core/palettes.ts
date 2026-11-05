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

// Un interpolador es una función t ∈ [0, 1] → color CSS ("rgb(8, 81, 156)").
export type Interpolator = (t: number) => string;

// Dos tipos de nombre distintos a propósito: usar una paleta divergente en un mapa secuencial
// (o al revés) es un error cartográfico, y así lo detecta TypeScript al compilar y no el ojo del
// usuario final. Es el mismo principio que la unión discriminada por `variant` de dd.md §9.2.
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

// Las paletas secuenciales de ColorBrewer empiezan casi en blanco (blues(0) ≈ #f7fbff). Con el
// fondo de la página también blanco, la región de la clase más baja parecería "sin dato".
// Se empieza en 0.15 para que la clase más baja siga siendo visiblemente un color.
const SEQUENTIAL_START = 0.15;

/**
 * Un color por clase, tomado de la paleta. Sirve para los métodos con clases discretas
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
    // Con una sola clase no hay "de menos a más": se usa un tono medio, no el extremo claro.
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
  // Centro de cada tramo: con 5 clases t = 0.1, 0.3, 0.5, 0.7, 0.9. Con número impar la clase
  // central cae exactamente en t = 0.5, el color neutro de la paleta, que es el que debe
  // representar al punto medio. Por eso el divergente no usa SEQUENTIAL_START: su claro está en
  // el centro y es intencionado.
  Array.from({ length: classes }, (_, i) => interpolate((i + 0.5) / classes));

/** Paletas categóricas: colores sueltos sin orden (a diferencia de las rampas de arriba). */
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
