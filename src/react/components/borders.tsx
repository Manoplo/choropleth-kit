import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

/** Interior borders (a single path). Not drawn with GeoJSON: there each region carries its own stroke. */
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
