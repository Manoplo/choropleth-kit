import type { ReactNode } from "react";
import type { RegionEvent } from "../use-choropleth";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

export type TooltipContext<TDatum> = RegionEvent<TDatum> & {
  /** Número, categoría (`categorical`) o `null` si no hay dato. */
  value: number | string | null;
  /** `value` formateado; cadena vacía si no hay valor. */
  formattedValue: string;
  /** Color con el que está pintada la región. */
  color: string;
};

export type TooltipProps<TDatum> = {
  className?: string;
  /** Contenido del tooltip. Por defecto: nombre de la región y valor formateado. */
  children?: (context: TooltipContext<TDatum>) => ReactNode;
};

const OFFSET = 12;

const DefaultContent = <TDatum,>({ feature, id, formattedValue }: TooltipContext<TDatum>) => {
  const name = (feature.properties as { name?: unknown } | null)?.name;
  return (
    <>
      <strong>{typeof name === "string" ? name : id}</strong>
      <div>{formattedValue === "" ? "Sin dato" : formattedValue}</div>
    </>
  );
};

/**
 * Tooltip HTML junto al cursor. La librería decide QUÉ (contexto tipado) y DÓNDE; tú, el aspecto.
 *
 * Se suscribe él solo al hover y al cursor (`useMapStore`): moverlo no re-renderiza `Root` ni
 * las regiones. Sin medir su tamaño, se voltea hacia el otro lado del cursor en la mitad derecha
 * / inferior del mapa para no salirse del contenedor.
 */
export const Tooltip = <TDatum,>({ className, children }: TooltipProps<TDatum>) => {
  const { choropleth, store } = useChoroplethContext<TDatum>();
  const point = useMapStore(store, (s) => s.pointer);
  const hoveredId = useMapStore(store, (s) => s.hoveredId);

  const region = choropleth.regions.find((r) => r.id === hoveredId);
  if (region === undefined || point === null) return null;

  const context: TooltipContext<TDatum> = {
    id: region.id,
    feature: region.feature,
    datum: region.datum,
    value: region.value,
    formattedValue: region.formattedValue,
    color: region.fill,
  };

  const flipX = point.x > choropleth.width / 2;
  const flipY = point.y > choropleth.height / 2;

  return (
    <div
      role="tooltip"
      className={[
        "cm-tooltip",
        // Solo el contenido por defecto lleva caja; si pasas `children`, el aspecto es tuyo.
        children === undefined && "cm-tooltip--default",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        position: "absolute",
        left: point.x + (flipX ? -OFFSET : OFFSET),
        top: point.y + (flipY ? -OFFSET : OFFSET),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
        pointerEvents: "none",
      }}
    >
      {children === undefined ? <DefaultContent {...context} /> : children(context)}
    </div>
  );
};
