import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { FIT_TRANSFORM, toViewState } from "../../core";
import { ChoroplethContext } from "../choropleth-context";
import { createHandle, type ChoroplethMapHandle } from "../handle";
import { ROOT_LEVEL } from "../map-item";
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

const RootInner = <TDatum,>(
  { children, className, style, unstyled, dimOthers = "selection", ...options }: RootProps<TDatum>,
  ref: ForwardedRef<ChoroplethMapHandle>,
) => {
  const choropleth = useChoropleth<TDatum>({
    ...options,
    dimOthers,
  } as UseChoroplethOptions<TDatum>);
  const { containerRef, store, status, dataLoading, selectedId, drillPhase } = choropleth;
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

  // El handle imperativo (`ref` y `useChoroplethApi()`): un objeto estable que consulta el store en cada
  // llamada. Sin zoom no hay cámara que consultar: la vista es siempre el encaje, y se registra aquí.
  const { width, height, invert } = choropleth;
  useEffect(() => {
    store.registerFallbackView(() =>
      toViewState({ transform: FIT_TRANSFORM, size: { width, height }, invert, level: ROOT_LEVEL }),
    );
    return () => store.registerFallbackView(null);
  }, [store, width, height, invert]);
  const api = useMemo(() => createHandle(store), [store]);
  useImperativeHandle(ref, () => api, [api]);

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    store.setState({ pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top } });
  };

  return (
    <ChoroplethContext.Provider
      value={{ choropleth: choropleth as UseChoroplethResult<unknown>, store, viewportRef, api }}
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
        // La fase del drill en el contenedor + CSS: atenuar, «respirar» y revelar sin tocar las regiones.
        data-drill-phase={drillPhase === null || drillPhase === "idle" ? undefined : drillPhase}
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

/**
 * Nivel 2: llama a `useChoropleth` UNA vez y reparte el resultado por Context a sus hijos.
 * Es el contenedor medido (`containerRef`) y la referencia de posición del tooltip.
 *
 * `ref` da el handle imperativo (`zoomTo`, `zoomBy`, `resetView`, `getView`). Se usa `forwardRef`
 * (y no `ref` como prop, que solo existe en React 19) para que funcione también en React 18.
 */
export const Root = forwardRef(RootInner) as <TDatum>(
  props: RootProps<TDatum> & { ref?: Ref<ChoroplethMapHandle> },
) => ReactElement | null;
