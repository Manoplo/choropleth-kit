import { useChoroplethContext } from "../choropleth-context";

/**
 * Microstates the geometry does not draw (Andorra, Monaco, Singapore at 1:110m), painted as a dot with
 * their datum's color (`fallbackPoints`, dd.md §11.2.7). They are `point` items: they have their own
 * hover, click and tooltip. Not used in `bubble`: there they are bubbles.
 */
export const FallbackPoints = () => {
  const { choropleth } = useChoroplethContext();
  const { fallbackPoints, clickable, getPointProps } = choropleth;
  if (fallbackPoints.length === 0) return null;

  return (
    <g className="cm-fallback-points">
      {fallbackPoints.map((point) => (
        <circle
          key={point.id}
          className="cm-fallback-point"
          cx={point.x}
          cy={point.y}
          r={point.r}
          style={{ fill: point.fill, cursor: clickable ? "pointer" : undefined }}
          {...getPointProps(point)}
        />
      ))}
    </g>
  );
};
