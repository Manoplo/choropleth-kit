/**
 * Pattern presets: a catalogue of small repeating tiles used to fill regions and the map's background.
 *
 * Pure data, no React or DOM. Each preset is ONE square tile (`size × size` units) drawn with a single
 * `<path>`, either stroked (lines) or filled (dots, blocks), always in `currentColor`, so the consumer
 * colors it with CSS (`--cm-pattern-color`) or a `color` prop. The tiles are authored for this library and
 * are meant to repeat seamlessly (what leaves one edge enters through the opposite one).
 *
 * The ids come in families (`diagonal-up`, `diagonal-up-sparse`…): `-dense` and `-sparse` change the spacing.
 */

export type PatternPresetSpec = {
  /** Side of the square tile, in tile units. */
  size: number;
  /** `"stroke"`: the path is a line drawn with `strokeWidth`. `"fill"`: the path is a closed shape that is filled. */
  kind: "stroke" | "fill";
  /** SVG path data, in the tile's `0 0 size size` coordinates. */
  d: string;
  /** Stroked presets: line width in tile units. Defaults to 1. */
  strokeWidth?: number;
  /** Stroked presets: `stroke-dasharray` (tile units), for dashed families. */
  dash?: string;
};

/** A filled circle as a closed path (so it is one `d` with the rest of the tile). */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/** A filled square. */
const square = (x: number, y: number, side: number): string =>
  `M${x} ${y}h${side}v${side}h${-side}z`;

/**
 * 45° lines that tile seamlessly: the main diagonal plus the two corner stubs that complete it across the
 * tile edges. `up` rises to the right (`/`), `down` falls to the right (`\`).
 */
const diagonalUp = (s: number): string =>
  `M0 ${s}L${s} 0M-1 1L1 -1M${s - 1} ${s + 1}L${s + 1} ${s - 1}`;
const diagonalDown = (s: number): string =>
  `M0 0L${s} ${s}M-1 ${s - 1}L1 ${s + 1}M${s - 1} -1L${s + 1} 1`;

export const PATTERN_PRESETS = {
  // ── Lines ───────────────────────────────────────────────────────────────────────────────────
  vertical: { size: 6, kind: "stroke", d: "M3 0V6" },
  "vertical-dense": { size: 3, kind: "stroke", d: "M1.5 0V3" },
  horizontal: { size: 6, kind: "stroke", d: "M0 3H6" },
  "horizontal-dense": { size: 3, kind: "stroke", d: "M0 1.5H3" },
  "diagonal-up": { size: 6, kind: "stroke", d: diagonalUp(6) },
  "diagonal-up-sparse": { size: 12, kind: "stroke", d: diagonalUp(12) },
  "diagonal-down": { size: 6, kind: "stroke", d: diagonalDown(6) },
  "diagonal-down-sparse": { size: 12, kind: "stroke", d: diagonalDown(12) },
  // ── Grids ───────────────────────────────────────────────────────────────────────────────────
  grid: { size: 6, kind: "stroke", d: "M3 0V6M0 3H6" },
  "grid-sparse": { size: 12, kind: "stroke", d: "M6 0V12M0 6H12" },
  crosshatch: { size: 8, kind: "stroke", d: `${diagonalUp(8)}${diagonalDown(8)}` },
  // ── Dashed ──────────────────────────────────────────────────────────────────────────────────
  "vertical-dashed": { size: 6, kind: "stroke", d: "M3 0V6", dash: "3 3" },
  "horizontal-dashed": { size: 6, kind: "stroke", d: "M0 3H6", dash: "3 3" },
  "grid-dashed": { size: 8, kind: "stroke", d: "M4 0V8M0 4H8", dash: "3 5" },
  // ── Dots ────────────────────────────────────────────────────────────────────────────────────
  "dots-dense": { size: 4, kind: "fill", d: circle(2, 2, 0.7) },
  dots: { size: 6, kind: "fill", d: circle(3, 3, 0.9) },
  "dots-sparse": { size: 12, kind: "fill", d: circle(6, 6, 1) },
  "dots-staggered": { size: 8, kind: "fill", d: `${circle(2, 2, 0.9)}${circle(6, 6, 0.9)}` },
  "diagonal-dots-up": {
    size: 6,
    kind: "fill",
    d: `${circle(1, 5, 0.8)}${circle(3, 3, 0.8)}${circle(5, 1, 0.8)}`,
  },
  "diagonal-dots-down": {
    size: 6,
    kind: "fill",
    d: `${circle(1, 1, 0.8)}${circle(3, 3, 0.8)}${circle(5, 5, 0.8)}`,
  },
  // ── Circles ─────────────────────────────────────────────────────────────────────────────────
  "circles-dense": { size: 6, kind: "fill", d: circle(3, 3, 1.5) },
  circles: { size: 12, kind: "fill", d: circle(6, 6, 2) },
  "circles-sparse": { size: 24, kind: "fill", d: `${circle(6, 6, 2)}${circle(18, 18, 2)}` },
  rings: { size: 10, kind: "stroke", d: "M8 5a3 3 0 1 0-6 0a3 3 0 1 0 6 0z", strokeWidth: 0.8 },
  // ── Marks ───────────────────────────────────────────────────────────────────────────────────
  plus: { size: 8, kind: "stroke", d: "M4 2.5V5.5M2.5 4H5.5" },
  waves: { size: 6, kind: "stroke", d: "M0 3Q1.5 0 3 3T6 3" },
  zigzag: { size: 6, kind: "stroke", d: "M0 2L1.5 4L3 2L4.5 4L6 2" },
  // ── Tiles ───────────────────────────────────────────────────────────────────────────────────
  blocks: { size: 6, kind: "fill", d: square(1, 1, 3) },
  "checkerboard-xs": { size: 6, kind: "fill", d: `${square(0, 0, 3)}${square(3, 3, 3)}` },
  "checkerboard-sm": { size: 8, kind: "fill", d: `${square(0, 0, 4)}${square(4, 4, 4)}` },
  checkerboard: { size: 12, kind: "fill", d: `${square(0, 0, 6)}${square(6, 6, 6)}` },
  "checkerboard-lg": { size: 24, kind: "fill", d: `${square(0, 0, 12)}${square(12, 12, 12)}` },
} as const satisfies Record<string, PatternPresetSpec>;

