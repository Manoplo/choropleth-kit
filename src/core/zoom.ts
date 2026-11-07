import { boundsToTransform, projectBounds, type LonLatBounds, type Padding } from "./bounds";
import type { BubbleScaling, CameraTransform, Extent, Size, ViewState } from "./camera";
import type { Point } from "./variants";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type ZoomControlsOptions = {
  /** Corner of the map. Defaults to `"bottom-right"` (the legend goes bottom-left by default). */
  position?: Corner;
  /** Show the "reset view" button. Defaults to `true`. */
  reset?: boolean;
};

/**
 * Where to move the camera (dd.md §9.5): a region, some bounds or a center with zoom.
 *  - `string`: id of a region on the map. Its **main body** is framed (France without Guiana).
 *  - `{ bounds }`: [[lonW, latS], [lonE, latN]].
 *  - `{ center, zoom }`: `zoom` relative to the fit (1 = fit).
 */
export type ZoomTarget =
  string | { bounds: LonLatBounds } | { center: readonly [number, number]; zoom: number };

export type CameraOptions = {
  /** ms. Without this, the flight's natural duration (350–1200 ms). `0` = no animation. */
  duration?: number;
  /** Margin when framing (px). Defaults to that of `zoom.padding` (24). */
  padding?: number | Padding;
};

/**
 * Explicit framings per region, in lon/lat (dd.md §11.1.5, point 4). For Inditex, **the Canary Islands
 * are a business case, not a geometric detail**: Spain's default framing includes them, even though
 * the geometry's main body does not. It is merged with the consumer's `focusBounds`; with
 * `{ ES: null }` it returns to the geometric framing.
 */
export const DEFAULT_FOCUS_BOUNDS: Readonly<Record<string, LonLatBounds>> = {
  ES: [
    [-18.5, 27.5],
    [4.5, 44],
  ],
};

/** Result of an animated camera move: `completed` is `false` if something interrupted it. */
export type TransitionResult = { completed: boolean };

/**
 * Zoom and pan options (dd.md §11.1.1). Only the ones that already do something are here; `inertia`,
 * `padding` and `initialView` are added in steps 26-27 with their behavior (declaring them earlier
 * would promise what does not exist).
 */
export type ZoomOptions = {
  /** Minimum scale relative to the level's fit (1 = cannot zoom out further than the fit). Default 1. */
  min?: number;
  /** Maximum scale. Default 12. */
  max?: number;
  /**
   * What the wheel does over the map. Default `"always"`: with the mouse over it, the wheel zooms.
   *  - `"cooperative"`: only with Ctrl/⌘ + wheel (and touch with two fingers); the page keeps
   *    scrolling. Recommended for maps inside a long page or a dashboard.
   *  - `"never"`: the wheel does not zoom (dragging and pinching still work).
   *
   * ⚠️ With `"always"`, a map on a scrolling page "eats" the wheel when passed over
   * (_scroll-jacking_). dd.md §11.1.1 proposes `"cooperative"` as the default; `"always"` was chosen here.
   */
  wheel?: "cooperative" | "always" | "never";
  /** Two-finger pinch. Default `true`. (A trackpad pinch arrives as Ctrl + wheel.) */
  pinch?: boolean;
  /** Drag to pan. Default `true`. */
  pan?: boolean;
  /**
   * Double click / double tap = zoom ×2. `"auto"` (default): active unless the click has another
   * meaning (`onItemClick` or selection), so as not to do both at once.
   */
  doubleClick?: boolean | "auto";
  /** Margin when framing a region or some bounds, in px (dd.md §11.1.1). Default 24. */
  padding?: number | Padding;
  /**
   * Initial view: the camera is placed there **without animating** on first render. `focusId` takes
   * precedence over this. Useful for shareable URLs: `initialView: { center: [-3.7, 40.4], zoom: 4 }`.
   */
  initialView?: ZoomTarget;
  /**
   * Bubbles when zooming (dd.md §11.1.6): `"sqrt"` (default, they grow with √k), `"screen"` (constant
   * size on screen) or `"geo"` (they grow with the map).
   */
  bubbleScaling?: BubbleScaling;
  /** When a fast drag is released, the map keeps sliding and slows down (dd.md §11.1.4). Default `true`. */
  inertia?: boolean;
  /** `"contain"` (default): the content is not lost and is centered if it fits. `"free"`: no limits. */
  constrain?: "contain" | "free";
  /** Keyboard shortcuts with the map focused: `+`, `−` and `0`. Default `true`. */
  keyboard?: boolean;
  /**
   * `+` / `−` / `⟲` buttons. **Opt-in** (default `false`): `true` or `{ position, reset }`. The preset
   * draws them; with the compound, put `<Choropleth.ZoomControls>` wherever you like.
   */
  controls?: boolean | ZoomControlsOptions;
  /** At the END of each gesture (never per frame). With programmatic flights, at the end of the flight. */
  onViewChange?: (view: ViewState) => void;
};

