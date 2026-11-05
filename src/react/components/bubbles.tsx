import { useChoroplethContext } from "../choropleth-context";

/**
 * Burbujas (variant `bubble`). Ya vienen ordenadas de mayor a menor, así que las pequeñas quedan
 * encima. No capturan el ratón: el hover y el clic los gestiona la región que tienen debajo.
 * (Las burbujas con coordenadas propias, sin región, aún no son interactivas.)
 */
export const Bubbles = () => {
  const { choropleth } = useChoroplethContext();
  if (choropleth.bubbles.length === 0) return null;

  return (
    <g className="cm-bubbles" pointerEvents="none">
      {choropleth.bubbles.map((bubble) => (
        <circle
          key={bubble.id}
          className="cm-bubble"
          data-bubble-id={bubble.id}
          cx={bubble.x}
          cy={bubble.y}
          r={bubble.r}
          style={{ fill: bubble.fill }}
        />
      ))}
    </g>
  );
};
