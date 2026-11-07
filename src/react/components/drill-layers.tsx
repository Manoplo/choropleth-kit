import type { MouseEvent } from "react";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

/**
 * The drill layers that are NOT the active one (dd.md §11.2.5), inside the camera:
 *  - `context`: the levels above, in gray and with no datum color. Cartographic reason: the parent's
 *    scale and the child's differ; seeing both in color invites comparing what is not comparable. Their
 *    drillable regions can be clicked (lateral navigation).
 *  - `exiting`: the level that was just left, fading out.
 *
 * The paths are each level's CACHED ones, in the pixels of its projection; the `<g>`'s `transform` (the
 * affine map `R`, which is NOT the camera's) carries them to those of the active level: zero recomputation.
 *
 * `role="context"` goes BELOW the active regions and `role="exiting"` ABOVE (it fades over them).
 */
export const DrillLayers = ({ role }: { role: "context" | "exiting" }) => {
  const { choropleth, classNames } = useChoroplethContext();
  const { drillLayers, selectContextItem } = choropleth;
  const layers = drillLayers.filter((layer) => layer.role === role);
  if (layers.length === 0) return null;

  return (
    <>
      {layers.map((layer) => {
        const { k, x, y } = layer.transform;
        return (
          <g
            key={layer.key}
            className={cx("cm-layer", classNames.layer)}
            data-role={layer.role}
            data-depth={layer.depth}
            transform={`translate(${x},${y}) scale(${k})`}
            pointerEvents={layer.role === "exiting" ? "none" : undefined}
            onClick={
              layer.role === "context"
                ? (event: MouseEvent<SVGGElement>) => {
                    const id = (event.target as Element)
                      .closest?.("[data-context-id]")
                      ?.getAttribute("data-context-id");
                    const known = id == null ? undefined : layer.paths.find((p) => p.id === id);
                    if (known?.drillable === true && id != null) selectContextItem(layer.depth, id);
                  }
                : undefined
            }
          >
            {layer.paths.map((path, index) => (
              <path
                key={path.id ?? `anonymous-${index}`}
                className="cm-context-region"
                d={path.d}
                data-context-id={path.id}
                data-focus={path.focus ? "" : undefined}
                data-drillable={path.drillable ? "" : undefined}
                // When leaving it keeps its datum color (`exiting` only); the context gets it from the CSS, in gray.
                style={path.fill === undefined ? undefined : { fill: path.fill }}
              />
            ))}
          </g>
        );
      })}
    </>
  );
};
