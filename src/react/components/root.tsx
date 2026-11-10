import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
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
  /** Does not apply the base styles of `styles.css` (the `--cm-*` variables you set still work). */
  unstyled?: boolean;
  /**
   * Theme: a name (`"light"`, `"dark"`, `"minimal"`, `"contrast"`) or an object (`defineTheme`, `extendTheme`).
   * It is translated into inline `--cm-*` variables on `.cm-root` (`themeToCssVars`), so they beat those you
   * put in the CSS; to override one by hand, use `style`.
   */
  theme?: ThemeName | ChoroplethTheme;
  /** Pattern over regions without data. It beats the theme's (`empty.pattern`); `"none"` removes it. */
  emptyPattern?: "none" | "hatch" | "dots";
  /** One class of yours per piece, ADDED to the `cm-*` one (Tailwind, CSS Modules). */
  classNames?: ChoroplethClassNames;
};

const RootInner = <TDatum,>(
  {
    children,
    className,
    style,
    unstyled,
    theme,
    emptyPattern,
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

  // `data-interacting` is written to the DOM, NOT as a prop: if it were `Root` state, starting and
  // ending each gesture would re-render the whole map (join, scale, legend). With the attribute the CSS
  // removes transitions and events from the regions and hides the tooltip without a single render.
  useEffect(() => {
    const sync = () => {
      containerRef.current?.toggleAttribute("data-interacting", store.getState().interacting);
    };
    sync();
    return store.subscribe(sync);
  }, [store, containerRef]);

  // The imperative handle (`ref` and `useChoroplethApi()`): a stable object that queries the store on each
  // call. Without zoom there is no camera to query: the view is always the fit, and it is registered here.
  const { width, height, invert } = choropleth;
  useEffect(() => {
    store.registerFallbackView(() =>
      toViewState({ transform: FIT_TRANSFORM, size: { width, height }, invert, level: ROOT_LEVEL }),
    );
    return () => store.registerFallbackView(null);
  }, [store, width, height, invert]);
  const api = useMemo(() => createHandle(store), [store]);
  useImperativeHandle(ref, () => api, [api]);

  // The theme variables: recomputed only if the theme changes (a name almost always; an object, its identity).
  const themeVars = useMemo(() => themeToCssVars(resolveTheme(theme)), [theme]);
  const slots = useMemo(() => classNames ?? {}, [classNames]);
  // Ids of the SVG definitions: unique per instance (two maps on a page do not overwrite each other's patterns).
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const defId = useCallback((name: string) => `cm${instance}-${name}`, [instance]);
  const pattern = emptyPattern ?? resolveTheme(theme)?.empty?.pattern;
  const resolvedPattern = pattern === "hatch" || pattern === "dots" ? pattern : null;

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    store.setState({
      pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      // The drill asks for one or two taps depending on what is touching (a pen's wheel counts as a mouse).
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
        defId,
        emptyPattern: resolvedPattern,
      }}
    >
      <div
        ref={containerRef}
        className={cx("cm-root", slots.root, className)}
        // `relative`: the tooltip and the legend are positioned relative to this container.
        data-unstyled={unstyled ? "" : undefined}
        data-theme={theme === undefined ? undefined : isThemeName(theme) ? theme : "custom"}
        // Attributes on the container + CSS: dim, show loading… without touching the regions.
        data-status={status}
        data-loading={dataLoading ? "" : undefined}
        data-dim={dimOthers}
        // The drill phase on the container + CSS: dim, "breathe" and reveal without touching the regions.
        data-drill-phase={drillPhase === null || drillPhase === "idle" ? undefined : drillPhase}
        data-has-selection={selectedId === null ? undefined : ""}
        style={{ position: "relative", ...themeVars, ...style }}
        // `pointerdown` as well as `move`: a tap does not move the pointer, and the tooltip needs a position.
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
 * Level 2: calls `useChoropleth` ONCE and distributes the result by Context to its children.
 * It is the measured container (`containerRef`) and the tooltip's position reference.
 *
 * `ref` gives the imperative handle (`zoomTo`, `zoomBy`, `resetView`, `getView`). `forwardRef` is used
 * (and not `ref` as a prop, which only exists in React 19) so that it also works in React 18.
 */
export const Root = forwardRef(RootInner) as <TDatum>(
  props: RootProps<TDatum> & { ref?: Ref<ChoroplethMapHandle> },
) => ReactElement | null;
