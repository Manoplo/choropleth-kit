import {
  forwardRef,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { resolveControls, resolveLabels, type ChoroplethTheme, type ThemeName } from "../core";
import type { ChoroplethClassNames } from "./class-names";
import { Breadcrumb } from "./components/breadcrumb";
import { GestureHint } from "./components/gesture-hint";
import { Legend } from "./components/legend";
import { Root } from "./components/root";
import type { ChoroplethMapHandle } from "./handle";
import { Svg } from "./components/svg";
import { ZoomControls } from "./components/zoom-controls";
import { Tooltip, type TooltipContext } from "./components/tooltip";
import type { UseChoroplethOptions } from "./use-choropleth";

export type LegendPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type LegendOptions = {
  title?: string;
  /** Corner of the map where it is overlaid. Defaults to `bottom-left`. */
  position?: LegendPosition;
  showCount?: boolean;
  /** `"swatches"` (default) or `"bar"`: a bar with one segment per class and the breaks underneath. */
  variant?: "swatches" | "bar";
  /** Hovering a class highlights its regions (default `true`). */
  interactive?: boolean;
};

export type ChoroplethMapProps<TDatum> = UseChoroplethOptions<TDatum> & {
  /** `false` hides the legend. */
  legend?: LegendOptions | false;
  /** Drill breadcrumbs (only with `drill`). `false` hides them; top-left by default. */
  breadcrumb?: { position?: LegendPosition } | false;
  /** Tooltip content. Without this: the region's name and formatted value. */
  renderTooltip?: (context: TooltipContext<TDatum>) => ReactNode;
  className?: string;
  style?: CSSProperties;
  unstyled?: boolean;
  /** `"light"` · `"dark"` · `"minimal"` · `"contrast"` or an object (`defineTheme`, `extendTheme`). */
  theme?: ThemeName | ChoroplethTheme;
  /** Pattern over regions without data (`"hatch"`, `"dots"`); it beats the theme's. */
  emptyPattern?: "none" | "hatch" | "dots";
  /** One class of yours per piece, ADDED to the `cm-*` one (Tailwind, CSS Modules). */
  classNames?: ChoroplethClassNames;
  ariaLabel?: string;
};

const CORNERS: Record<LegendPosition, CSSProperties> = {
  "top-left": { top: 12, left: 12 },
  "top-right": { top: 12, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "bottom-right": { bottom: 12, right: 12 },
};

/**
 * Level 1 (preset): 90 % of cases. It is EXACTLY `Root` + `Svg` + `Legend` + `Tooltip` (level 2) with
 * default values: there is no logic of its own, only composition. If you need another layout, copy
 * this component and change the pieces.
 */
const ChoroplethMapInner = <TDatum,>(
  {
    legend,
    breadcrumb,
    renderTooltip,
    className,
    style,
    unstyled,
    theme,
    emptyPattern,
    classNames,
    ariaLabel,
    ...options
  }: ChoroplethMapProps<TDatum>,
  ref: ForwardedRef<ChoroplethMapHandle>,
) => {
  const legendOptions = legend === false ? null : (legend ?? {});
  // Zoom buttons are opt-in: `zoom={{ controls: true }}`.
  const controls = resolveControls(options.zoom);

  return (
    <Root<TDatum>
      ref={ref}
      {...(options as UseChoroplethOptions<TDatum>)}
      // The legend also counts regions without data, unless the consumer has already decided the text.
      emptyLabel={options.emptyLabel ?? resolveLabels(options.labels).noData}
      className={className}
      style={style}
      unstyled={unstyled}
      theme={theme}
      emptyPattern={emptyPattern}
      classNames={classNames}
    >
      <Svg ariaLabel={ariaLabel} />
      {legendOptions !== null && (
        <div style={{ position: "absolute", ...CORNERS[legendOptions.position ?? "bottom-left"] }}>
          <Legend
            title={legendOptions.title}
            showCount={legendOptions.showCount}
            variant={legendOptions.variant}
            interactive={legendOptions.interactive}
          />
        </div>
      )}
      {options.drill !== undefined && breadcrumb !== false && (
        <Breadcrumb position={breadcrumb?.position ?? "top-left"} />
      )}
      {controls !== null && <ZoomControls position={controls.position} reset={controls.reset} />}
      <GestureHint />
      <Tooltip<TDatum>>{renderTooltip}</Tooltip>
    </Root>
  );
};

/**
 * Level 1 (preset). `ref` gives the imperative handle: `ref.current.zoomTo("ES")`.
 */
export const ChoroplethMap = forwardRef(ChoroplethMapInner) as <TDatum>(
  props: ChoroplethMapProps<TDatum> & { ref?: Ref<ChoroplethMapHandle> },
) => ReactElement | null;
