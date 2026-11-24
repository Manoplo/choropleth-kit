import { buildPatternTile } from "../../core";

/** Color of the tile's artwork: `--cm-pattern-color` (the text color at 45 % by default), so it follows the theme. */
export const PATTERN_COLOR =
  "var(--cm-pattern-color, color-mix(in srgb, var(--cm-label-color, #111111) 45%, transparent))";

export type PatternTileDefProps = {
  /** The element's `id` (already prefixed per map instance). */
  id: string;
  /** A preset id from the catalogue. An unknown id renders nothing. */
  preset: string;
  /** Tile size multiplier (line width scales with it). Defaults to 1. */
  scale?: number;
  /** CSS color. Defaults to `--cm-pattern-color`. */
  color?: string;
};

/**
 * One `<pattern>` for a preset of the catalogue. The artwork is in `currentColor` and the tile's own
 * `color` is what the consumer themes; the tile is drawn in its own `viewBox`, so `scale` also scales the lines.
 */
export const PatternTileDef = ({ id, preset, scale = 1, color }: PatternTileDefProps) => {
  const tile = buildPatternTile(preset, scale);
  if (tile === null) return null;
  return (
    <pattern
      id={id}
      width={tile.size}
      height={tile.size}
      viewBox={tile.viewBox}
      patternUnits="userSpaceOnUse"
      style={{ color: color ?? PATTERN_COLOR }}
    >
      {tile.kind === "fill" ? (
        <path d={tile.d} fill="currentColor" />
      ) : (
        <path
          d={tile.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={tile.strokeWidth}
          strokeDasharray={tile.dash}
        />
      )}
    </pattern>
  );
};
