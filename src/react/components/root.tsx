import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { ChoroplethContext } from "../choropleth-context";
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
  const { containerRef, store } = choropleth;

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    store.setState({ pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top } });
  };

  return (
    <ChoroplethContext.Provider
      value={{ choropleth: choropleth as UseChoroplethResult<unknown>, store }}
    >
      <div
        ref={containerRef}
        className={className === undefined ? "cm-root" : `cm-root ${className}`}
        // `relative`: el tooltip y la leyenda se posicionan respecto a este contenedor.
        data-unstyled={unstyled ? "" : undefined}
        style={{ position: "relative", ...style }}
        // `pointerdown` además de `move`: un toque no mueve el puntero, y el tooltip necesita posición.
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") store.setState({ pointer: null });
        }}
      >
        {children}
      </div>
    </ChoroplethContext.Provider>
  );
};
