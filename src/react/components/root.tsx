import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
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
  dimOthers = "selection",
  ...options
}: RootProps<TDatum>) => {
  const choropleth = useChoropleth<TDatum>({
    ...options,
    dimOthers,
  } as UseChoroplethOptions<TDatum>);
  const { containerRef, store, status, dataLoading, selectedId } = choropleth;
  const viewportRef = useRef<SVGGElement | null>(null);

  // `data-interacting` se escribe en el DOM, NO como prop: si fuera estado de `Root`, empezar y
  // terminar cada gesto re-renderizaría todo el mapa (join, escala, leyenda). Con el atributo el CSS
  // quita transiciones y eventos de las regiones y oculta el tooltip sin un solo render.
  useEffect(() => {
    const sync = () => {
      containerRef.current?.toggleAttribute("data-interacting", store.getState().interacting);
    };
    sync();
    return store.subscribe(sync);
  }, [store, containerRef]);

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    store.setState({ pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top } });
  };

  return (
    <ChoroplethContext.Provider
      value={{ choropleth: choropleth as UseChoroplethResult<unknown>, store, viewportRef }}
    >
      <div
        ref={containerRef}
        className={className === undefined ? "cm-root" : `cm-root ${className}`}
        // `relative`: el tooltip y la leyenda se posicionan respecto a este contenedor.
        data-unstyled={unstyled ? "" : undefined}
        // Atributos en el contenedor + CSS: atenuar, mostrar carga… sin tocar las regiones.
        data-status={status}
        data-loading={dataLoading ? "" : undefined}
        data-dim={dimOthers}
        data-has-selection={selectedId === null ? undefined : ""}
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
