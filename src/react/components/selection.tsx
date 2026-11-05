import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

/**
 * Resalta el item con hover y la región seleccionada, ENCIMA de las fronteras: si se pintara su
 * borde en `Regions`, los vecinos (pintados después) lo taparían a medias. `pointerEvents: none`
 * para que esta capa no robe el ratón a lo que tiene debajo.
 *
 * Una región se resalta con una copia de su contorno; un punto, con un anillo sobre su burbuja.
 */
export const Selection = () => {
  const { choropleth, store } = useChoroplethContext();
  const { regions, bubbles, selectedId } = choropleth;
  const hovered = useMapStore(store, (s) => s.hovered);

  const hoveredRegion =
    hovered?.kind === "region" ? regions.find((r) => r.id === hovered.id) : undefined;
  const hoveredPoint =
    hovered?.kind === "point"
      ? bubbles.find((b) => b.coordinates !== null && b.id === hovered.id)
      : undefined;
  // La seleccionada va la última: si coincide con el hover, gana el azul de selección.
  const selectedRegion = selectedId === null ? undefined : regions.find((r) => r.id === selectedId);

  return (
    <g className="cm-selection" pointerEvents="none">
      {hoveredRegion !== undefined && <path data-selection="hover" d={hoveredRegion.path} />}
      {hoveredPoint !== undefined && (
        <circle data-selection="hover" cx={hoveredPoint.x} cy={hoveredPoint.y} r={hoveredPoint.r} />
      )}
      {selectedRegion !== undefined && <path data-selection="selected" d={selectedRegion.path} />}
    </g>
  );
};
