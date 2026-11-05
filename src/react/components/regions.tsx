import { memo, type SyntheticEvent } from "react";
import { useChoroplethContext } from "../choropleth-context";

type RegionPathProps = { id: string; d: string; fill: string };

// Solo se re-renderiza si cambia su color o su ruta: ni el hover ni la selección lo tocan
// (eso lo pinta `Selection` encima). Todas las props son primitivos para que `memo` sirva.
// `fill` va en `style` (no como atributo) porque puede ser `var(--cm-empty-fill, …)`.
const RegionPath = memo(({ id, d, fill }: RegionPathProps) => (
  <path className="cm-region" data-region-id={id} d={d} style={{ fill }} />
));

const regionIdFrom = (event: SyntheticEvent): string | null =>
  (event.target as Element).closest?.("[data-region-id]")?.getAttribute("data-region-id") ?? null;

/**
 * Las regiones coloreadas. UN listener por tipo de evento en el `<g>` (delegación, dd.md §14)
 * en vez de uno por `<path>`: con cientos de regiones es menos trabajo y no se recrean closures.
 */
export const Regions = () => {
  const { choropleth, store } = useChoroplethContext();
  const { regions, borders, clickable, getRegionProps } = choropleth;
  // El hover se lee del store SIN suscribirse: `Regions` no debe re-renderizarse al cambiar de región.
  const hoveredId = () => store.getState().hoveredId;

  const byId = new Map(regions.map((region) => [region.id, region]));

  // Con GeoJSON no hay `borders` (mesh): el CSS dibuja el contorno de cada región.
  const outlined = borders === null;

  return (
    <g
      className="cm-regions"
      data-outlined={outlined ? "" : undefined}
      style={clickable ? { cursor: "pointer" } : undefined}
      onClick={(event) => {
        const region = byId.get(regionIdFrom(event) ?? "");
        if (region !== undefined) getRegionProps(region).onClick(event);
      }}
      onMouseOver={(event) => {
        const id = regionIdFrom(event);
        const region = id === null ? undefined : byId.get(id);
        if (region !== undefined) {
          if (region.id !== hoveredId()) getRegionProps(region).onMouseEnter(event);
        } else if (hoveredId() !== null) {
          // Cursor sobre el océano (dentro del <g> pero fuera de toda región).
          const previous = byId.get(hoveredId() ?? "");
          if (previous !== undefined) getRegionProps(previous).onMouseLeave(event);
        }
      }}
      onMouseLeave={(event) => {
        const previous = byId.get(hoveredId() ?? "");
        if (previous !== undefined) getRegionProps(previous).onMouseLeave(event);
      }}
    >
      {regions.map((region) => (
        <RegionPath key={region.id} id={region.id} d={region.path} fill={region.fill} />
      ))}
    </g>
  );
};