export type ResolvedZoom = {
  min: number;
  max: number;
  wheel: "cooperative" | "always" | "never";
  pinch: boolean;
  pan: boolean;
  /** Already resolved: `"auto"` becomes `true`/`false` depending on whether the click has another meaning. */
  doubleClick: boolean;
  constrain: "contain" | "free";
  bubbleScaling: BubbleScaling;
  inertia: boolean;
  keyboard: boolean;
  padding: number | Padding;
  initialView: ZoomTarget | undefined;
};

export const DEFAULT_ZOOM_MIN = 1;
export const DEFAULT_ZOOM_MAX = 12;

/**
 * `zoom` (the prop) → full options, or `null` if zoom is disabled (`zoom={false}`).
 * `clickIsBusy`: the click already does something (`onItemClick`, selection), to resolve `doubleClick: "auto"`.
 */
export const resolveZoomOptions = (
  zoom: boolean | ZoomOptions | undefined,
  { clickIsBusy }: { clickIsBusy: boolean },
): ResolvedZoom | null => {
  if (zoom === false) return null;
  const options = zoom === true || zoom === undefined ? {} : zoom;
  const { min = DEFAULT_ZOOM_MIN, max = DEFAULT_ZOOM_MAX } = options;
  if (!(min > 0) || !Number.isFinite(max) || max < min) {
    throw new Error(
      `[choropleth] zoom: "min" must be > 0 and "max" must be finite and ≥ "min" (received: min = ${min}, max = ${max}).`,
    );
  }
  const { doubleClick = "auto" } = options;
  return {
    min,
    max,
    wheel: options.wheel ?? "always",
    pinch: options.pinch ?? true,
    pan: options.pan ?? true,
    doubleClick: doubleClick === "auto" ? !clickIsBusy : doubleClick,
    constrain: options.constrain ?? "contain",
    bubbleScaling: options.bubbleScaling ?? "sqrt",
    inertia: options.inertia ?? true,
    keyboard: options.keyboard ?? true,
    padding: options.padding ?? 24,
    initialView: options.initialView,
  };
};

/** `zoom.controls` → what to draw, or `null` if there are no controls (the default). */
export const resolveControls = (
  zoom: boolean | ZoomOptions | undefined,
): Required<ZoomControlsOptions> | null => {
  if (typeof zoom !== "object" || zoom.controls === undefined || zoom.controls === false) {
    return null;
  }
  const options = zoom.controls === true ? {} : zoom.controls;
  return { position: options.position ?? "bottom-right", reset: options.reset ?? true };
};

export type ZoomKeyAction = "in" | "out" | "reset";

/**
 * What a key does on the focused map: `+` zooms in, `−` zooms out, `0` returns to the fit.
 *
 * With Ctrl, ⌘ or Alt it is NOT interpreted: Ctrl/⌘ + `+`, `−`, `0` is the browser's page zoom, and
 * taking it from the user would be an accessibility failure.
 */
