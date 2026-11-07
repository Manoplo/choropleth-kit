import { useSyncExternalStore } from "react";
import {
  FIT_TRANSFORM,
  type CameraOptions,
  type CameraTransform,
  type TransitionResult,
  type ViewState,
  type ZoomTarget,
} from "../core";
import type { ItemRef } from "./map-item";

/**
 * What the buttons, the keyboard and (step 26) the imperative handle can ask of the zoom. It is
 * registered by `use-zoom` when installing `d3-zoom`; each move returns a `Promise` that resolves when
 * done (`completed: false` if a user gesture interrupted it).
 */
export type ZoomApi = {
  /**
   * Flies to a region, some bounds or a center with zoom. `silent` (only with `duration: 0`) places the
   * camera without notifying `onViewChange`: it is what `focusId` and `initialView` do on first render.
   */
  zoomTo: (
    target: ZoomTarget,
    options?: CameraOptions & { silent?: boolean },
  ) => Promise<TransitionResult>;
  /**
   * Flies to an EXACT camera (without `constrain` or `k` limits): the drill-down needs to end exactly at
   * `R` (dd.md §11.2.4) so the projection change is invisible. `duration: 0` places the camera;
   * with `silent` it does not notify `onViewChange`.
   */
  flyTo: (
    camera: CameraTransform,
    options?: { duration?: number; silent?: boolean },
  ) => Promise<TransitionResult>;
  /** Multiplies the current zoom (×2 zooms in, ×0.5 zooms out) centered on the view. */
  zoomBy: (factor: number, options?: { duration?: number }) => Promise<TransitionResult>;
  /** Flight to the level's fit. `silent` (only with `duration: 0`) does not notify `onViewChange`. */
  resetView: (options?: { duration?: number; silent?: boolean }) => Promise<TransitionResult>;
  /** The current view (the real one, also mid-flight). */
  getView: () => ViewState;
};

/**
 * What the handle can ask of the drill (step 34). Registered by `useChoropleth` when the map has
 * `drill`; each navigation returns a `Promise` that resolves on returning to rest at the requested
 * route (`completed: false` if it was cancelled, failed, another navigation replaced it or the request was invalid).
 */
export type DrillApi = {
  drillDown: (id: string) => Promise<TransitionResult>;
  drillUp: (steps?: number) => Promise<TransitionResult>;
  drillTo: (path: readonly string[]) => Promise<TransitionResult>;
};

export type PointerPosition = { x: number; y: number };

/** The map's interaction state. It lives OUTSIDE React (dd.md §11.0, §12.1 and §14). */
export type MapState = {
  /** Item (region or point) under the cursor or with the first tap (touch). */
  hovered: ItemRef | null;
  /** Cursor position relative to the container; `null` if outside. */
  pointer: PointerPosition | null;
  /** Type of the last pointer that touched the map: decides whether the drill asks for one or two taps. */
  pointerType: "mouse" | "pen" | "touch";
  /** A zoom/pan gesture is in progress (mouse, touch or wheel). It does not include programmatic flights. */
  interacting: boolean;
  /**
   * "Confirmed" camera: the one from the last time a gesture ENDED. During the gesture `d3-zoom` writes
   * it straight to the DOM and this does not change (dd.md §11.0: nothing per frame in React).
   */
  camera: CameraTransform;
  /** Hint on how to zoom (Ctrl/⌘ + wheel, two fingers). It turns itself off. */
  gestureHint: "wheel" | "touch" | null;
};

export type MapStore = {
  subscribe: (listener: () => void) => () => void;
  getState: () => MapState;
  /** Merges a patch. It does not notify if no field changes (same reference / same value). */
  setState: (patch: Partial<MapState>) => void;
  /** Shows the gesture hint and removes it on its own after `GESTURE_HINT_MS`. Repeating it extends the hint. */
  showGestureHint: (kind: "wheel" | "touch") => void;
  /** Cancels the hint timer (on unmount). */
  dispose: () => void;
  /** `use-zoom` registers its API here on install and `null` on uninstall. */
  registerZoom: (api: ZoomApi | null) => void;
  /** The zoom API, or `null` if zoom is disabled or not yet installed. */
  getZoom: () => ZoomApi | null;
  /** `useChoropleth` registers the drill API here (`null` without `drill` or on unmount). */
  registerDrill: (api: DrillApi | null) => void;
  /** The drill API, or `null` if the map has no `drill`. */
  getDrill: () => DrillApi | null;
  /** `Root` registers how to compute the view when there is NO zoom (`zoom={false}`): always the fit. */
  registerFallbackView: (read: (() => ViewState) | null) => void;
  /** The fallback view, or `null` if not yet registered. */
  getFallbackView: () => ViewState | null;
};

/** How long the "Use Ctrl + scroll to zoom" hint lasts (dd.md §11.1.2). */
export const GESTURE_HINT_MS = 1500;

const INITIAL_STATE: MapState = {
  hovered: null,
  pointer: null,
  pointerType: "mouse",
  interacting: false,
  camera: FIT_TRANSFORM,
  gestureHint: null,
};

/**
 * Hover, pointer, confirmed camera, `interacting` and the gesture hint. (Keyboard focus arrives with
 * accessibility.)
 *
 * If this were `useState` in `Root`, every region change or every `mousemove` would re-render `Root`
 * and recompute join, scale, legend and bubbles. Here only whoever subscribes with
 * `useMapStore(store, selector)` re-renders, and only when its selector returns a different value.
 */
export const createMapStore = (): MapStore => {
  let state = INITIAL_STATE;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let zoomApi: ZoomApi | null = null;
  let drillApi: DrillApi | null = null;
  let fallbackView: (() => ViewState) | null = null;
  const listeners = new Set<() => void>();
  const store: MapStore = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    setState: (patch) => {
      const changed = (Object.keys(patch) as (keyof MapState)[]).some(
        (key) => !Object.is(state[key], patch[key]),
      );
      if (!changed) return;
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    showGestureHint: (kind) => {
      clearTimeout(hintTimer);
      store.setState({ gestureHint: kind });
      hintTimer = setTimeout(() => store.setState({ gestureHint: null }), GESTURE_HINT_MS);
    },
    dispose: () => clearTimeout(hintTimer),
    registerZoom: (api) => {
      zoomApi = api;
    },
    getZoom: () => zoomApi,
    registerDrill: (api) => {
      drillApi = api;
    },
    getDrill: () => drillApi,
    registerFallbackView: (read) => {
      fallbackView = read;
    },
    getFallbackView: () => fallbackView?.() ?? null,
  };
  return store;
};

/**
 * Reads a slice of the store. The selector must return a stable value (a primitive or the same
 * reference while it does not change): if it creates a new object on every call, React will
 * re-render in a loop.
 */
export const useMapStore = <T>(store: MapStore, selector: (state: MapState) => T): T =>
  useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(INITIAL_STATE),
  );
