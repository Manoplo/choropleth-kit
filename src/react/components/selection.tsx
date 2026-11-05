import { useChoroplethContext } from "../choropleth-context";

/**
 * Resalta la región con hover y la seleccionada, ENCIMA de las fronteras: si se pintara su borde
 * en `Regions`, los vecinos (pintados después) lo taparían a medias. `pointerEvents: none` para
 * que esta capa no robe el ratón a las regiones de debajo.
 */
export const Selection = () => {
  const { choropleth } = useChoroplethContext();
  const { regions, hoveredId, selectedId } = choropleth;

  const layers = [
    { id: hoveredId, name: "hover" },
    // La seleccionada va la última: si coincide con el hover, gana el azul de selección.
    { id: selectedId, name: "selected" },
  ];

  return (
    <g className="cm-selection" pointerEvents="none">
      {layers.map(({ id, name }) => {
        const region = id === null ? undefined : regions.find((r) => r.id === id);
        if (region === undefined) return null;
        return <path key={name} data-selection={name} d={region.path} />;
      })}
    </g>
  );
};
