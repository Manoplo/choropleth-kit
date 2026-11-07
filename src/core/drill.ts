import type { CameraTransform } from "./camera";

/**
 * Drill-down state machine (dd.md §11.2.3). It is a pure _reducer_: no DOM, no timers, no promises.
 * Whoever uses it (`react/`) translates the real world into events (click, end of flight, geometry
 * ready…) and renders the resulting state. That way every edge case (click during a flight, error,
 * going up before finishing going down…) is tested without jsdom.
 *
 * Vocabulary:
 *  - **path**: ids from the root (`[]` = world, `["ES"]` = Spain). It is the "optimistic" target: it
 *    changes the instant of the click.
 *  - **settledPath**: the path of what is actually drawn as the active layer. Until the rebase,
 *    `path` and `settledPath` differ.
 *  - **layer**: the regions of one level. The layer at depth `d` shows the children of
 *    `path[0..d)`. At `["ES"]` there are two: the world (`context`) and Spain's regions (`active`).
 */

export type DrillPhase = "idle" | "flying" | "loading" | "revealing";

/** `down`: one level deeper; `up`: to an ancestor; `lateral`: a sibling; `jump`: any other jump. */
export type DrillDirection = "down" | "up" | "lateral" | "jump";

export type DrillLayerRole = "active" | "context" | "entering" | "exiting";

export type DrillLayer = {
  /** Layer identity: see `layerKey`. */
  key: string;
  depth: number;
  role: DrillLayerRole;
};

export type DrillMachineState = {
  phase: DrillPhase;
  /** Target (optimistic). */
  path: readonly string[];
  /** What is currently drawn as active. */
  settledPath: readonly string[];
  /** Direction of the transition in progress; `null` at rest. */
  direction: DrillDirection | null;
  layers: readonly DrillLayer[];
  /** Is a camera flight pending? */
  flight: "pending" | "done";
  /** Identifies the current flight: a `FLIGHT_END` from another flight (already redirected) is ignored. */
  flightId: number;
  /** State of the new layer's geometry. `null` if there is nothing to load. */
  geometry: "pending" | "ready" | "error" | null;
  /** `key` of the layer whose geometry is awaited; any other geometry notices are stale. */
  geometryKey: string | null;
  /** Camera of each level when going down from it, by `layerKey`. Going up flies back to the saved one. */
  savedCameras: Readonly<Record<string, CameraTransform>>;
  /** Camera at the instant the transition started: where to return if it fails or is cancelled. */
  returnCamera: CameraTransform | null;
  /** `key` of the layer whose load failed, until the next `DRILL`. Feeds `onDrillError`. */
  error: string | null;
};

export type DrillMachineEvent =
  | {
      type: "DRILL";
      to: readonly string[];
      /** Only `"jump"` is honored (no animation); the rest is deduced from `settledPath` → `to`. */
      direction?: DrillDirection;
      /** The current camera: saved when going down, so that going up returns to it. */
      camera?: CameraTransform;
      /** The new layer's geometry is already cached: there is nothing to wait for. */
      cached?: boolean;
    }
  | { type: "FLIGHT_END"; id: number; completed: boolean }
  | { type: "GEOMETRY_READY"; key: string }
  | { type: "GEOMETRY_ERROR"; key: string }
  | { type: "REVEAL_END" };

// ── layer identity ─────────────────────────────────────────────────────────────────────────────

/**
 * Key of the layer at depth `depth` under `path`: the JSON of `path.slice(0, depth)`. With JSON there
 * are no collisions even if an id contains `/` or `.`.
 */
export const layerKey = (path: readonly string[], depth: number = path.length): string =>
  JSON.stringify(path.slice(0, depth));

const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const startsWith = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((id, i) => id === path[i]);

/**
 * How to get from `from` to `to`: `"equal"` if they are the same; `"down"` if `to` is `from` + one id;
 * `"up"` if `to` is an ancestor (any number of steps); `"lateral"` if only the last id changes;
 * `"jump"` in any other case (several levels down, another branch…).
 */
export const classifyDrill = (
  from: readonly string[],
  to: readonly string[],
): DrillDirection | "equal" => {
  if (samePath(from, to)) return "equal";
  if (startsWith(from, to)) return "up";
  if (to.length === from.length + 1 && startsWith(to, from)) return "down";
  if (to.length === from.length && startsWith(to.slice(0, -1), from.slice(0, -1))) return "lateral";
  return "jump";
};

