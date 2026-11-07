import type { ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";

export type DefsProps = {
  /** Tus propias definiciones (`<pattern>`, `<linearGradient>`, `<filter>`), con ids de `useDefId`. */
  children?: ReactNode;
};

/**
 * `<defs>` del mapa: las tramas incluidas (`hatch` y `dots`) más las tuyas. Los ids llevan un prefijo por
 * instancia (`useDefId`): con dos mapas en la página, cada uno referencia SUS definiciones.
 *
 * Las tramas dibujan con `currentColor` y el `color` del propio `<pattern>` es `--cm-pattern-color` (por defecto,
 * el color del texto al 45 %), así que respetan el tema (también en oscuro).
 */
export const Defs = ({ children }: DefsProps) => {
  const { defId } = useChoroplethContext();
  const color = {
    color:
      "var(--cm-pattern-color, color-mix(in srgb, var(--cm-label-color, #111111) 45%, transparent))",
  };
  return (
    <defs>
      <pattern
        id={defId("hatch")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
        style={color}
      >
        <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
      </pattern>
      <pattern id={defId("dots")} width="6" height="6" patternUnits="userSpaceOnUse" style={color}>
        <circle cx="3" cy="3" r="1.2" fill="currentColor" />
      </pattern>
      {children}
    </defs>
  );
};
