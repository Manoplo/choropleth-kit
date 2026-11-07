import type { LegendItem } from "./legend";
import {
  CATEGORICAL_PALETTES,
  DEFAULT_CATEGORICAL_PALETTE,
  type CategoricalPaletteName,
} from "./palettes";

export type CategorySpec = {
  id: string;
  label?: string;
  /** Fixed color. If missing, it is taken from the palette according to the category's position. */
  color?: string;
};

export type ResolvedCategory = { id: string; label: string; color: string };

export type CategoricalScale = {
  /** Category → color. `null`/`undefined` and unknown categories → `emptyFill`. */
  getColor: (category: string | null | undefined) => string;
  getLabel: (category: string | null | undefined) => string;
  categories: readonly ResolvedCategory[];
  emptyFill: string;
};

export type CreateCategoricalScaleOptions = {
  values: readonly (string | null | undefined)[];
  /** Fixed order and colors. Without this, categories come from the data, sorted alphabetically. */
  categories?: readonly CategorySpec[];
  palette?: CategoricalPaletteName;
  emptyFill: string;
};

/**
 * Assigns a color to each category.
 *
 * Without `categories`, the order is ALPHABETICAL and not order of appearance: if it depended on
 * the data order, a reload with the rows in another order would change each category's color. For
 * stable colors across screens (e.g. "Europe" always blue) pass `categories`.
 *
 * With more categories than colors in the palette, colors repeat (d3 does the same): two categories
 * with the same color are indistinguishable, so better pass `categories` with `color`.
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
    // `as string`: the modulo never gives undefined because `colors` has length ≥ 1.
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

/** One item per category (in the scale's order) with its number of regions; optional "no data". */
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
    items.push({ color: scale.emptyFill, label: emptyLabel, count: empty, empty: true });
  return items;
};
