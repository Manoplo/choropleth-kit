/**
 * Theme (dd.md §12.5.3): a typed object that is translated into `--cm-*` CSS variables. **The
 * variables remain the single source of truth**: the object is sugar so there is autocompletion and
 * reusable themes.
 *
 * It is pure (no React or DOM) and lives in `core` even though `dd.md` puts it in `react/theme.ts`:
 * that way it is tested without rendering and a consumer without React can use `themeToCssVars`.
 *
 * It only has fields for what EXISTS today. `sphere`, `graticule`, `hover.effect`, `selected.glow`,
 * `motion` and `empty.pattern` from `dd.md §12.5.3` arrive with the layers and effects that consume
 * them (adding a field breaks nobody; having one that does nothing does mislead).
 */

export type ChoroplethTheme = {
  /** Map background (the `.cm-root`). Transparent by default. */
  background?: string;
  /** Regions without data. `pattern`: a pattern over regions without data (not just color: they can be told apart without seeing it either). None by default. */
  empty?: { fill?: string; pattern?: "none" | "hatch" | "dots" };
  /** The levels above in a drill: gray, with no data color. */
  context?: { fill?: string; border?: string };
  /** Borders between regions. */
  border?: { color?: string; width?: number };
  hover?: { stroke?: string; width?: number };
  selected?: { stroke?: string; width?: number };
  /** Keyboard focus ring: color and thickness (px). */
  focus?: { ring?: string; width?: number };
  /** Opacity of the rest of the map with `dimOthers`. */
  dim?: { opacity?: number };
  bubble?: { fill?: string; stroke?: string; opacity?: number };
  font?: { family?: string; size?: number; color?: string };
  tooltip?: {
    background?: string;
    color?: string;
    border?: string;
    /** px */
    radius?: number;
    /** A `box-shadow` value. */
    shadow?: string;
  };
  /** Zoom buttons and drill breadcrumbs. */
  controls?: { background?: string; color?: string; border?: string; radius?: number };
};

export type ThemeName = "light" | "dark" | "minimal" | "contrast";

/** Identity: it exists to infer the type with autocompletion and to reuse a theme across maps. */
export const defineTheme = (theme: ChoroplethTheme): ChoroplethTheme => theme;

/**
 * Light is the default look, written out explicitly: `theme="light"` guarantees that look even if the
 * page sets its own variables higher up.
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
 * Dark: dark background, mid-gray "no data", dark borders and an inverted tooltip. Mind the palette: ramps
 * that are light at one end ("blues") blend into the background; `viridis` reads well. (Ramp reversal,
 * `{ name, reverse: true }` from `dd.md §12.5.3`, does not exist yet.)
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

/** Minimal: almost no ink. Hairline borders, tooltip and controls without a marked box. */
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
 * High contrast: thick borders and highlights, reinforced focus ring, colors that meet AA and a hatched
 * "no data" (it does not rely on color alone).
 */
const contrast: ChoroplethTheme = {
  background: "#ffffff",
  empty: { fill: "#bdbdbd", pattern: "hatch" },
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

/** A theme's object by name, or the same object if it already is one. `undefined` = no theme. */
export const resolveTheme = (
  theme: ThemeName | ChoroplethTheme | undefined,
): ChoroplethTheme | undefined => (isThemeName(theme) ? THEMES[theme] : theme);

/**
 * Starts from a theme (by name or object) and overlays adjustments, group by group: whatever you put in
 * `border` replaces only those `border` fields, not the rest of the theme.
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
 * The `theme` object → CSS variables (`{ "--cm-border-color": "#fff", … }`), ready for a `style`. Pure:
 * no DOM. Undefined fields produce no variable (whatever was there stays: the base CSS or yours).
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
