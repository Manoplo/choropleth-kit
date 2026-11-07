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
  /** Esquina del mapa donde se superpone. Por defecto `bottom-left`. */
  position?: LegendPosition;
  showCount?: boolean;
  /** `"swatches"` (por defecto) o `"bar"`: una barra con un tramo por clase y los cortes debajo. */
  variant?: "swatches" | "bar";
  /** Pasar el ratón por una clase resalta sus regiones (por defecto `true`). */
  interactive?: boolean;
};

export type ChoroplethMapProps<TDatum> = UseChoroplethOptions<TDatum> & {
  /** `false` oculta la leyenda. */
  legend?: LegendOptions | false;
  /** Migas del drill (solo con `drill`). `false` las oculta; por defecto arriba a la izquierda. */
  breadcrumb?: { position?: LegendPosition } | false;
  /** Contenido del tooltip. Sin esto: nombre de la región y valor formateado. */
  renderTooltip?: (context: TooltipContext<TDatum>) => ReactNode;
  className?: string;
  style?: CSSProperties;
  unstyled?: boolean;
  /** `"light"` · `"dark"` · `"minimal"` · `"contrast"` o un objeto (`defineTheme`, `extendTheme`). */
  theme?: ThemeName | ChoroplethTheme;
  /** Trama sobre las regiones sin dato (`"hatch"`, `"dots"`); gana a la del tema. */
  emptyPattern?: "none" | "hatch" | "dots";
  /** Una clase tuya por pieza, SUMADA a la `cm-*` (Tailwind, CSS Modules). */
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
 * Nivel 1 (preset): el 90 % de los casos. Es EXACTAMENTE `Root` + `Svg` + `Legend` + `Tooltip`
 * (nivel 2) con valores por defecto: no hay lógica propia, solo composición. Si necesitas otra
 * disposición, copia este componente y cambia las piezas.
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
  // Los botones de zoom son opt-in: `zoom={{ controls: true }}`.
  const controls = resolveControls(options.zoom);

  return (
    <Root<TDatum>
      ref={ref}
      {...(options as UseChoroplethOptions<TDatum>)}
      // La leyenda cuenta también las regiones sin dato, salvo que el consumidor ya haya decidido el texto.
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
 * Nivel 1 (preset). `ref` da el handle imperativo: `ref.current.zoomTo("ES")`.
 */
export const ChoroplethMap = forwardRef(ChoroplethMapInner) as <TDatum>(
  props: ChoroplethMapProps<TDatum> & { ref?: Ref<ChoroplethMapHandle> },
) => ReactElement | null;
