import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";
import { Borders } from "./borders";
import { Bubbles } from "./bubbles";
import { FallbackPoints } from "./fallback-points";
import { Regions } from "./regions";
import { Selection } from "./selection";
import { zoomKeyAction } from "../../core";
import { useZoom } from "../use-zoom";
import { Viewport } from "./viewport";

export type SvgProps = {
  /**
   * Capas del mapa, de abajo arriba. Por defecto, dentro de un `Viewport` (la cámara): `Regions`,
   * `Borders`, `Bubbles`, `FallbackPoints` y `Selection`. Si pasas tus capas, envuélvelas en
   * `<Choropleth.Viewport>` para que se muevan con el zoom.
   */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

/**
 * El `<svg>`. Existe como pieza propia porque `Root` mezcla SVG (regiones, fronteras) y HTML
 * (leyenda, tooltip), y un elemento HTML no puede vivir dentro de un `<svg>`.
 * (dd.md §9.3 no lo nombra: es la única diferencia con su ejemplo.)
 *
 * Mientras la geometría asíncrona no llega, pinta un esqueleto con la misma proporción que tendrá
 * el mapa: la página no salta cuando aparece.
 */
export const Svg = ({ children, className, ariaLabel }: SvgProps) => {
  const { choropleth, store, viewportRef } = useChoroplethContext();
  const {
    width,
    height,
    status,
    labels,
    zoom,
    invert,
    onViewChange,
    resolveCamera,
    focusId,
    containerRef,
  } = choropleth;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Antes de los `return` tempranos (los hooks no pueden ser condicionales): mientras carga no hay
  // `<svg>`, y `ready` reengancha el zoom cuando aparece.
  useZoom({
    svgRef,
    viewportRef,
    rootRef: containerRef,
    store,
    width,
    height,
    options: zoom,
    invert,
    onViewChange,
    resolveCamera,
    focusId,
    ready: status === "ready",
  });

  if (status === "loading") {
    return <div className="cm-skeleton" style={{ aspectRatio: `${width} / ${height}` }} />;
  }
  if (status === "error") {
    return (
      <div className="cm-error" role="alert" style={{ aspectRatio: `${width} / ${height}` }}>
        {labels.geographyError}
      </div>
    );
  }

  // Atajos de teclado con el mapa enfocado. `tabIndex` solo si hay atajos: no se añade un tab stop vacío.
  const keyboard = zoom !== null && zoom.keyboard;
  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const action = zoomKeyAction(event);
    if (action === null) return;
    event.preventDefault();
    const api = store.getZoom();
    if (action === "reset") void api?.resetView();
    else void api?.zoomBy(action === "in" ? 2 : 0.5);
  };

  return (
    <svg
      ref={svgRef}
      tabIndex={keyboard ? 0 : undefined}
      onKeyDown={keyboard ? handleKeyDown : undefined}
      className={className === undefined ? "cm-svg" : `cm-svg ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {children ?? (
        <Viewport>
          <Regions />
          <Borders />
          <Bubbles />
          <FallbackPoints />
          <Selection />
        </Viewport>
      )}
    </svg>
  );
};
