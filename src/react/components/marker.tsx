import {
  createContext,
  useContext,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  chooseTooltipSide,
  defaultMarkerAnchor,
  resolveMarkerPreset,
  type MarkerPulse,
  type MarkerShape,
  type Point,
} from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";
import { useMarkerLabelLayout } from "../use-marker-label-layout";

export type MarkerProps = {
  /** [lon, lat]. A coordinate the projection cannot place draws nothing. */
  coordinates: Point;
  /**
   * Which point of the element sits on the coordinate: the tip of a pin (`"bottom"`) or its center. Defaults to
   * `"bottom"` for a pin and for your own `children`, and to `"center"` for the other preset shapes.
   */
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
  /**
   * Preset look (used when you give no `children`; any of these options turns it on). A shape from the catalogue:
   * `"circle"` (default), `"triangle"`, `"square"`, `"diamond"` or `"pin"` (its tip sits on the coordinate).
   */
  shape?: MarkerShape;
  /** Preset: width of the shape in px (a pin is taller, in proportion). Defaults to 12. */
  size?: number;
  /** Preset: any CSS color. Defaults to `--cm-marker-fill`, then `--cm-bubble-fill`. */
  color?: string;
  /** Preset: outline color; `"none"` for no outline. Defaults to `--cm-marker-stroke`. */
  stroke?: string;
  /** Preset: outline width in px. Defaults to 1.5. */
  strokeWidth?: number;
  /**
   * Preset: a ripple around the marker. `"hover"` while the pointer is over it, `"always"` continuously. Defaults to
   * `"none"`. It does not run with `prefers-reduced-motion`.
   */
  pulse?: MarkerPulse;
  /** Preset: blur radius of the outer glow in px. `0` (default) is off. */
  glow?: number;
  /** Preset: draw `label` beside the marker (turns the preset on). Labels that collide, or that would be cut by the map's edge, are hidden. */
  showLabel?: boolean;
  /**
   * Preset: which side of the marker the label goes. Without it the side is automatic: `"right"` first, then left, top and
   * bottom, whichever does not collide. With it the label stays on that side and is hidden if it collides.
   */
  labelPosition?: "right" | "left" | "top" | "bottom";
  /** Preset: higher wins when two labels collide. Ties go to the first one in the layer. Defaults to 0. */
  labelPriority?: number;
  /**
   * A tooltip anchored to the marker, shown on hover and on keyboard focus (the marker becomes focusable). `true` shows
   * `label`; or give any content. It picks the side that fits inside the map (top first) and slides to stay in. It works
   * with the preset shapes and with your own `children`.
   */
  tooltip?: ReactNode;
  /** Your content (pin, card). By default, a dot (or the preset shape, if you set any preset option). */
  children?: ReactNode;
};

const isPreset = (props: MarkerProps): boolean =>
  props.shape !== undefined ||
  props.size !== undefined ||
  props.color !== undefined ||
  props.stroke !== undefined ||
  props.strokeWidth !== undefined ||
  props.pulse !== undefined ||
  props.glow !== undefined ||
  props.showLabel === true;

/**
 * The preset shape: a box of `size` px with one `<svg>` path in `currentColor`, and an optional ripple behind it.
 * The look (pulse animation, default colors) is in `styles.css`; only what depends on the props is inline.
 */
