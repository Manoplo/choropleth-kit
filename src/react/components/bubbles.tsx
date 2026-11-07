import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

/**
 * Burbujas (variant `bubble`). Ya vienen ordenadas de mayor a menor, así que las pequeñas quedan
 * encima.
 *
 * Dos tipos, con interacción distinta (dd.md §12.1):
 *  - **En el centroide de una región** (`coordinates: null`): no capturan el ratón; el hover y el
 *    clic los gestiona la región que tienen debajo (item `region`).
 *  - **Con coordenadas propias** (tiendas): son items `point`, con su propio hover, clic y tooltip.
 */
export const Bubbles = () => {
  const { choropleth, classNames } = useChoroplethContext();
  const { bubbles, clickable, getPointProps } = choropleth;
  if (bubbles.length === 0) return null;

  return (
    <g className={cx("cm-bubbles", classNames.bubbles)} pointerEvents="none">
      {bubbles.map((bubble) => {
        const isPoint = bubble.coordinates !== null;
        return (
          <circle
            key={bubble.id}
            className={cx("cm-bubble", classNames.bubble)}
            data-bubble-id={bubble.id}
            cx={bubble.x}
            cy={bubble.y}
            r={bubble.r}
            style={{ fill: bubble.fill, cursor: isPoint && clickable ? "pointer" : undefined }}
            // El `none` del grupo se hereda: los puntos lo anulan para recibir eventos.
            pointerEvents={isPoint ? "auto" : undefined}
            {...(isPoint ? getPointProps(bubble) : undefined)}
          />
        );
      })}
    </g>
  );
};
