import type { CameraOptions, TransitionResult, ViewState, ZoomTarget } from "../core";
import { isProduction } from "./env";
import type { MapStore } from "./map-store";

/**
 * The imperative handle: what you get with `ref` on `<ChoroplethMap>` / `<Choropleth.Root>`
 * and with `useChoroplethApi()` inside the compound. **Everything animated returns a `Promise`** that
 * resolves when done, or when interrupted (`completed: false`); that way flights can be chained
 * without timers: `await map.zoomTo("ES"); await map.zoomTo("FR");`.
 *
 * `drillDown`, `drillUp` and `drillTo` (step 34) navigate the `drill` levels; they resolve on returning
 * to rest at the requested route. (`toSVGString` and `toPNG` are planned and arrive with export.)
 */
export type ChoroplethMapHandle = {
  /** Flies to a region (id), some `{ bounds }` or a center with zoom `{ center, zoom }`. */
  zoomTo: (target: ZoomTarget, options?: CameraOptions) => Promise<TransitionResult>;
  /** Multiplies the current zoom (2 = zoom in to double, 0.5 = zoom out to half), centered on the view. */
  zoomBy: (factor: number, options?: Pick<CameraOptions, "duration">) => Promise<TransitionResult>;
  /** Flight to the level's fit. */
  resetView: (options?: Pick<CameraOptions, "duration">) => Promise<TransitionResult>;
  /** The current view (also mid-flight). */
  getView: () => ViewState;
  /**
   * Goes down to child `id` of what is being requested (not of what is shown: chaining `await` is safe).
   * Resolves `completed: true` when the choreography ends at that route; `false` if something cut it
   * short (a gesture, another navigation, a load error) or if the request was not valid (nonexistent id,
   * `canDrill: false`, a map without `drill`): in those cases it also warns on the console outside production.
   */
  drillDown: (id: string) => Promise<TransitionResult>;
  /** Goes up `steps` levels (1 by default; more = to the root). At the root it resolves `completed: true` and does nothing. */
  drillUp: (steps?: number) => Promise<TransitionResult>;
  /** Goes to any route (lateral, jump, the URL): `["ES", "ES-MD"]`; `[]` = the root. */
  drillTo: (path: readonly string[]) => Promise<TransitionResult>;
};

/** Only before the map has rendered for the first time. */
const EMPTY_VIEW: ViewState = {
  k: 1,
  x: 0,
  y: 0,
  zoom: 1,
  center: [0, 0],
  bounds: [
    [-180, -90],
    [180, 90],
  ],
  level: { id: "root", depth: 0 },
};

const NOT_AVAILABLE: Promise<TransitionResult> = Promise.resolve({ completed: false });

const noDrill = (method: string): Promise<TransitionResult> => {
  if (!isProduction()) {
    console.warn(`[choropleth] ${method}() needs the \`drill\` prop; this map has none.`);
  }
  return NOT_AVAILABLE;
};

/**
 * Handle over the store. It can be created just once: it looks up the zoom API on every call, because
 * `use-zoom` registers and unregisters it as it installs and uninstalls. Without zoom (`zoom={false}`)
 * or before the map is ready, moves resolve `completed: false` instead of throwing, and `getView`
 * returns the fit.
 */
export const createHandle = (store: MapStore): ChoroplethMapHandle => ({
  zoomTo: (target, options) => store.getZoom()?.zoomTo(target, options) ?? NOT_AVAILABLE,
  zoomBy: (factor, options) => store.getZoom()?.zoomBy(factor, options) ?? NOT_AVAILABLE,
  resetView: (options) => store.getZoom()?.resetView(options) ?? NOT_AVAILABLE,
  getView: () => store.getZoom()?.getView() ?? store.getFallbackView() ?? EMPTY_VIEW,
  drillDown: (id) => store.getDrill()?.drillDown(id) ?? noDrill("drillDown"),
  drillUp: (steps) => store.getDrill()?.drillUp(steps) ?? noDrill("drillUp"),
  drillTo: (path) => store.getDrill()?.drillTo(path) ?? noDrill("drillTo"),
});
