import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { Background } from "./background";
import { Borders } from "./borders";
import { Defs } from "./defs";
import { Patterns } from "./patterns";
import { Bubbles } from "./bubbles";
import { DrillLayers } from "./drill-layers";
import { FallbackPoints } from "./fallback-points";
import { Graticule } from "./graticule";
import { Labels } from "./labels";
import { Regions } from "./regions";
import { Selection } from "./selection";
import {
  zoomKeyAction,
  type BackgroundOptions,
  type GraticuleOptions,
  type PatternPresetId,
} from "../../core";
import { useZoom } from "../use-zoom";
import { Viewport } from "./viewport";

export type SvgProps = {
  /**
   * Map layers, bottom to top. By default, inside a `Viewport` (the camera): `Regions`, `Borders`,
   * `Bubbles`, `FallbackPoints`, `Selection` and `Labels` (the latter draws only with `regionLabels`). If you pass your own layers, wrap them in
   * `<Choropleth.Viewport>` so they move with the zoom.
   */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  /**
   * A static pattern behind the map (it does not zoom): `true` (dots), a preset id (`"grid"`) or options.
   * Only applies to the default layers; with your own `children`, add `<Choropleth.Background>`.
   */
  background?: boolean | PatternPresetId | "none" | BackgroundOptions;
  /**
   * Meridians and parallels: `true` (every 10°), a step in degrees (`15`) or options. Only applies to the default
   * layers; with your own `children`, add `<Choropleth.Graticule>` inside the `Viewport`.
   */
  graticule?: boolean | number | GraticuleOptions;
};

/**
 * The `<svg>`. It exists as its own piece because `Root` mixes SVG (regions, borders) and HTML
 * (legend, tooltip), and an HTML element cannot live inside an `<svg>`.
 * (It is the only difference from the documented example.)
 *
 * While the asynchronous geometry has not arrived, it draws a skeleton with the same proportion the
 * map will have: the page does not jump when it appears.
 */
export const Svg = ({ children, className, ariaLabel, background, graticule }: SvgProps) => {
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

  const backgroundProps: BackgroundOptions | null =
    background === undefined || background === false
      ? null
      : background === true
        ? {}
        : typeof background === "string"
          ? { pattern: background }
          : background;
  const graticuleProps: GraticuleOptions | null =
    graticule === undefined || graticule === false
      ? null
      : graticule === true
        ? {}
        : typeof graticule === "number"
          ? { step: graticule }
          : graticule;

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
          {backgroundProps !== null && <Background {...backgroundProps} />}
          <Viewport>
            {graticuleProps !== null && graticuleProps.above !== true && (
              <Graticule {...graticuleProps} />
            )}
            <DrillLayers role="context" />
            <Regions />
            <Patterns />
            <Borders />
            {graticuleProps?.above === true && <Graticule {...graticuleProps} />}
            <Bubbles />
            <FallbackPoints />
            <Selection />
            <Labels />
            <DrillLayers role="exiting" />
          </Viewport>
        </>
      )}
    </svg>
  );
};
