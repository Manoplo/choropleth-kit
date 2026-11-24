import { useMemo } from "react";
import { graticuleGeometry, resolveGraticule, type GraticuleOptions } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

/**
 * The grid of meridians and parallels (optionally the outline of the projected world). It draws inside the
 * `Viewport`, so it moves with the camera, and keeps a constant stroke width when zooming. It takes no
 * pointer events. By default it goes UNDER the regions (visible over the ocean); `above` draws it over them
 * (with the default layers, `Svg` places it; with your own children, place this component yourself).
 *
 * Style it with `--cm-graticule-color` / `--cm-graticule-width`, or the `stroke` / `strokeWidth` props.
 */
export const Graticule = (props: GraticuleOptions) => {
  const { choropleth, classNames } = useChoroplethContext();
  const { toPath } = choropleth;
  const { step, outline, stroke, strokeWidth } = resolveGraticule(props) ?? {
    step: [10, 10] as [number, number],
    outline: false,
    stroke: undefined,
    strokeWidth: undefined,
  };
  const [stepX, stepY] = step;

  const grid = useMemo(() => toPath(graticuleGeometry([stepX, stepY])), [toPath, stepX, stepY]);
  const sphere = useMemo(() => (outline ? toPath({ type: "Sphere" }) : null), [toPath, outline]);
  if (grid === null && sphere === null) return null;

  const style = { stroke, strokeWidth };
  return (
    <g className={cx("cm-graticule", classNames.graticule)} pointerEvents="none" aria-hidden="true">
      {grid !== null && <path className="cm-graticule-lines" d={grid} style={style} />}
      {sphere !== null && <path className="cm-graticule-outline" d={sphere} style={style} />}
    </g>
  );
};
