import type { ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";
import { Borders } from "./borders";
import { Regions } from "./regions";
import { Selection } from "./selection";

export type SvgProps = {
  /** Capas del mapa, de abajo arriba. Por defecto: `Regions`, `Borders` y `Selection`. */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

/**
 * El `<svg>`. Existe como pieza propia porque `Root` mezcla SVG (regiones, fronteras) y HTML
 * (leyenda, tooltip), y un elemento HTML no puede vivir dentro de un `<svg>`.
 * (dd.md §9.3 no lo nombra: es la única diferencia con su ejemplo.)
 */
export const Svg = ({ children, className, ariaLabel }: SvgProps) => {
  const { choropleth } = useChoroplethContext();
  const { width, height } = choropleth;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {children ?? (
        <>
          <Regions />
          <Borders />
          <Selection />
        </>
      )}
    </svg>
  );
};
