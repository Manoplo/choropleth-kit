import { useChoroplethContext } from "../choropleth-context";

/**
 * Patterns, drawn ON TOP of each region's color (the datum still shows through underneath): those of
 * `getRegionStyle().pattern` and that of regions without data (`emptyPattern` or the theme's). It goes
 * between the regions and the borders. No events: it does not steal the mouse from what is underneath.
 * It needs `<Choropleth.Defs>`.
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
          // Your own pattern is defined inside `<Choropleth.Defs>` with `useDefId(name)`: same prefix.
          fill={`url(#${defId(name)})`}
        />
      ))}
    </g>
  );
};
