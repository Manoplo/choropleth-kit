/**
 * Tema (dd.md §12.5.3): un objeto tipado que se traduce a variables CSS `--cm-*`. **Las variables siguen
 * siendo la única fuente de verdad**: el objeto es azúcar para que haya autocompletado y temas reutilizables.
 *
 * Es puro (sin React ni DOM) y vive en `core` aunque `dd.md` lo ponga en `react/theme.ts`: así se prueba
 * sin renderizar y un consumidor sin React puede usar `themeToCssVars`.
 *
 * Solo hay campos de lo que EXISTE hoy. `sphere`, `graticule`, `hover.effect`, `selected.glow`, `motion` y
 * `empty.pattern` de `dd.md §12.5.3` llegan con las capas y los efectos que los consumen (añadir un campo no
 * rompe a nadie; tener uno que no hace nada sí engaña).
 */

export type ChoroplethTheme = {
  /** Fondo del mapa (el `.cm-root`). Por defecto, transparente. */
  background?: string;
  /** Regiones sin dato. */
  empty?: { fill?: string };
  /** Los niveles de arriba en un drill: gris, sin color de dato. */
  context?: { fill?: string; border?: string };
  /** Fronteras entre regiones. */
  border?: { color?: string; width?: number };
  hover?: { stroke?: string; width?: number };
  selected?: { stroke?: string; width?: number };
  /** Anillo de foco del teclado: color y grosor (px). */
  focus?: { ring?: string; width?: number };
  /** Opacidad del resto del mapa con `dimOthers`. */
  dim?: { opacity?: number };
  bubble?: { fill?: string; stroke?: string; opacity?: number };
  font?: { family?: string; size?: number; color?: string };
  tooltip?: {
    background?: string;
    color?: string;
    border?: string;
    /** px */
    radius?: number;
    /** Un valor de `box-shadow`. */
    shadow?: string;
  };
  /** Botones de zoom y migas del drill. */
  controls?: { background?: string; color?: string; border?: string; radius?: number };
};

export type ThemeName = "light" | "dark" | "minimal" | "contrast";

/** Identidad: existe para inferir el tipo con autocompletado y para reutilizar un tema entre mapas. */
export const defineTheme = (theme: ChoroplethTheme): ChoroplethTheme => theme;

/**
 * La luz es el aspecto por defecto, escrito en explícito: `theme="light"` garantiza ese aspecto aunque la
 * página ponga sus propias variables más arriba.
 */
const light: ChoroplethTheme = {
  background: "transparent",
  empty: { fill: "#d4d4d4" },
  context: { fill: "#e5e5e5", border: "#ffffff" },
  border: { color: "#ffffff", width: 0.5 },
  hover: { stroke: "#000000", width: 1.5 },
  selected: { stroke: "#0b5fff", width: 2 },
  focus: { ring: "#0b5fff", width: 2 },
  dim: { opacity: 0.45 },
  bubble: { fill: "#2563eb", stroke: "#ffffff", opacity: 0.75 },
  font: { color: "#111111" },
  tooltip: {
    background: "#ffffff",
    color: "#111111",
    border: "#cccccc",
    radius: 4,
    shadow: "none",
  },
  controls: { background: "#ffffff", color: "#111111", border: "#cccccc", radius: 6 },
};

/**
 * Oscuro: fondo oscuro, «sin dato» gris medio, fronteras oscuras y tooltip invertido. Ojo con la paleta: las rampas
 * claras en un extremo («blues») se confunden con el fondo; `viridis` se lee bien. (La inversión de rampas,
 * `{ name, reverse: true }` de `dd.md §12.5.3`, no existe todavía.)
 */
const dark: ChoroplethTheme = {
  background: "#0f172a",
  empty: { fill: "#475569" },
  context: { fill: "#1e293b", border: "#0f172a" },
  border: { color: "#0f172a", width: 0.5 },
  hover: { stroke: "#f8fafc", width: 1.5 },
  selected: { stroke: "#60a5fa", width: 2 },
  focus: { ring: "#93c5fd", width: 2 },
  dim: { opacity: 0.4 },
  bubble: { fill: "#60a5fa", stroke: "#0f172a", opacity: 0.8 },
  font: { color: "#e2e8f0" },
  tooltip: {
    background: "#f8fafc",
    color: "#0f172a",
    border: "#cbd5e1",
    radius: 4,
    shadow: "0 4px 12px rgb(0 0 0 / 0.4)",
  },
  controls: { background: "#1e293b", color: "#e2e8f0", border: "#334155", radius: 6 },
};

