import type { LegendItem } from "./legend";
import {
  CATEGORICAL_PALETTES,
  DEFAULT_CATEGORICAL_PALETTE,
  type CategoricalPaletteName,
} from "./palettes";

export type CategorySpec = {
  id: string;
  label?: string;
  /** Color fijo. Si falta, se toma de la paleta según la posición de la categoría. */
  color?: string;
};

export type ResolvedCategory = { id: string; label: string; color: string };

export type CategoricalScale = {
  /** Categoría → color. `null`/`undefined` y categorías desconocidas → `emptyFill`. */
  getColor: (category: string | null | undefined) => string;
  getLabel: (category: string | null | undefined) => string;
  categories: readonly ResolvedCategory[];
  emptyFill: string;
};

export type CreateCategoricalScaleOptions = {
  values: readonly (string | null | undefined)[];
  /** Orden y colores fijos. Sin esto, las categorías salen de los datos, ordenadas alfabéticamente. */
  categories?: readonly CategorySpec[];
  palette?: CategoricalPaletteName;
  emptyFill: string;
};

/**
 * Asigna un color a cada categoría.
 *
 * Sin `categories`, el orden es ALFABÉTICO y no el de aparición: si dependiera del orden de los
 * datos, una recarga con las filas en otro orden cambiaría el color de cada categoría. Para
 * colores estables entre pantallas (p. ej. «Europa» siempre azul) hay que pasar `categories`.
 *
 * Con más categorías que colores en la paleta, los colores se repiten (d3 hace lo mismo): dos
 * categorías con el mismo color son indistinguibles, mejor pasar `categories` con `color`.
 */
export const createCategoricalScale = ({
  values,
  categories,
  palette = DEFAULT_CATEGORICAL_PALETTE,
  emptyFill,
}: CreateCategoricalScaleOptions): CategoricalScale => {
  const colors = CATEGORICAL_PALETTES[palette];
  const specs: readonly CategorySpec[] =
    categories ??
    [...new Set(values.filter((v): v is string => typeof v === "string"))]
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({ id }));

  const resolved: ResolvedCategory[] = specs.map((spec, index) => ({
    id: spec.id,
    label: spec.label ?? spec.id,
    // `as string`: el módulo nunca da undefined porque `colors` tiene longitud ≥ 1.
    color: spec.color ?? (colors[index % colors.length] as string),
  }));
  const byId = new Map(resolved.map((c) => [c.id, c]));

  return {
    getColor: (category) =>
      category == null ? emptyFill : (byId.get(category)?.color ?? emptyFill),
    getLabel: (category) => (category == null ? "" : (byId.get(category)?.label ?? category)),
    categories: resolved,
    emptyFill,
  };
};

/** Un item por categoría (en el orden de la escala) con su nº de regiones; «sin dato» opcional. */
export const buildCategoricalLegend = ({
  scale,
  values,
  emptyLabel,
}: {
  scale: CategoricalScale;
  values: readonly (string | null | undefined)[];
  emptyLabel?: string;
}): LegendItem[] => {
  const counts = new Map<string, number>();
  let empty = 0;
  for (const v of values) {
    if (v == null || !scale.categories.some((c) => c.id === v)) empty += 1;
    else counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const items: LegendItem[] = scale.categories.map((c) => ({
    color: c.color,
    label: c.label,
    count: counts.get(c.id) ?? 0,
  }));
  if (emptyLabel !== undefined)
    items.push({ color: scale.emptyFill, label: emptyLabel, count: empty });
  return items;
};
