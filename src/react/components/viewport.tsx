import type { ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";

/**
 * La cámara (dd.md §11.0): el `<g>` al que `d3-zoom` aplica el `transform` de zoom y pan. Todo lo
 * que deba moverse con el mapa (regiones, fronteras, burbujas, selección) va dentro.
 *
 * ⚠️ **React nunca escribe el atributo `transform` de este `<g>`**; por eso no hay ninguna prop que
 * lo toque. Lo escribe `d3-zoom` en cada frame (dd.md §11.1.3). Si lo escribiera React, cualquier
 * render pisaría el estado interno de d3 y el mapa saltaría.
 */
export const Viewport = ({ children }: { children?: ReactNode }) => {
  const { viewportRef } = useChoroplethContext();
  return (
    <g ref={viewportRef} className="cm-viewport">
      {children}
    </g>
  );
};
