import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ChoroplethContext } from "../choropleth-context";
import { createPointerStore } from "../pointer-store";
import {
  useChoropleth,
  type UseChoroplethOptions,
  type UseChoroplethResult,
} from "../use-choropleth";

export type RootProps<TDatum> = UseChoroplethOptions<TDatum> & {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** No aplica los estilos base de `styles.css` (las variables `--cm-*` siguen definidas). */
  unstyled?: boolean;
};

/**
 * Nivel 2: llama a `useChoropleth` UNA vez y reparte el resultado por Context a sus hijos.
 * Es el contenedor medido (`containerRef`) y la referencia de posición del tooltip.
 */
export const Root = <TDatum,>({
  children,
  className,
  style,
  unstyled,
  ...options
}: RootProps<TDatum>) => {
  const choropleth = useChoropleth<TDatum>(options as UseChoroplethOptions<TDatum>);
  const { containerRef } = choropleth;
  const [pointer] = useState(createPointerStore);

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <ChoroplethContext.Provider
      value={{ choropleth: choropleth as UseChoroplethResult<unknown>, pointer }}
    >
      <div
        ref={containerRef}
        className={className === undefined ? "cm-root" : `cm-root ${className}`}
        // `relative`: el tooltip y la leyenda se posicionan respecto a este contenedor.
        data-unstyled={unstyled ? "" : undefined}
        style={{ position: "relative", ...style }}
        onMouseMove={handleMove}
        onMouseLeave={() => pointer.set(null)}
      >
        {children}
      </div>
    </ChoroplethContext.Provider>
  );
};
