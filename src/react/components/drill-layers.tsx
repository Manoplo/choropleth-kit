import type { MouseEvent } from "react";
import { useChoroplethContext } from "../choropleth-context";

/**
 * Las capas del drill que NO son la activa (dd.md §11.2.5), dentro de la cámara:
 *  - `context`: los niveles de arriba, en gris y sin color de dato. Razón cartográfica: la escala del padre y
 *    la del hijo son distintas; ver ambas en color invita a comparar lo que no es comparable. Sus regiones
 *    navegables se pueden pulsar (navegación lateral).
 *  - `exiting`: el nivel que se acaba de dejar, que se desvanece.
 *
 * Las rutas son las CACHEADAS de cada nivel, en los píxeles de su proyección; el `transform` del `<g>` (la
 * afín `R`, que NO es el de la cámara) las lleva a los del nivel activo: cero recálculo.
 *
 * `role="context"` va DEBAJO de las regiones activas y `role="exiting"` ENCIMA (se desvanece sobre ellas).
 */
export const DrillLayers = ({ role }: { role: "context" | "exiting" }) => {
  const { choropleth } = useChoroplethContext();
  const { drillLayers, selectContextItem } = choropleth;
  const layers = drillLayers.filter((layer) => layer.role === role);
  if (layers.length === 0) return null;

  return (
    <>
      {layers.map((layer) => {
        const { k, x, y } = layer.transform;
        return (
          <g
            key={layer.key}
            className="cm-layer"
            data-role={layer.role}
            data-depth={layer.depth}
            transform={`translate(${x},${y}) scale(${k})`}
            pointerEvents={layer.role === "exiting" ? "none" : undefined}
            onClick={
              layer.role === "context"
                ? (event: MouseEvent<SVGGElement>) => {
                    const id = (event.target as Element)
                      .closest?.("[data-context-id]")
                      ?.getAttribute("data-context-id");
                    const known = id == null ? undefined : layer.paths.find((p) => p.id === id);
                    if (known?.drillable === true && id != null) selectContextItem(layer.depth, id);
                  }
                : undefined
            }
          >
            {layer.paths.map((path, index) => (
              <path
                key={path.id ?? `anonymous-${index}`}
                className="cm-context-region"
                d={path.d}
                data-context-id={path.id}
                data-focus={path.focus ? "" : undefined}
                data-drillable={path.drillable ? "" : undefined}
                // Al salir conserva su color de dato (solo `exiting`); el contexto lo da el CSS, en gris.
                style={path.fill === undefined ? undefined : { fill: path.fill }}
              />
            ))}
          </g>
        );
      })}
    </>
  );
};