export const zoomKeyAction = (event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): ZoomKeyAction | null => {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return null;
  switch (event.key) {
    case "+":
    case "=": // the same key as `+` on a US keyboard, without Shift
      return "in";
    case "-":
    case "_":
      return "out";
    case "0":
      return "reset";
    default:
      return null;
  }
};

/** The minimum the filter needs from a DOM event (so it can be tested without a DOM). */
export type ZoomEventLike = {
  type: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  button?: number;
  touches?: { length: number };
};

export type ZoomFilterParams = Pick<ResolvedZoom, "wheel" | "pinch" | "pan" | "doubleClick"> & {
  /** Called when a gesture does NOT zoom but could be taught how (the Ctrl/⌘ + wheel hint). */
  onGestureHint?: (kind: "wheel" | "touch") => void;
};

/**
 * Which events trigger zoom (dd.md §11.1.2). Replaces d3-zoom's default filter, which is
 * `(!ctrlKey || type === "wheel") && !button`.
 *
 * Returning `false` does NOT call `preventDefault`: in `cooperative` the wheel without a modifier and
 * one-finger touch keep scrolling the page.
 */
export const createZoomFilter =
  ({ wheel, pinch, pan, doubleClick, onGestureHint }: ZoomFilterParams) =>
  (event: ZoomEventLike): boolean => {
    switch (event.type) {
      case "wheel": {
        if (wheel === "never") return false;
        if (wheel === "always" || event.ctrlKey === true || event.metaKey === true) return true;
        onGestureHint?.("wheel"); // does not zoom, but teaches how
        return false;
      }
      case "touchstart": {
        const multi = (event.touches?.length ?? 0) >= 2;
        if (multi) return pinch || pan; // two fingers: pinch and pan at once
        if (wheel === "cooperative") {
          onGestureHint?.("touch");
          return false; // one finger = page scroll
        }
        return pan;
      }
      case "dblclick":
        return doubleClick;
      case "mousedown":
        return pan && !event.button; // primary button only
      default:
        return !event.button;
    }
  };

export type ResolveZoomTargetParams = {
  target: ZoomTarget;
  size: Size;
  padding?: number | Padding;
  /** [minimum, maximum] of `k`. */
  scaleExtent: readonly [number, number];
  /** [lon, lat] → canvas pixels; `null` if it does not project. */
  project: (coordinates: Point) => Point | null;
  /** Pixel bounds of a region's main body, or `null` if it does not exist. */
  getRegionExtent: (id: string) => Extent | null;
  /** Framings per region (already merged with `DEFAULT_FOCUS_BOUNDS`). `null` = use the geometry. */
  focusBounds?: Readonly<Record<string, LonLatBounds | null | undefined>>;
};

const clamp = (value: number, [min, max]: readonly [number, number]): number =>
  Math.min(max, Math.max(min, value));

/**
 * `ZoomTarget` → camera (dd.md §9.5 and §11.1.5). Pure: the projection and geometry arrive as
 * functions. Returns `null` if it cannot be resolved (nonexistent region, point outside the globe).
 *
 * It does not apply `constrain`: whoever moves the camera takes care of that, because d3-zoom only
 * applies it to gestures, not to programmatic transitions.
 */
export const resolveZoomTarget = ({
  target,
  size,
  padding,
  scaleExtent,
  project,
  getRegionExtent,
  focusBounds,
}: ResolveZoomTargetParams): CameraTransform | null => {
  if (typeof target === "string") {
    const override = focusBounds?.[target];
    const extent = override ? projectBounds(override, project) : getRegionExtent(target);
    return extent === null
      ? null
      : boundsToTransform({ bounds: extent, size, padding, scaleExtent });
  }
  if ("bounds" in target) {
    const extent = projectBounds(target.bounds, project);
    return extent === null
      ? null
      : boundsToTransform({ bounds: extent, size, padding, scaleExtent });
  }
  const at = project([target.center[0], target.center[1]]);
  if (at === null || !Number.isFinite(target.zoom)) return null;
  const k = clamp(target.zoom, scaleExtent);
  return { k, x: size.width / 2 - k * at[0], y: size.height / 2 - k * at[1] };
};