const PresetShape = ({
  shape,
  size,
  color,
  stroke,
  strokeWidth,
  pulse,
  glow,
  label,
  showLabel,
  labelPosition,
  labelPriority = 0,
}: Pick<
  MarkerProps,
  | "shape"
  | "size"
  | "color"
  | "stroke"
  | "strokeWidth"
  | "pulse"
  | "glow"
  | "label"
  | "showLabel"
  | "labelPosition"
  | "labelPriority"
>) => {
  const preset = resolveMarkerPreset({ shape, size, pulse, glow, strokeWidth });
  const outline = stroke ?? "var(--cm-marker-stroke, #ffffff)";
  return (
    <span
      className="cm-marker__shape"
      data-shape={preset.shape}
      data-pulse={preset.pulse === "none" ? undefined : preset.pulse}
      style={{
        width: preset.width,
        height: preset.height,
        color: color ?? "var(--cm-marker-fill, var(--cm-bubble-fill, #2563eb))",
      }}
    >
      {preset.pulse !== "none" && <span className="cm-marker__pulse" />}
      <svg
        viewBox={preset.viewBox}
        width="100%"
        height="100%"
        style={{
          display: "block",
          overflow: "visible",
          filter: preset.glow > 0 ? `drop-shadow(0 0 ${preset.glow}px currentColor)` : undefined,
        }}
        aria-hidden="true"
      >
        <path
          d={preset.d}
          fillRule="evenodd"
          fill="currentColor"
          stroke={outline === "none" ? undefined : outline}
          strokeWidth={outline === "none" ? undefined : preset.strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {showLabel === true && label !== undefined && label !== "" && (
        // Decoration for assistive technology: the marker already carries the name (`aria-label`).
        <span
          className="cm-marker__label"
          data-position={labelPosition ?? "right"}
          data-preferred={labelPosition ?? "right"}
          data-auto={labelPosition === undefined ? "" : undefined}
          data-priority={labelPriority}
          aria-hidden="true"
        >
          {label}
        </span>
      )}
    </span>
  );
};

/** Is there something to show? `true` stands for the label, so it counts only if there is one. */
const tooltipContent = (tooltip: ReactNode, label: string | undefined): ReactNode =>
  tooltip === true ? label : tooltip;

const hasContent = (content: ReactNode): boolean =>
  content !== undefined && content !== null && content !== false && content !== "";

/**
 * Picks the side of the tooltip that fits inside the markers' layer and slides it to stay in. It measures the real
 * elements, so it runs when the tooltip is about to show (hover or focus), and does nothing where there is no layout
 * (jsdom). It writes an attribute and a CSS variable: no render.
 */
const placeTooltip = (root: HTMLElement): void => {
  const tip = root.querySelector<HTMLElement>(":scope > .cm-marker__tooltip");
  const layer = root.closest<HTMLElement>(".cm-markers");
  if (tip === null || layer === null) return;
  const anchor = root.getBoundingClientRect();
  const area = layer.getBoundingClientRect();
  const size = tip.getBoundingClientRect();
  if (area.width <= 0 || area.height <= 0 || size.width <= 0) return;
  const { side, shift } = chooseTooltipSide({
    anchor: { x0: anchor.left, y0: anchor.top, x1: anchor.right, y1: anchor.bottom },
    tooltip: { width: size.width, height: size.height },
    bounds: { x0: area.left, y0: area.top, x1: area.right, y1: area.bottom },
  });
  tip.setAttribute("data-side", side);
  tip.style.setProperty("--cm-tip-shift", `${shift}px`);
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
  const { classNames, store } = useChoroplethContext();
  const layerRef = useRef<HTMLDivElement | null>(null);
  // The layer re-renders when the CONFIRMED camera changes (a gesture or flight ends), never per frame: that is
  // when label collisions are resolved again.
  useMapStore(store, (state) => state.camera);
  useMarkerLabelLayout(layerRef);
  return (
    <LayerContext.Provider value={{ clip }}>
      <div
        ref={layerRef}
        className={cx("cm-markers", classNames.markers)}
        style={overlayStyle(clip)}
      >
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
export const Marker = (props: MarkerProps) => {
  const { coordinates, scaleWithMap = false, clip = true, label, className, children } = props;
  const tipId = useId();
  const tip = tooltipContent(props.tooltip, label);
  const hasTip = hasContent(tip);
  const preset = children === undefined && isPreset(props);
  // A pin has its tip on the coordinate and the other shapes are centered; your own content keeps `"bottom"`.
  const anchor = props.anchor ?? (preset ? defaultMarkerAnchor(props.shape ?? "circle") : "bottom");
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
      // With a tooltip the marker is reachable by keyboard, and the tooltip describes it.
      tabIndex={hasTip ? 0 : undefined}
      aria-describedby={hasTip ? tipId : undefined}
      onPointerEnter={hasTip ? (event) => placeTooltip(event.currentTarget) : undefined}
      onFocus={hasTip ? (event) => placeTooltip(event.currentTarget) : undefined}
      style={style}
    >
      {children ?? (preset ? <PresetShape {...props} /> : <span className="cm-marker__dot" />)}
      {hasTip && (
        <div
          id={tipId}
          role="tooltip"
          className="cm-marker__tooltip cm-tooltip--default"
          data-side="top"
        >
          {tip}
        </div>
      )}
    </div>
  );

  return layer === null ? <Markers clip={clip}>{element}</Markers> : element;
};

export type MarkerSpec = Omit<MarkerProps, "clip"> & { id: string };
