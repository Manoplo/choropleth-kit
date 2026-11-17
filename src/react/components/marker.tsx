import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { Point } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

export type MarkerProps = {
  /** [lon, lat]. A coordinate the projection cannot place draws nothing. */
  coordinates: Point;
  /** Which point of the element sits on the coordinate: the tip of a pin (`"bottom"`, default) or its center. */
  anchor?: "bottom" | "center";
  /**
   * `false` (default): the element keeps its size at any zoom (it counter-scales the map). `true`: it
   * grows and shrinks with the map, as if it were drawn on it.
   */
  scaleWithMap?: boolean;
  /** Hide it when its coordinate leaves the map (default `true`). Inside `<Markers>`, the layer decides. */
  clip?: boolean;
  /** Accessible name. Without it the marker is decoration for assistive technology unless you add your own semantics. */
  label?: string;
  className?: string;
  /** Your content (pin, card). By default, a dot. */
  children?: ReactNode;
};

const LayerContext = createContext<{ clip: boolean } | null>(null);

const overlayStyle = (clip: boolean): CSSProperties => ({
  position: "absolute",
  inset: 0,
  overflow: clip ? "hidden" : "visible",
  // Only the markers themselves take the pointer; the map underneath keeps panning and zooming.
  pointerEvents: "none",
});

/**
 * One layer for several markers (a single clipping box). `<Marker>` alone wraps itself in one.
 * It is HTML, so it sits ABOVE the `<svg>`: use it inside `<Choropleth.Root>`, next to `<Choropleth.Svg>`.
 */
export const Markers = ({ children, clip = true }: { children?: ReactNode; clip?: boolean }) => {
  const { classNames } = useChoroplethContext();
  return (
    <LayerContext.Provider value={{ clip }}>
      <div className={cx("cm-markers", classNames.markers)} style={overlayStyle(clip)}>
        {children}
      </div>
    </LayerContext.Provider>
  );
};

/**
 * An HTML element (pin, card) anchored to a `[lon, lat]` that follows the map.
 *
 * **React does not move it.** `use-zoom` writes `--cm-k`, `--cm-x` and `--cm-y` on the root every frame
 * and the position below is a CSS `calc()` over them (canvas px → % of the map's width and height, so it
 * also survives the `<svg>` being scaled to its container). Panning and zooming therefore re-render
 * nothing, however many markers there are.
 */
export const Marker = ({
  coordinates,
  anchor = "bottom",
  scaleWithMap = false,
  clip = true,
  label,
  className,
  children,
}: MarkerProps) => {
  const { choropleth, classNames } = useChoroplethContext();
  const layer = useContext(LayerContext);
  const { project, width, height, status } = choropleth;

  const at = status === "ready" ? project(coordinates) : null;
  if (at === null) return null;

  const style: CSSProperties = {
    position: "absolute",
    // canvas px → screen: `x · k + tx`, as a share of the canvas so it follows the `<svg>`'s real size.
    left: `calc((${at[0]} * var(--cm-k, 1) + var(--cm-x, 0)) / ${width} * 100%)`,
    top: `calc((${at[1]} * var(--cm-k, 1) + var(--cm-y, 0)) / ${height} * 100%)`,
    transform: `translate(-50%, ${anchor === "bottom" ? "-100%" : "-50%"})${
      scaleWithMap ? " scale(var(--cm-k, 1))" : ""
    }`,
    transformOrigin: anchor === "bottom" ? "50% 100%" : "50% 50%",
    pointerEvents: "auto",
  };

  const element = (
    <div
      className={cx("cm-marker", classNames.marker, className)}
      data-anchor={anchor}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      style={style}
    >
      {children ?? <span className="cm-marker__dot" />}
    </div>
  );

  return layer === null ? (
    <div className={cx("cm-markers", classNames.markers)} style={overlayStyle(clip)}>
      {element}
    </div>
  ) : (
    element
  );
};

export type MarkerSpec = Omit<MarkerProps, "clip"> & { id: string };
