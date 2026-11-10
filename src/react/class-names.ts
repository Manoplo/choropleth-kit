/**
 * `classNames` slots: a class of yours (Tailwind, CSS Modules) on each piece of the map,
 * ADDED to the library's `cm-*` one (it never replaces it, so selectors like `.cm-region[data-drillable]`
 * and the base styles keep working; to remove the base ones there is `unstyled`).
 *
 * Only the pieces that exist today are here. `sphere`, `graticule` and `labels` are planned and arrive with their layers.
 */
export const CLASS_SLOTS = [
  "root",
  "svg",
  "layer",
  "regions",
  "region",
  "borders",
  "bubbles",
  "bubble",
  "selection",
  "legend",
  "legendItem",
  "tooltip",
  "controls",
  "controlButton",
  "breadcrumb",
  "breadcrumbItem",
  "gestureHint",
] as const;

export type ClassSlot = (typeof CLASS_SLOTS)[number];

export type ChoroplethClassNames = Partial<Record<ClassSlot, string>>;

/** Joins classes, ignoring anything that is not a non-empty string. */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
