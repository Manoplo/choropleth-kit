import type { ReactNode } from "react";
import type { ItemContext } from "../map-item";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

/** Lo que recibe el tooltip: el `MapItem` (región o punto) + valor, color y nombre. */
export type TooltipContext<TDatum> = ItemContext<TDatum>;

export type TooltipProps<TDatum> = {
  className?: string;
  /** Contenido del tooltip. Por defecto: nombre de la región y valor formateado. */
  children?: (context: TooltipContext<TDatum>) => ReactNode;
};

const OFFSET = 12;

const DefaultContent = <TDatum,>({
  label,
  formattedValue,
  drillable,
  noData,
  drillHint,
}: TooltipContext<TDatum> & { noData: string; drillHint: string }) => {
  return (
    <>
      <strong>{label}</strong>
      <div>{formattedValue === "" ? noData : formattedValue}</div>
      {/* Solo se promete lo que es verdad: el pie aparece únicamente si se puede bajar desde aquí. */}
      {drillable && <div className="cm-tooltip__hint">{drillHint}</div>}
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
  const { choropleth, store, classNames } = useChoroplethContext<TDatum>();
  const point = useMapStore(store, (s) => s.pointer);
  const hovered = useMapStore(store, (s) => s.hovered);
  const touch = useMapStore(store, (s) => s.pointerType === "touch");

  const context = hovered === null ? undefined : choropleth.getItemContext(hovered);
  if (context === undefined || point === null) return null;

  const flipX = point.x > choropleth.width / 2;
  const flipY = point.y > choropleth.height / 2;

  return (
    <div
      role="tooltip"
      className={cx(
        "cm-tooltip",
        // Solo el contenido por defecto lleva caja; si pasas `children`, el aspecto es tuyo.
        children === undefined && "cm-tooltip--default",
        classNames.tooltip,
        className,
      )}
      style={{
        position: "absolute",
        left: point.x + (flipX ? -OFFSET : OFFSET),
        top: point.y + (flipY ? -OFFSET : OFFSET),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
        pointerEvents: "none",
      }}
    >
      {children === undefined ? (
        <DefaultContent
          {...context}
          noData={choropleth.labels.noData}
          // Con el dedo no hay clic: el primer toque enseña esto y el segundo baja.
          drillHint={touch ? choropleth.labels.tapAgainHint : choropleth.labels.drillHint}
        />
      ) : (
        children(context)
      )}
    </div>
  );
};
