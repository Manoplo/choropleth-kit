import type { ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";

/**
 * The camera: the `<g>` to which `d3-zoom` applies the zoom and pan `transform`.
 * Everything that must move with the map (regions, borders, bubbles, selection) goes inside.
 *
 * ⚠️ **React never writes this `<g>`'s `transform` attribute**; that is why no prop touches it. It is
 * written by `d3-zoom` every frame. If React wrote it, any render would overwrite d3's
 * internal state and the map would jump.
 */
export const Viewport = ({ children }: { children?: ReactNode }) => {
  const { viewportRef } = useChoroplethContext();
  return (
    <g ref={viewportRef} className="cm-viewport">
      {children}
    </g>
  );
};