// ── initial state ─────────────────────────────────────────────────────────────────────────────────

/** The layers of an already-settled path: the last one `active`, the earlier ones `context`. */
const settledLayers = (path: readonly string[]): DrillLayer[] =>
  Array.from({ length: path.length + 1 }, (_, depth) => ({
    key: layerKey(path, depth),
    depth,
    role: depth === path.length ? "active" : "context",
  }));

/** Resting state at `path` (the world by default). Mounting with a route from the URL does not animate. */
export const createDrillState = (path: readonly string[] = []): DrillMachineState => ({
  phase: "idle",
  path,
  settledPath: path,
  direction: null,
  layers: settledLayers(path),
  flight: "done",
  flightId: 0,
  geometry: null,
  geometryKey: null,
  savedCameras: {},
  returnCamera: null,
  error: null,
});

/** The camera to return to when going up to `path` (the one saved when going down from there), if any. */
export const savedCameraFor = (
  state: DrillMachineState,
  path: readonly string[],
): CameraTransform | null => state.savedCameras[layerKey(path)] ?? null;

// ── reducer pieces ─────────────────────────────────────────────────────────────────────────────

/**
 * Layers after moving to `to`: the ones `to` needs (the last one active, the others context), plus
 * the surplus ones as `exiting`. Those that did not exist enter with `newRole` (`entering` if there
 * is a reveal, `active` if not).
 */
const layersFor = (
  current: readonly DrillLayer[],
  to: readonly string[],
  newRole: "entering" | "active",
): DrillLayer[] => {
  const existing = new Set(current.map((layer) => layer.key));
  const wanted = settledLayers(to).map((layer) =>
    !existing.has(layer.key) && layer.role === "active" ? { ...layer, role: newRole } : layer,
  );
  const wantedKeys = new Set(wanted.map((layer) => layer.key));
  const leaving = current
    .filter((layer) => !wantedKeys.has(layer.key))
    .map((layer): DrillLayer => ({ ...layer, role: "exiting" }));
  return [...wanted, ...leaving].sort((a, b) => a.depth - b.depth);
};

/** End of the layer animations: what was entering becomes active and what was leaving disappears. */
const settleLayers = (layers: readonly DrillLayer[]): DrillLayer[] =>
  layers
    .filter((layer) => layer.role !== "exiting")
    .map((layer) => (layer.role === "entering" ? { ...layer, role: "active" } : layer));

/** Settles whatever has finished changing (reveal or going up); does not touch a half-done descent. */
const settle = (state: DrillMachineState): DrillMachineState =>
  state.phase === "revealing" || state.direction === "up"
    ? {
        ...state,
        phase: "idle",
        direction: null,
        settledPath: state.path,
        layers: settleLayers(state.layers),
        flight: "done",
        geometry: null,
        geometryKey: null,
        returnCamera: null,
      }
    : state;

/** No pending flight or load, at `settledPath`. Keeps `error` (read by `onDrillError`). */
const cancelled = (state: DrillMachineState): DrillMachineState => ({
  ...state,
  phase: "idle",
  path: state.settledPath,
  direction: null,
  layers: settleLayers(state.layers),
  flight: "done",
  geometry: null,
  geometryKey: null,
  returnCamera: null,
});

/** Back out with a reverse flight to `returnCamera` (cancellation or load failure). */
const flyBack = (state: DrillMachineState): DrillMachineState => ({
  ...cancelled(state),
  phase: "flying",
  direction: "up",
  flight: "pending",
  flightId: state.flightId + 1,
  returnCamera: state.returnCamera,
});

const pruneCameras = (
  cameras: Readonly<Record<string, CameraTransform>>,
  path: readonly string[],
): Record<string, CameraTransform> => {
  const keep = new Set(Array.from({ length: path.length + 1 }, (_, d) => layerKey(path, d)));
  return Object.fromEntries(Object.entries(cameras).filter(([key]) => keep.has(key)));
};

