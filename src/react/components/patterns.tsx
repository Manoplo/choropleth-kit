import { useChoroplethContext } from "../choropleth-context";

/**
 * Las tramas, dibujadas ENCIMA del color de cada región (el dato sigue viéndose debajo): las de
 * `getRegionStyle().pattern` y la de las regiones sin dato (`emptyPattern` o la del tema). Va entre las regiones
 * y las fronteras. Sin eventos: no roba el ratón a lo que tiene debajo. Necesita `<Choropleth.Defs>`.
 */
export const Patterns = () => {
  const { choropleth, defId, emptyPattern } = useChoroplethContext();
  const marks = choropleth.regions.flatMap((region) => {
    const name =
      region.pattern ?? (emptyPattern !== null && region.value === null ? emptyPattern : undefined);
    return name === undefined ? [] : [{ id: region.id, d: region.path, name }];
  });
  if (marks.length === 0) return null;

  return (
    <g className="cm-patterns" pointerEvents="none" aria-hidden="true">
      {marks.map(({ id, d, name }) => (
        <path
          key={id}
          d={d}
          // Una trama tuya se define dentro de `<Choropleth.Defs>` con `useDefId(name)`: mismo prefijo.
          fill={`url(#${defId(name)})`}
        />
      ))}
    </g>
  );
};
