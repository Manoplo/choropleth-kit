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

// Color de las regiones sin dato. Tiene que ser distinguible de TODA la rampa, incluido el 0.
export const DEFAULT_EMPTY_FILL = "#d4d4d4";

type CommonOptions = {
  /** Un valor por región (o por dato). `null`/`undefined`/`NaN` se tratan como "sin dato". */
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
  /** Valor → color CSS. `null`/`undefined`/`NaN` → `emptyFill`. El `0` es un dato y se colorea. */
  getColor: (value: number | null | undefined) => string;
  /** "classed": colores por tramos. "continuous": degradado sin clases (`linear`). */
  kind: "classed" | "continuous";
  /** Rango de datos que cubre la escala. En divergente es simétrico respecto al punto medio. */
  domain: readonly [number, number];
  /** Cortes entre clases (N-1). Vacío en continuous. La leyenda usará estos mismos. */
  thresholds: readonly number[];
  /** Un color por clase (N). Vacío en continuous. */
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
  // Sin datos no hay rango; [0, 1] evita pasar Infinity a d3 y devolver NaN en todo.
  return values.length === 0 ? [0, 1] : [min, max];
};

/**
 * Crea la función que decide el color de cada región.
 *
 * El orden de los pasos importa porque cada uno alimenta al siguiente:
 * dato limpio → dominio → cortes → colores → escala.
 */
export const createColorScale = (options: ColorScaleOptions): ColorScale => {
  const emptyFill = options.emptyFill ?? DEFAULT_EMPTY_FILL;

  // ── PASO 1: limpiar. Antes de cualquier estadística (ver finiteValues). ───────────────────────
  const values = finiteValues(options.values);

  // ── PASO 2: dominio. Necesita los valores limpios y decide los cortes del paso 3. ─────────────
  // Divergente: el dominio se hace SIMÉTRICO respecto al punto medio (de mid-d a mid+d, con d la
  // mayor distancia al medio). Sin esto, con datos de -20 a +5 el azul y el rojo no pesarían
  // igual y un +5 parecería tan intenso como un -20. Es la razón de ser del mapa divergente.
  const midpoint = options.variant === "diverging" ? (options.midpoint ?? 0) : 0;
  const [min, max] = extent(values);
  let domain: [number, number] = [min, max];
  if (options.variant === "diverging") {
    // `|| 1`: si todos los valores son iguales al medio, d = 0 y el dominio degeneraría en un
    // punto, donde d3 no sabe qué color dar. Con d = 1 ese valor cae justo en el centro neutro.
    const spread = Math.max(Math.abs(min - midpoint), Math.abs(max - midpoint)) || 1;
    domain = [midpoint - spread, midpoint + spread];
  }

  // ── PASO 3: cortes. Necesita el dominio (quantize) y los valores (quantile). ──────────────────
  // Por defecto: secuencial → quantile (todas las clases se usan); divergente → quantize sobre
  // el dominio simétrico, que con número impar de clases deja el punto medio en el centro de la
  // clase neutra. (dd.md pide "threshold simétrico"; esto es lo mismo, calculado automáticamente.)
  const classification: Classification =
    options.classification ??
    (options.variant === "diverging"
      ? { method: "quantize", classes: DEFAULT_CLASSES }
      : { method: "quantile", classes: DEFAULT_CLASSES });
  const thresholds = computeThresholds({ values, classification, domain });

  // ── PASO 4: construir la escala según haya o no clases. ───────────────────────────────────────
  const interpolate =
    options.variant === "diverging"
      ? DIVERGING_PALETTES[options.palette ?? DEFAULT_DIVERGING_PALETTE]
      : SEQUENTIAL_PALETTES[options.palette ?? DEFAULT_SEQUENTIAL_PALETTE];

  const isUsable = (v: number | null | undefined): v is number =>
    typeof v === "number" && Number.isFinite(v);

  if (classification.method === "linear") {
    // Degradado continuo. `clamp(true)` evita que un valor fuera del dominio (por ejemplo un
    // dato nuevo con una escala ya creada) extrapole a colores fuera de la paleta.
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

  // Colores discretos: SIEMPRE uno más que cortes (N clases = N-1 cortes + 1).
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