/** Mínimo: casi sin tinta. Fronteras finísimas, tooltip y controles sin caja marcada. */
const minimal: ChoroplethTheme = {
  background: "transparent",
  empty: { fill: "#eeeeee" },
  context: { fill: "#f3f3f3", border: "#ffffff" },
  border: { color: "#ffffff", width: 0.25 },
  hover: { stroke: "#444444", width: 1 },
  selected: { stroke: "#111111", width: 1.5 },
  focus: { ring: "#111111", width: 2 },
  dim: { opacity: 0.5 },
  bubble: { fill: "#111111", stroke: "#ffffff", opacity: 0.6 },
  font: { color: "#333333" },
  tooltip: {
    background: "#ffffff",
    color: "#222222",
    border: "transparent",
    radius: 2,
    shadow: "0 1px 4px rgb(0 0 0 / 0.18)",
  },
  controls: { background: "#ffffff", color: "#333333", border: "transparent", radius: 2 },
};

/**
 * Alto contraste: fronteras y resaltes gruesos, anillo de foco reforzado y colores que cumplen AA.
 * (La trama de «sin dato» de `dd.md §12.5.3` llega con `Defs`, paso 36: hasta entonces «sin dato» se
 * distingue por el gris y el borde, no por una textura.)
 */
const contrast: ChoroplethTheme = {
  background: "#ffffff",
  empty: { fill: "#bdbdbd" },
  context: { fill: "#e0e0e0", border: "#000000" },
  border: { color: "#000000", width: 1 },
  hover: { stroke: "#000000", width: 3 },
  selected: { stroke: "#0033cc", width: 4 },
  focus: { ring: "#000000", width: 4 },
  dim: { opacity: 0.35 },
  bubble: { fill: "#003399", stroke: "#000000", opacity: 0.85 },
  font: { color: "#000000", size: 14 },
  tooltip: {
    background: "#000000",
    color: "#ffffff",
    border: "#ffffff",
    radius: 0,
    shadow: "none",
  },
  controls: { background: "#ffffff", color: "#000000", border: "#000000", radius: 0 },
};

export const THEMES: Readonly<Record<ThemeName, ChoroplethTheme>> = {
  light,
  dark,
  minimal,
  contrast,
};

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === "string" && Object.hasOwn(THEMES, value);

/** El objeto de un tema por nombre, o el mismo objeto si ya lo es. `undefined` = sin tema. */
export const resolveTheme = (
  theme: ThemeName | ChoroplethTheme | undefined,
): ChoroplethTheme | undefined => (isThemeName(theme) ? THEMES[theme] : theme);

/**
 * Parte de un tema (por nombre u objeto) y le superpone ajustes, grupo a grupo: lo que pongas en
 * `border` sustituye solo esos campos de `border`, no el resto del tema.
 */
export const extendTheme = (
  base: ThemeName | ChoroplethTheme,
  overrides: ChoroplethTheme,
): ChoroplethTheme => {
  const from = resolveTheme(base) ?? {};
  const merged: Record<string, unknown> = { ...from };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const previous = merged[key];
    merged[key] =
      typeof value === "object" && value !== null && typeof previous === "object"
        ? { ...previous, ...value }
        : value;
  }
  return merged as ChoroplethTheme;
};

const px = (value: number) => `${value}px`;

/**
 * El objeto `theme` → variables CSS (`{ "--cm-border-color": "#fff", … }`), listas para un `style`. Pura:
 * sin DOM. Los campos sin definir no producen variable (se queda lo que hubiera: el CSS base o tu CSS).
 */
export const themeToCssVars = (theme: ChoroplethTheme | undefined): Record<string, string> => {
  const vars: Record<string, string> = {};
  if (theme === undefined) return vars;
  const set = (name: string, value: string | number | undefined, unit?: (n: number) => string) => {
    if (value === undefined) return;
    vars[`--cm-${name}`] =
      typeof value === "number" && unit !== undefined ? unit(value) : `${value}`;
  };
  set("background", theme.background);
  set("empty-fill", theme.empty?.fill);
  set("context-fill", theme.context?.fill);
  set("context-border-color", theme.context?.border);
  set("border-color", theme.border?.color);
  set("border-width", theme.border?.width, px);
  set("hover-stroke", theme.hover?.stroke);
  set("hover-stroke-width", theme.hover?.width, px);
  set("selected-stroke", theme.selected?.stroke);
  set("selected-stroke-width", theme.selected?.width, px);
  set("focus-ring", theme.focus?.ring);
  set("focus-ring-width", theme.focus?.width, px);
  set("dim-opacity", theme.dim?.opacity);
  set("bubble-fill", theme.bubble?.fill);
  set("bubble-stroke", theme.bubble?.stroke);
  set("bubble-opacity", theme.bubble?.opacity);
  set("font-family", theme.font?.family);
  set("font-size", theme.font?.size, px);
  set("label-color", theme.font?.color);
  set("tooltip-bg", theme.tooltip?.background);
  set("tooltip-color", theme.tooltip?.color);
  set("tooltip-border", theme.tooltip?.border);
  set("tooltip-radius", theme.tooltip?.radius, px);
  set("tooltip-shadow", theme.tooltip?.shadow);
  set("control-bg", theme.controls?.background);
  set("control-color", theme.controls?.color);
  set("control-border", theme.controls?.border);
  set("control-radius", theme.controls?.radius, px);
  return vars;
};
