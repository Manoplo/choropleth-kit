import type { CSSProperties, ReactNode } from "react";
import { Legend } from "./components/legend";
import { Root } from "./components/root";
import { Svg } from "./components/svg";
import { Tooltip, type TooltipContext } from "./components/tooltip";
import type { UseChoroplethOptions } from "./use-choropleth";

export type LegendPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type LegendOptions = {
  title?: string;
  /** Esquina del mapa donde se superpone. Por defecto `bottom-left`. */
  position?: LegendPosition;
  showCount?: boolean;
};

export type ChoroplethMapProps<TDatum> = UseChoroplethOptions<TDatum> & {
  /** `false` oculta la leyenda. */
  legend?: LegendOptions | false;
  /** Contenido del tooltip. Sin esto: nombre de la región y valor formateado. */
  renderTooltip?: (context: TooltipContext<TDatum>) => ReactNode;
  className?: string;
  style?: CSSProperties;
  unstyled?: boolean;
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
export const ChoroplethMap = <TDatum,>({
  legend,
  renderTooltip,
  className,
  style,
  unstyled,
  ariaLabel,
  ...options
}: ChoroplethMapProps<TDatum>) => {
  const legendOptions = legend === false ? null : (legend ?? {});

  return (
    <Root<TDatum>
      {...(options as UseChoroplethOptions<TDatum>)}
      // La leyenda cuenta también las regiones sin dato, salvo que el consumidor ya haya decidido el texto.
      emptyLabel={options.emptyLabel ?? "Sin dato"}
      className={className}
      style={style}
      unstyled={unstyled}
    >
      <Svg ariaLabel={ariaLabel} />
      {legendOptions !== null && (
        <div style={{ position: "absolute", ...CORNERS[legendOptions.position ?? "bottom-left"] }}>
          <Legend title={legendOptions.title} showCount={legendOptions.showCount} />
        </div>
      )}
      <Tooltip<TDatum>>{renderTooltip}</Tooltip>
    </Root>
  );
};
