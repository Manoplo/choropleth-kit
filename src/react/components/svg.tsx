import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { Borders } from "./borders";
import { Defs } from "./defs";
import { Patterns } from "./patterns";
import { Bubbles } from "./bubbles";
import { DrillLayers } from "./drill-layers";
import { FallbackPoints } from "./fallback-points";
import { Regions } from "./regions";
import { Selection } from "./selection";
import { zoomKeyAction } from "../../core";
import { useZoom } from "../use-zoom";
import { Viewport } from "./viewport";

export type SvgProps = {
  /**
   * Map layers, bottom to top. By default, inside a `Viewport` (the camera): `Regions`, `Borders`,
   * `Bubbles`, `FallbackPoints` and `Selection`. If you pass your own layers, wrap them in
   * `<Choropleth.Viewport>` so they move with the zoom.
   */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
};

/**
 * The `<svg>`. It exists as its own piece because `Root` mixes SVG (regions, borders) and HTML
 * (legend, tooltip), and an HTML element cannot live inside an `<svg>`.
 * (dd.md §9.3 does not name it: it is the only difference from its example.)
 *
 * While the asynchronous geometry has not arrived, it draws a skeleton with the same proportion the
 * map will have: the page does not jump when it appears.
 */
export const Svg = ({ children, className, ariaLabel }: SvgProps) => {
  const { choropleth, store, viewportRef, classNames } = useChoroplethContext();
  const {
    width,
    height,
    status,
    labels,
    zoom,
    invert,
    project,
    onViewChange,
    resolveCamera,
    focusId,
    containerRef,
  } = choropleth;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Before the early `return`s (hooks cannot be conditional): while loading there is no `<svg>`, and
  // `ready` re-hooks the zoom when it appears.
  useZoom({
    svgRef,
    viewportRef,
    rootRef: containerRef,
    store,
    width,
    height,
    options: zoom,
    invert,
    project,
    onViewChange,
    resolveCamera,
    focusId,
    ready: status === "ready",
  });

  if (status === "loading") {
    return <div className="cm-skeleton" style={{ aspectRatio: `${width} / ${height}` }} />;
  }
  if (status === "error") {
    return (
      <div className="cm-error" role="alert" style={{ aspectRatio: `${width} / ${height}` }}>
        {labels.geographyError}
      </div>
    );
  }

  // Keyboard shortcuts with the map focused. `tabIndex` only if there are shortcuts: an empty tab stop is not added.
  // The drill's keyboard (Escape / Backspace go up) is independent of the zoom's.
  const { drillNav } = choropleth;
  const keyboard = (zoom !== null && zoom.keyboard) || drillNav !== null;
  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (
      drillNav?.canDrillUp === true &&
      (event.key === "Escape" || event.key === "Backspace") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      drillNav.drillUp();
      return;
    }
    if (zoom === null || !zoom.keyboard) return;
    const action = zoomKeyAction(event);
    if (action === null) return;
    event.preventDefault();
    const api = store.getZoom();
    if (action === "reset") void api?.resetView();
    else void api?.zoomBy(action === "in" ? 2 : 0.5);
  };

  return (
    <svg
      ref={svgRef}
      tabIndex={keyboard ? 0 : undefined}
      onKeyDown={keyboard ? handleKeyDown : undefined}
      className={cx("cm-svg", classNames.svg, className)}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {children ?? (
        <>
          <Defs />
          <Viewport>
            <DrillLayers role="context" />
            <Regions />
            <Patterns />
            <Borders />
            <Bubbles />
            <FallbackPoints />
            <Selection />
            <DrillLayers role="exiting" />
          </Viewport>
        </>
      )}
    </svg>
  );
};
