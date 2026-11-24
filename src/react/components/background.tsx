import { resolveBackground, type BackgroundOptions } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { PatternTileDef } from "./pattern-tile";

const stops = (edge: number) => (
  <>
    <stop offset="0%" stopColor="#fff" stopOpacity={0} />
    <stop offset={`${edge}%`} stopColor="#fff" stopOpacity={1} />
    <stop offset={`${100 - edge}%`} stopColor="#fff" stopOpacity={1} />
    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
  </>
);

/**
 * A static pattern behind the map (dots, grid, lines, checkerboard…) with soft fades toward the edges.
 * It sits OUTSIDE the `Viewport`, so it does not zoom or pan with the camera, and it takes no pointer events.
 * Use it inside `<Choropleth.Svg>` before `<Choropleth.Viewport>`, or pass `background` to `ChoroplethMap`.
 *
 * The fade is an SVG mask (a white gradient per axis, multiplied when both are on).
 */
export const Background = (props: BackgroundOptions) => {
  const { choropleth, defId, classNames } = useChoroplethContext();
  const { width, height } = choropleth;
  const bg = resolveBackground(props);
  if (bg === null || width <= 0 || height <= 0) return null;

  const patternId = defId("bg-pattern");
  const gradX = defId("bg-grad-x");
  const gradY = defId("bg-grad-y");
  const maskX = defId("bg-mask-x");
  const maskY = defId("bg-mask-y");

  const rect = (
    <rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill={`url(#${patternId})`}
      opacity={bg.opacity}
      mask={bg.fadeY > 0 ? `url(#${maskY})` : undefined}
    />
  );

  return (
    <g
      className={cx("cm-background", classNames.background)}
      pointerEvents="none"
      aria-hidden="true"
    >
      <defs>
        <PatternTileDef id={patternId} preset={bg.pattern} scale={bg.scale} color={bg.color} />
        {bg.fadeX > 0 && (
          <>
            <linearGradient id={gradX} x1="0" x2="1" y1="0" y2="0">
              {stops(bg.fadeX)}
            </linearGradient>
            <mask id={maskX} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect width={width} height={height} fill={`url(#${gradX})`} />
            </mask>
          </>
        )}
        {bg.fadeY > 0 && (
          <>
            <linearGradient id={gradY} x1="0" x2="0" y1="0" y2="1">
              {stops(bg.fadeY)}
            </linearGradient>
            <mask id={maskY} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect width={width} height={height} fill={`url(#${gradY})`} />
            </mask>
          </>
        )}
      </defs>
      {bg.fadeX > 0 ? <g mask={`url(#${maskX})`}>{rect}</g> : rect}
    </g>
  );
};
