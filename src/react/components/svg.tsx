import type { ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";
import { Borders } from "./borders";
import { Bubbles } from "./bubbles";
import { FallbackPoints } from "./fallback-points";
import { Regions } from "./regions";
import { Selection } from "./selection";

export type SvgProps = {
  /**
   * Capas del mapa, de abajo arriba. Por defecto: `Regions`, `Borders`, `Bubbles`,
   * `FallbackPoints` y `Selection`.
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
  const { choropleth } = useChoroplethContext();
  const { width, height, status, labels } = choropleth;

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

  return (
    <svg
      className={className === undefined ? "cm-svg" : `cm-svg ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {children ?? (
        <>
          <Regions />
          <Borders />
          <Bubbles />
          <FallbackPoints />
          <Selection />
        </>
      )}
    </svg>
  );
};
