import { useChoroplethContext } from "../choropleth-context";

/**
 * Microestados que la geometría no dibuja (Andorra, Mónaco, Singapur en 1:110m), pintados como un
 * punto con el color de su dato (`fallbackPoints`, dd.md §11.2.7). Son items `point`: tienen su
 * propio hover, clic y tooltip. En `bubble` no se usa: ahí son burbujas.
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
