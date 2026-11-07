/**
 * Slots de `classNames` (dd.md §12.5.4): una clase tuya (Tailwind, CSS Modules) en cada pieza del mapa,
 * SUMADA a la `cm-*` de la librería (nunca la sustituye, así los selectores `.cm-region[data-drillable]` y los
 * estilos base siguen funcionando; para quitar los base está `unstyled`).
 *
 * Solo están las piezas que existen hoy. `sphere`, `graticule` y `labels` de `dd.md §12.5.4` llegan con sus capas.
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

/** Une clases ignorando lo que no sea una cadena con contenido. */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
