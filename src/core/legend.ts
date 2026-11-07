import type { ColorScale } from "./scales";

export type LegendItem = {
  color: string;
  label: string;
  /** Límite inferior de la clase (incluido). Ausente en el item de "sin dato". */
  from?: number;
  /** Límite superior de la clase (excluido, salvo en la última clase). */
  to?: number;
  /** Nº de regiones en esa clase. */
  count: number;
  /** Es el item de «sin dato» (no es una clase: no tiene índice de clase). */
  empty?: true;
};

export type BuildLegendOptions = {
  scale: ColorScale;
  /** Un valor por región. Los mismos que se usaron para crear la escala. `null`/`NaN` = sin dato. */
  values: readonly (number | null | undefined)[];
  formatValue?: (value: number) => string;
  /** Si se pasa, se añade al final un item de "sin dato" con este texto y el `emptyFill` de la escala. */
  emptyLabel?: string;
};

export const defaultFormatValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

// Índice de clase = nº de cortes <= valor. Un valor justo en un corte cae en la clase de ARRIBA,
// igual que d3.scaleThreshold; si difiriera, la leyenda contaría regiones en una clase y el mapa
// las pintaría de otro color.
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
 * Convierte la escala en items de leyenda reutilizando SUS cortes y colores (no recalcula nada),
 * y cuenta cuántas regiones caen en cada clase.
 *
 * Escala continua (`linear`): no hay clases, devuelve [] (se dibuja como degradado con `scale.domain`).
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