export type PatternPresetId = keyof typeof PATTERN_PRESETS;

/** Every preset id, in catalogue order (families together): to build selectors and docs. */
export const PATTERN_PRESET_IDS = Object.keys(PATTERN_PRESETS) as PatternPresetId[];

export const isPatternPresetId = (id: unknown): id is PatternPresetId =>
  typeof id === "string" && Object.hasOwn(PATTERN_PRESETS, id);

/** The preset by id, or `null` if it is not in the catalogue (a custom pattern, `"none"`, a typo). */
export const resolvePatternPreset = (id: string | null | undefined): PatternPresetSpec | null =>
  isPatternPresetId(id) ? PATTERN_PRESETS[id] : null;

/**
 * The attributes of the `<pattern>` element for a preset at a `scale` (1 = the tile units are pixels):
 * the tile is drawn in its own `viewBox` and the element's width/height scale it, so the line width scales too.
 * `null` for an unknown id.
 */
export type PatternTile = {
  /** Width and height of the `<pattern>`, in user-space units. */
  size: number;
  viewBox: string;
  kind: PatternPresetSpec["kind"];
  d: string;
  strokeWidth: number;
  dash: string | undefined;
};

export const buildPatternTile = (id: string, scale = 1): PatternTile | null => {
  const spec = resolvePatternPreset(id);
  if (spec === null) return null;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    size: spec.size * safeScale,
    viewBox: `0 0 ${spec.size} ${spec.size}`,
    kind: spec.kind,
    d: spec.d,
    strokeWidth: ("strokeWidth" in spec ? spec.strokeWidth : undefined) ?? 1,
    dash: "dash" in spec ? spec.dash : undefined,
  };
};

// ── Background ────────────────────────────────────────────────────────────────────────────────

export type BackgroundOptions = {
  /** Preset from the catalogue. Defaults to `"dots"`. `"none"` draws nothing. */
  pattern?: PatternPresetId | "none";
  /** CSS color of the pattern. Defaults to `var(--cm-background-pattern-color)`, then the theme's grid color. */
  color?: string;
  /** 0–1. Defaults to 1 (the color already carries its own transparency). */
  opacity?: number;
  /** Tile size multiplier (and line width). Defaults to 1. */
  scale?: number;
  /** Fade the pattern out toward the left and right edges. Defaults to `true`. */
  fadeHorizontal?: boolean;
  /** Fade the pattern out toward the top and bottom edges. Defaults to `true`. */
  fadeVertical?: boolean;
  /** Width of each horizontal fade, as % of the width (0–45). Defaults to 10. */
  fadeHorizontalLength?: number;
  /** Width of each vertical fade, as % of the height (0–45). Defaults to 10. */
  fadeVerticalLength?: number;
};

export type ResolvedBackground = {
  pattern: PatternPresetId;
  color: string;
  opacity: number;
  scale: number;
  /** Fade length in % per edge; `0` when that axis does not fade. */
  fadeX: number;
  fadeY: number;
};

export const DEFAULT_BACKGROUND_COLOR =
  "var(--cm-background-pattern-color, color-mix(in srgb, var(--cm-label-color, #111111) 35%, transparent))";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Normalizes the `background` option. `false`/`undefined`/`"none"` → `null` (no layer); a preset id
 * is shorthand for `{ pattern: id }`; `true` means the defaults.
 */
export const resolveBackground = (
  input: boolean | PatternPresetId | "none" | BackgroundOptions | undefined,
): ResolvedBackground | null => {
  if (input === undefined || input === false || input === "none") return null;
  const options: BackgroundOptions =
    input === true ? {} : typeof input === "string" ? { pattern: input } : input;
  const pattern = options.pattern ?? "dots";
  if (pattern === "none" || !isPatternPresetId(pattern)) return null;
  return {
    pattern,
    color: options.color ?? DEFAULT_BACKGROUND_COLOR,
    opacity: clamp(finiteOr(options.opacity, 1), 0, 1),
    scale: Math.max(0.1, finiteOr(options.scale, 1)),
    fadeX:
      options.fadeHorizontal === false
        ? 0
        : clamp(finiteOr(options.fadeHorizontalLength, 10), 0, 45),
    fadeY:
      options.fadeVertical === false ? 0 : clamp(finiteOr(options.fadeVerticalLength, 10), 0, 45),
  };
};
