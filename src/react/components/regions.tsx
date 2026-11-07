import { memo, type CSSProperties, type SyntheticEvent } from "react";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

type RegionPathProps = {
  id: string;
  d: string;
  fill: string;
  drillable: boolean;
  /** Sin valor que pintar (sin fila de datos, o con valor nulo): `data-empty`, para estilarlas por CSS. */
  empty: boolean;
  /** Índice de clase de la leyenda, o `"empty"`: el CSS resalta una clase atenuando el resto, sin re-renderizar. */
  dataClass: string;
  /** Clases del consumidor (`classNames.region` + `getRegionStyle().className`). */
  className: string | undefined;
  /** De `getRegionStyle`; `undefined` = la del CSS (1). */
  opacity: number | undefined;
  /** Es la región hacia la que se baja (se atenúa el resto; si tarda, «respira»). */
  target: boolean;
  /** 0…1: retraso de su entrada en el revelado. */
  wave: number | undefined;
};

// Solo se re-renderiza si cambia su color o su ruta: ni el hover ni la selección lo tocan
// (eso lo pinta `Selection` encima). Todas las props son primitivos para que `memo` sirva.
// `fill` va en `style` (no como atributo) porque puede ser `var(--cm-empty-fill, …)`.
const RegionPath = memo(
  ({
    id,
    d,
    fill,
    drillable,
    empty,
    dataClass,
    className,
    opacity,
    target,
    wave,
  }: RegionPathProps) => (
    <path
      className={cx("cm-region", className)}
      data-region-id={id}
      data-empty={empty ? "" : undefined}
      data-class={dataClass}
      data-drillable={drillable ? "" : undefined}
      data-drill-target={target ? "" : undefined}
      d={d}
      style={
        {
          fill,
          ...(opacity === undefined ? undefined : { opacity }),
          ...(wave === undefined ? undefined : { "--cm-wave": wave }),
        } as CSSProperties
      }
    />
  ),
);

// Regiones sin id (Kosovo en world-atlas): se ven, pero no se pueden cruzar ni seleccionar.
const AnonymousPath = memo(({ d, fill }: { d: string; fill: string }) => (
  <path className="cm-region cm-region--anonymous" d={d} style={{ fill, cursor: "default" }} />
));

const regionIdFrom = (event: SyntheticEvent): string | null =>
  (event.target as Element).closest?.("[data-region-id]")?.getAttribute("data-region-id") ?? null;

/**
 * Las regiones coloreadas. UN listener por tipo de evento en el `<g>` (delegación, dd.md §14)
 * en vez de uno por `<path>`: con cientos de regiones es menos trabajo y no se recrean closures.
 * Pointer Events: el mismo código para ratón, lápiz y táctil.
 */
export const Regions = () => {
  const { choropleth, store, classNames } = useChoroplethContext();
  const {
    regions,
    anonymousPaths,
    emptyFill,
    borders,
    clickable,
    hoverItem,
    clickItem,
    drillFocusId,
  } = choropleth;

  const known = new Set(regions.map((region) => region.id));
  const regionRef = (event: SyntheticEvent) => {
    const id = regionIdFrom(event);
    return id !== null && known.has(id) ? ({ kind: "region", id } as const) : null;
  };

  // Con GeoJSON no hay `borders` (mesh): el CSS dibuja el contorno de cada región.
  const outlined = borders === null;

  return (
    <g
      className={cx("cm-regions", classNames.regions)}
      data-outlined={outlined ? "" : undefined}
      style={clickable ? { cursor: "pointer" } : undefined}
      onClick={(event) => {
        const ref = regionRef(event);
        if (ref !== null) clickItem(ref);
      }}
      onPointerOver={(event) => {
        const ref = regionRef(event);
        if (ref !== null) {
          hoverItem(ref);
        } else if (store.getState().hovered?.kind === "region") {
          // Cursor sobre el océano (dentro del <g> pero fuera de toda región). Si el hover es de
          // un punto, no es nuestro: lo gestionan las burbujas.
          hoverItem(null);
        }
      }}
      onPointerLeave={(event) => {
        // En táctil el navegador manda «leave» al levantar el dedo: no es salir del mapa.
        if (event.pointerType === "touch") return;
        if (store.getState().hovered?.kind === "region") hoverItem(null);
      }}
    >
      {anonymousPaths.map((d, index) => (
        <AnonymousPath key={`anonymous-${index}`} d={d} fill={emptyFill} />
      ))}
      {regions.map((region) => (
        <RegionPath
          key={region.id}
          id={region.id}
          d={region.path}
          fill={region.fill}
          drillable={region.drillable}
          empty={region.value === null}
          dataClass={region.classIndex === null ? "empty" : String(region.classIndex)}
          className={cx(classNames.region, region.className)}
          opacity={region.opacity}
          target={region.id === drillFocusId}
          wave={region.wave}
        />
      ))}
    </g>
  );
};
