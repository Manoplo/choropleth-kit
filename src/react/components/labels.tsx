import { useMemo } from "react";
import { placeLabels, zoomBucket } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

/**
 * Region names (`regionLabels`). Draws inside the `Viewport`, so the anchors move with the map for free,
 * and keeps the text at a constant size on screen with CSS (`scale(1 / --cm-k)`, written per frame by
 * `use-zoom`): React is not involved while the camera moves.
 *
 * Which labels fit is decided against the CONFIRMED camera, i.e. when a gesture or a flight ends
 * (never per frame): lower-priority labels that collide are not drawn, and zooming in reveals them.
 * A halo (`--cm-label-halo`) keeps the text legible over any fill. They never capture the pointer and
 * are `aria-hidden`: regions already carry their name for assistive technology.
 */
export const Labels = () => {
  const { choropleth, store, classNames } = useChoroplethContext();
  const { regionLabels, width, height } = choropleth;
  const camera = useMapStore(store, (state) => state.camera);

  const visible = useMemo(
    () =>
      regionLabels === null
        ? []
        : placeLabels({
            candidates: regionLabels.candidates,
            camera,
            view: { width, height },
            fontSize: regionLabels.fontSize,
            padding: regionLabels.padding,
          }),
    [regionLabels, camera, width, height],
  );

  if (regionLabels === null || visible.length === 0) return null;

  const byId = new Map(regionLabels.candidates.map((candidate) => [candidate.id, candidate]));

  return (
    <g
      className={cx("cm-labels", classNames.labels)}
      data-zoom-bucket={zoomBucket(camera.k)}
      pointerEvents="none"
      aria-hidden="true"
    >
      {visible.map((id) => {
        const label = byId.get(id);
        if (label === undefined) return null;
        return (
          // The group is positioned with an attribute; the counter-scale lives on the `<text>` (CSS).
          <g key={id} transform={`translate(${label.x} ${label.y})`}>
            <text className={cx("cm-label", classNames.label)} data-label-id={id}>
              {label.text}
            </text>
          </g>
        );
      })}
    </g>
  );
};
