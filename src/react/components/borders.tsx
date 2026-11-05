import { useChoroplethContext } from "../choropleth-context";

/** Fronteras interiores (una sola ruta). No se pinta con GeoJSON: ahí cada región lleva su trazo. */
export const Borders = () => {
  const { choropleth } = useChoroplethContext();
  if (choropleth.borders === null) return null;

  return <path className="cm-borders" d={choropleth.borders} pointerEvents="none" />;
};