const onDrill = (
  state: DrillMachineState,
  event: Extract<DrillMachineEvent, { type: "DRILL" }>,
): DrillMachineState => {
  const start = settle(state);
  const { to } = event;
  const from = start.settledPath;
  const direction = event.direction === "jump" ? "jump" : classifyDrill(from, to);
  const base = { ...start, error: null };
  // A repeated click on the target already being headed to: nothing to do (and a geometry that has
  // already arrived must not be lost).
  if (start.direction !== null && start.direction !== "up" && samePath(to, start.path))
    return state;
  const busy = start.direction !== null; // a descent, a jump or a return with a flight in progress

  if (direction === "equal") {
    // Going back to the origin while descending = cancel: flight back and the load is discarded.
    return busy ? flyBack({ ...base, returnCamera: start.returnCamera }) : base;
  }

  if (direction === "up") {
    return {
      ...base,
      phase: "flying",
      path: to,
      settledPath: to,
      direction: "up",
      layers: layersFor(start.layers, to, "active"),
      flight: "pending",
      flightId: start.flightId + 1,
      geometry: null,
      geometryKey: null,
      savedCameras: pruneCameras(start.savedCameras, to),
      returnCamera: null,
    };
  }

  const key = layerKey(to);
  const cached = event.cached === true;
  const geometry = cached ? "ready" : "pending";

  if (direction === "jump") {
    // No animation: the final state is painted as soon as the geometry is there.
    if (cached) {
      return {
        ...base,
        phase: "idle",
        path: to,
        settledPath: to,
        direction: null,
        layers: settledLayers(to),
        flight: "done",
        flightId: start.flightId + 1,
        geometry: null,
        geometryKey: null,
        savedCameras: pruneCameras(start.savedCameras, to),
        returnCamera: null,
      };
    }
    return {
      ...base,
      phase: "loading",
      path: to,
      direction: "jump",
      flight: "done",
      flightId: start.flightId + 1,
      geometry: "pending",
      geometryKey: key,
      returnCamera: null,
    };
  }

  // down / lateral: flight in the origin's space, in parallel with the load. A redirect mid-flight
  // keeps the original starting camera (it is the one to restore).
  const fresh = !busy;
  return {
    ...base,
    phase: "flying",
    path: to,
    direction,
    flight: "pending",
    flightId: start.flightId + 1,
    geometry,
    geometryKey: key,
    savedCameras:
      direction === "down" && fresh && event.camera !== undefined
        ? { ...start.savedCameras, [layerKey(from)]: event.camera }
        : start.savedCameras,
    returnCamera: fresh ? (event.camera ?? null) : start.returnCamera,
  };
};

/** The flight and the geometry are ready: the rebase happens here and the reveal starts. */
const startReveal = (state: DrillMachineState): DrillMachineState => ({
  ...state,
  phase: "revealing",
  layers: layersFor(state.layers, state.path, "entering"),
  flight: "done",
});

/** A jump whose geometry is already there: the final state is painted without a reveal. */
const finishJump = (state: DrillMachineState): DrillMachineState => ({
  ...state,
  phase: "idle",
  settledPath: state.path,
  direction: null,
  layers: settledLayers(state.path),
  geometry: null,
  geometryKey: null,
  savedCameras: pruneCameras(state.savedCameras, state.path),
  returnCamera: null,
});

export const drillReducer = (
  state: DrillMachineState,
  event: DrillMachineEvent,
): DrillMachineState => {
  switch (event.type) {
    case "DRILL":
      return onDrill(state, event);

    case "FLIGHT_END": {
      if (state.phase !== "flying" || event.id !== state.flightId) return state;
      // Going up (or backing out): everything was already drawn, only the camera was missing.
      if (state.direction === "up") return settle(state);
      // A user gesture cut the descent flight: the descent is cancelled, not continued against it.
      if (!event.completed) return cancelled(state);
      if (state.geometry === "error") return flyBack(state);
      return state.geometry === "ready"
        ? startReveal(state)
        : { ...state, phase: "loading", flight: "done" };
    }

    case "GEOMETRY_READY": {
      if (event.key !== state.geometryKey || state.geometry !== "pending") return state;
      const ready = { ...state, geometry: "ready" as const };
      if (state.phase !== "loading") return ready; // still flying: the end of the flight will do the rebase
      return state.direction === "jump" ? finishJump(ready) : startReveal(ready);
    }

    case "GEOMETRY_ERROR": {
      if (event.key !== state.geometryKey || state.geometry !== "pending") return state;
      const failed = { ...state, geometry: "error" as const, error: event.key };
      if (state.phase === "flying") return failed; // the end of the flight will undo the descent
      if (state.phase !== "loading") return state;
      return state.direction === "jump" ? cancelled(failed) : flyBack(failed);
    }

    case "REVEAL_END":
      return state.phase === "revealing" ? settle(state) : state;
  }
};
