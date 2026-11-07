import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

/**
 * Highlights the hovered item and the selected region, ON TOP of the borders: if their outline were
 * painted in `Regions`, the neighbors (painted later) would half-cover it. `pointerEvents: none` so
 * this layer does not steal the mouse from what is underneath.
 *
 * A region is highlighted with a copy of its outline; a point, with a ring around its bubble.
 */
export const Selection = () => {
  const { choropleth, store, classNames } = useChoroplethContext();
  const { regions, bubbles, fallbackPoints, selectedId } = choropleth;
  const hovered = useMapStore(store, (s) => s.hovered);

  const hoveredRegion =
    hovered?.kind === "region" ? regions.find((r) => r.id === hovered.id) : undefined;
  const hoveredPoint =
    hovered?.kind === "point"
      ? (bubbles.find((b) => b.coordinates !== null && b.id === hovered.id) ??
        fallbackPoints.find((p) => p.id === hovered.id))
      : undefined;
  // The selected one goes last: if it coincides with the hover, the selection blue wins.
  const selectedRegion = selectedId === null ? undefined : regions.find((r) => r.id === selectedId);

  return (
    <g className={cx("cm-selection", classNames.selection)} pointerEvents="none">
      {/* The copies carry the region's color: with `dimOthers` the rest dims and they do not. */}
      {hoveredRegion !== undefined && (
        <path data-selection="hover" d={hoveredRegion.path} style={{ fill: hoveredRegion.fill }} />
      )}
      {hoveredPoint !== undefined && (
        <circle data-selection="hover" cx={hoveredPoint.x} cy={hoveredPoint.y} r={hoveredPoint.r} />
      )}
      {selectedRegion !== undefined && (
        <path
          data-selection="selected"
          d={selectedRegion.path}
          style={{ fill: selectedRegion.fill }}
        />
      )}
    </g>
  );
};
