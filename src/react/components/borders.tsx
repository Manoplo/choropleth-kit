import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

/** Fronteras interiores (una sola ruta). No se pinta con GeoJSON: ahí cada región lleva su trazo. */
export const Borders = () => {
  const { choropleth, classNames } = useChoroplethContext();
  if (choropleth.borders === null) return null;

  return (
    <path
      className={cx("cm-borders", classNames.borders)}
      d={choropleth.borders}
      pointerEvents="none"
    />
  );
};
