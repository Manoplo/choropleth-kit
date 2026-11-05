import { scaleSqrt } from "d3-scale";
import { defaultFormatValue } from "./legend";

export const DEFAULT_MAX_RADIUS = 24;

export type RadiusScale = {
  /** Valor → radio en píxeles. Área proporcional al valor. */
  getRadius: (value: number) => number;
  /** Valor máximo (radio = `maxRadius`). 0 si no hay valores positivos. */
  max: number;
  maxRadius: number;
};

export type SizeLegendItem = { value: number; radius: number; label: string };

const isPositive = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Escala de radio con RAÍZ CUADRADA (dd.md §3.2): el ojo compara áreas, no radios. Si una tienda
 * vende el doble, su círculo debe tener el doble de ÁREA (radio ×1,41), no el doble de radio, que
 * sería el cuádruple de área.
 *
 * El dominio empieza en 0 (no en el mínimo): un círculo de radio 0 representa 0. Con dominio
 * [min, max] el valor mínimo desaparecería y las razones entre áreas serían falsas.
 */
export const createRadiusScale = ({
  values,
  maxRadius = DEFAULT_MAX_RADIUS,
}: {
  values: readonly (number | null | undefined)[];
  maxRadius?: number;
}): RadiusScale => {
  let max = 0;
  for (const v of values) if (isPositive(v) && v > max) max = v;

  // Sin valores positivos no hay escala: se evita un dominio [0, 0], donde d3 devolvería NaN.
  const scale = scaleSqrt()
    .domain([0, max || 1])
    .range([0, maxRadius])
    .clamp(true);
  return { getRadius: (value) => (max === 0 ? 0 : scale(value)), max, maxRadius };
};

/** Tres círculos de referencia (¼, ½ y el máximo) para leer el tamaño. Vacío sin valores positivos. */
export const buildSizeLegend = ({
  scale,
  formatValue = defaultFormatValue,
}: {
  scale: RadiusScale;
  formatValue?: (value: number) => string;
}): SizeLegendItem[] => {
  if (scale.max === 0) return [];
  return [0.25, 0.5, 1].map((fraction) => {
    const value = scale.max * fraction;
    return { value, radius: scale.getRadius(value), label: formatValue(value) };
  });
};
