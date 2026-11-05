import {
  buildSizeLegend,
  createRadiusScale,
  DEFAULT_MAX_RADIUS,
  type SizeLegendItem,
} from "./bubbles";
import { buildCategoricalLegend, createCategoricalScale, type CategorySpec } from "./categories";
import type { Classification } from "./classify";
import { buildLegend, type LegendItem } from "./legend";
import type {
  CategoricalPaletteName,
  DivergingPaletteName,
  SequentialPaletteName,
} from "./palettes";
import { createColorScale, type ColorScale } from "./scales";

/** Punto [x, y] en píxeles o [lon, lat] en grados, según el contexto. */
export type Point = readonly [number, number];

/**
 * Configuración por `variant` (dd.md §9.2 y §10). Unión discriminada: cada variante exige lo suyo
 * (`categorical` pide `getCategory`, `bubble` acepta `getCoordinates`…) y TypeScript rechaza
 * combinaciones inválidas, como una paleta divergente en un mapa secuencial.
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
      /** Orden y colores fijos. */
      categories?: readonly CategorySpec[];
      palette?: CategoricalPaletteName;
    }
  | {
      variant: "bubble";
      /** Valor ABSOLUTO que da el ÁREA del círculo. Los `null` y los ≤ 0 no dibujan círculo. */
      getValue: (datum: TDatum) => number | null;
      /** Segunda métrica → color de la burbuja (bivariante, escala divergente). */
      getColorValue?: (datum: TDatum) => number | null;
      /** [lon, lat] del dato. Sin esto, la burbuja va en el centroide de su región. */
      getCoordinates?: (datum: TDatum) => readonly [number, number] | null;
      maxRadius?: number;
      /** Color único cuando no hay `getColorValue`. */
      color?: string;
      classification?: Classification;
      palette?: DivergingPaletteName;
      midpoint?: number;
    };

export type VariantName = VariantConfig<unknown>["variant"];

export type VariantEntry<TDatum> = {
  /** Id de la región, o `undefined` si no tiene. */
  id: string | undefined;
  /** Dato cruzado con la región, o `undefined` si no hay. */
  datum: TDatum | undefined;
};

export type Bubble<TDatum> = {
  id: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  /** Valor que da el área. */
  value: number;
  colorValue: number | null;
  datum: TDatum;
};

export type VariantResult<TDatum> = {
  /** Color de cada región, en el orden de `entries`. */
  fills: string[];
  /** Valor de cada región: número, categoría (`categorical`) o `null`. */
  values: (number | string | null)[];
  /** `values` ya formateado para mostrar («1,5 %», «Europa»); cadena vacía si no hay valor. */
  labels: string[];
  /** Escala de color numérica. `null` en `categorical` y en `bubble` sin `getColorValue`. */
  scale: ColorScale | null;
  legend: LegendItem[];
  bubbles: Bubble<TDatum>[];
  sizeLegend: SizeLegendItem[];
};

export type ResolveVariantOptions<TDatum> = {
  config: VariantConfig<TDatum>;
  entries: readonly VariantEntry<TDatum>[];
  /** Todas las filas de datos (las burbujas con `getCoordinates` no pasan por las regiones). */
  data: readonly TDatum[];
  getId: (datum: TDatum) => string;
  /** Centroide proyectado de cada región, en el orden de `entries` (solo lo usa `bubble`). */
  centroids: readonly (Point | null)[];
  /** [lon, lat] → [x, y] en píxeles (solo lo usa `bubble`). */
  project: (coordinates: Point) => Point | null;
  emptyFill: string;
  formatValue: (value: number) => string;
  /** Texto del item «sin dato» de la leyenda; sin esto, la leyenda no lo incluye. */
  emptyLabel?: string;
};

export const DEFAULT_BUBBLE_FILL = "#2563eb";

const isUsable = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * El «preset» de cada variant (dd.md §10): una función PURA que recibe los datos ya cruzados con las
 * regiones y devuelve cómo se pinta (colores, leyenda, burbujas). El hook solo orquesta; añadir un
 * variant nuevo es añadir una rama aquí y un caso en la unión de tipos.
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
    bubbles: [],
    sizeLegend: [],
  };
};

const resolveBubbles = <TDatum>(
  options: ResolveVariantOptions<TDatum>,
  config: Extract<VariantConfig<TDatum>, { variant: "bubble" }>,
): VariantResult<TDatum> => {
  const { entries, data, getId, centroids, project, emptyFill, formatValue, emptyLabel } = options;

  // Valor de cada región (para tooltip y `labels`); las regiones se pintan neutras: el color
  // es de las burbujas, y colorear también la región competiría con ellas.
  const values = entries.map((e) => (e.datum === undefined ? null : config.getValue(e.datum)));

  // Posición: por coordenadas propias del dato (tiendas) o por el centroide de su región (países).
  type Source = { id: string; datum: TDatum; at: Point };
  const sources: Source[] = [];
  if (config.getCoordinates !== undefined) {
    for (const datum of data) {
      const coordinates = config.getCoordinates(datum);
      const at = coordinates === null ? null : project(coordinates);
      if (at !== null) sources.push({ id: getId(datum), datum, at });
    }
  } else {
    entries.forEach((entry, index) => {
      const at = centroids[index];
      if (entry.id !== undefined && entry.datum !== undefined && at != null) {
        sources.push({ id: entry.id, datum: entry.datum, at });
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
    }))
    // Las grandes primero: las pequeñas se dibujan encima y no quedan tapadas.
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
    bubbles,
    sizeLegend: buildSizeLegend({ scale: radius, formatValue }),
  };
};
