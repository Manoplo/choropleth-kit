import { isPatternPresetId } from "../../core";
import { useChoroplethContext } from "../choropleth-context";
import { PatternTileDef } from "./pattern-tile";

const isBuiltIn = (name: string): boolean => name === "hatch" || name === "dots";

/**
 * Patterns, drawn ON TOP of each region's color (the datum still shows through underneath): those of
 * `getRegionStyle().pattern` and that of regions without data (`emptyPattern` or the theme's). It goes
 * between the regions and the borders. No events: it does not steal the mouse from what is underneath.
 *
 * A pattern name can be: `"hatch"` / `"dots"` (the built-ins of `<Choropleth.Defs>`), any preset of the
 * catalogue (`"diagonal-up"`, `"checkerboard"`… the tile is defined here, only for the ones in use), or the
 * name of your own `<pattern>` in `<Choropleth.Defs>` (`useDefId(name)`).
 */
export const Patterns = () => {
  const { choropleth, defId, emptyPattern } = useChoroplethContext();
  const marks = choropleth.regions.flatMap((region) => {
    const name =
      region.pattern ?? (emptyPattern !== null && region.value === null ? emptyPattern : undefined);
    return name === undefined || name === "none" ? [] : [{ id: region.id, d: region.path, name }];
  });
  if (marks.length === 0) return null;

  // Built-ins keep their ids; catalogue presets get their own, defined once each.
  const isPreset = (name: string): boolean => !isBuiltIn(name) && isPatternPresetId(name);
  const refOf = (name: string): string => (isPreset(name) ? defId(`preset-${name}`) : defId(name));
  const presets = [...new Set(marks.map((mark) => mark.name).filter(isPreset))];

  return (
    <>
      {presets.length > 0 && (
        <defs>
          {presets.map((name) => (
            <PatternTileDef key={name} id={defId(`preset-${name}`)} preset={name} />
          ))}
        </defs>
      )}
      <g className="cm-patterns" pointerEvents="none" aria-hidden="true">
        {marks.map(({ id, d, name }) => (
          <path key={id} d={d} fill={`url(#${refOf(name)})`} />
        ))}
      </g>
    </>
  );
};
