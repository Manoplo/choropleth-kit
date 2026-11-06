import { memo, type SyntheticEvent } from "react";
import { useChoroplethContext } from "../choropleth-context";

type RegionPathProps = { id: string; d: string; fill: string; drillable: boolean };

// Solo se re-renderiza si cambia su color o su ruta: ni el hover ni la selección lo tocan
// (eso lo pinta `Selection` encima). Todas las props son primitivos para que `memo` sirva.
// `fill` va en `style` (no como atributo) porque puede ser `var(--cm-empty-fill, …)`.
const RegionPath = memo(({ id, d, fill, drillable }: RegionPathProps) => (
  <path
    className="cm-region"
    data-region-id={id}
    data-drillable={drillable ? "" : undefined}
    d={d}
    style={{ fill }}
  />
));

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
  const { choropleth, store } = useChoroplethContext();
  const { regions, anonymousPaths, emptyFill, borders, clickable, hoverItem, clickItem } =
    choropleth;

  const known = new Set(regions.map((region) => region.id));
  const regionRef = (event: SyntheticEvent) => {
    const id = regionIdFrom(event);
    return id !== null && known.has(id) ? ({ kind: "region", id } as const) : null;
  };

  // Con GeoJSON no hay `borders` (mesh): el CSS dibuja el contorno de cada región.
  const outlined = borders === null;

  return (
    <g
      className="cm-regions"
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
        />
      ))}
    </g>
  );
};
