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
import {
  FIT_TRANSFORM,
  isThemeName,
  resolveTheme,
  themeToCssVars,
  toViewState,
  type ChoroplethTheme,
  type ThemeName,
} from "../../core";
import { cx, type ChoroplethClassNames } from "../class-names";
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
  /** No aplica los estilos base de `styles.css` (las variables `--cm-*` que pongas siguen valiendo). */
  unstyled?: boolean;
  /**
   * Tema: un nombre (`"light"`, `"dark"`, `"minimal"`, `"contrast"`) o un objeto (`defineTheme`, `extendTheme`).
   * Se traduce a variables `--cm-*` en línea en `.cm-root` (`themeToCssVars`), así que ganan a las que pongas en
   * el CSS; para tocar una a mano, usa `style`.
   */
  theme?: ThemeName | ChoroplethTheme;
  /** Una clase tuya por pieza, SUMADA a la `cm-*` (Tailwind, CSS Modules). */
  classNames?: ChoroplethClassNames;
};

const RootInner = <TDatum,>(
  {
    children,
    className,
    style,
    unstyled,
    theme,
    classNames,
    dimOthers = "selection",
    ...options
  }: RootProps<TDatum>,
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

  // Las variables del tema: se recalculan solo si cambia el tema (un nombre casi siempre; un objeto, su identidad).
  const themeVars = useMemo(() => themeToCssVars(resolveTheme(theme)), [theme]);
  const slots = useMemo(() => classNames ?? {}, [classNames]);

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    store.setState({
      pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      // El drill pide uno o dos toques según con qué se toque (la rueda de un lápiz cuenta como ratón).
      pointerType:
        event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "pen" : "mouse",
    });
  };

  return (
    <ChoroplethContext.Provider
      value={{
        choropleth: choropleth as UseChoroplethResult<unknown>,
        store,
        viewportRef,
        api,
        classNames: slots,
      }}
    >
      <div
        ref={containerRef}
        className={cx("cm-root", slots.root, className)}
        // `relative`: el tooltip y la leyenda se posicionan respecto a este contenedor.
        data-unstyled={unstyled ? "" : undefined}
        data-theme={theme === undefined ? undefined : isThemeName(theme) ? theme : "custom"}
        // Atributos en el contenedor + CSS: atenuar, mostrar carga… sin tocar las regiones.
        data-status={status}
        data-loading={dataLoading ? "" : undefined}
        data-dim={dimOthers}
        // La fase del drill en el contenedor + CSS: atenuar, «respirar» y revelar sin tocar las regiones.
        data-drill-phase={drillPhase === null || drillPhase === "idle" ? undefined : drillPhase}
        data-has-selection={selectedId === null ? undefined : ""}
        style={{ position: "relative", ...themeVars, ...style }}
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
