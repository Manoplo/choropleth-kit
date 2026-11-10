import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
} from "react";
import type { Feature, FeatureCollection } from "geojson";
import {
  classifyDrill,
  contextOf,
  createDrillState,
  createLruCache,
  drillReducer,
  geographyKeyFor,
  resolveDrillData,
  toFeatureCollection,
  unwrapGeography,
  type ChainLevel,
  type DrillContext,
  type DrillMachineEvent,
  type DrillMachineState,
  type GeographyData,
  type GeographyInput,
  type LruCache,
  type TransitionResult,
} from "../core";
import { buildDrillEvent, sourceDepth, type DrillEvent, type DrillLevel } from "./drill-levels";
import { isProduction } from "./env";
import type { MapItem } from "./map-item";
import type { MapStore } from "./map-store";
import {
  isDrillController,
  useDrillDown,
  DRILL_BRIDGE,
  type DrillController,
} from "./use-drill-down";
import type { GeographyStatus } from "./use-geography";

/**
 * The drill-down engine inside the map. To the rest of the `useChoropleth` hook, a map
 * with `drill` is a ONE-level map (the one being shown) with different options: this engine decides
 * which level that is, loads its geometry (and that of its ancestors, for the projection chain) and
 * hands over the effective options. That way the join, the scale, the bubbles and the legend know nothing about it.
 *
 * **The choreography is governed by `drillReducer`** (`core/drill.ts`, pure). This hook is the glue with
 * the real world: it translates what happens (the consumer changes the route, geometry arrives, a load
 * fails) into reducer events, and renders the resulting state. The camera flight and the reveal timer
 * live in `use-drill-choreography.ts`, because they need the size and the projections.
 *
 *  - **Down / lateral:** the flight starts NOW (optimistic) and the load runs in parallel; the new
 *    level is not shown until both are done.
 *  - **Up / jump:** they are not requested until geometry and data are available (usually immediate: it is cached).
 *  - **While loading** the previous level keeps showing with ITS data (never new data over old geometry).
 */

export type DrillEngineParams<TDatum> = {
  drill: readonly DrillLevel<TDatum>[] | DrillController<TDatum> | undefined;
  /** `data` as is: a list, `undefined` (loading) or a level selector. */
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined);
  /** The map's filter (Antarctica…). Applied only to the root geometry and whatever inherits it. */
  filterFeatures: ((feature: Feature) => boolean) | undefined;
  /** To read the camera when starting to go down (saved to return to it when going up). */
  store: MapStore;
  onDrill: ((event: DrillEvent<TDatum>) => void) | undefined;
  onDrillEnd: ((event: DrillEvent<TDatum>) => void) | undefined;
  onDrillError: ((event: { error: unknown; ctx: DrillContext }) => void) | undefined;
};

/** What was drawn before the last level change: the exiting layers (`exiting`) need it. */
export type DrillPrevious = {
  path: readonly string[];
  chain: readonly ChainLevel[];
  /** Color each region was painted with: the exiting layer fades WITH its color, not in gray. */
  fills: ReadonlyMap<string, string>;
};

export type DrillEngine<TDatum> = {
  /** `false` without the `drill` prop: the hook behaves as always. */
  active: boolean;
  controller: DrillController<TDatum> | null;
  levels: readonly DrillLevel<TDatum>[];
  /** The route of what is being shown (not the requested one, if the new one is still loading or the flight has not ended). */
  shownPath: readonly string[];
  /** Changes only when what is shown changes: serves as a key for effects. */
  shownKey: string;
  depth: number;
  level: DrillLevel<TDatum> | null;
  /** The geometry of the shown level, already resolved. */
  geography: GeographyData | undefined;
  status: GeographyStatus;
  objectName: string | undefined;
  /** Features of the shown level, already filtered. */
  features: FeatureCollection | undefined;
  /** Features of EACH depth `0..depth` of what is shown (the context layers). */
  levelFeatures: readonly (FeatureCollection | undefined)[];
  getFeatureId: ((feature: Feature) => string | undefined) | undefined;
  /** What is drawn at each depth `0..depth`: for the projection chain. */
  chain: readonly ChainLevel[];
  /** Changes only if the content of `chain` changes (use it as a dependency instead of `chain`). */
  chainSig: string;
  /** The composite filter of the shown level: the borders (`createBorders`) need it. */
  filterFeatures: ((feature: Feature) => boolean) | undefined;
  /** The root geometry (for the `"auto"` aspect ratio, which must not change when going down). */
  rootFeatures: FeatureCollection | undefined;
  /** The shown level's data (`undefined` = loading). */
  data: readonly TDatum[] | undefined;
  /** Notes which item caused the next route change (received by `onDrill`). */
  noteItem: (item: MapItem<TDatum>) => void;
  /** The state machine (phase, layers, pending flight…). */
  machine: DrillMachineState;
  dispatch: Dispatch<DrillMachineEvent>;
  /** What was shown before the last change (to draw the exiting layer). */
  previous: DrillPrevious | null;
  /** Records the colors of what is being shown; they are read on a level change (`previous.fills`). */
  rememberFills: (fills: ReadonlyMap<string, string>) => void;
  /** The chain of levels of a route (to compute where the camera flies); `null` if any are missing. */
  chainLevelsFor: (path: readonly string[]) => ChainLevel[] | null;
  /** The REQUESTED route (the controller's), not the shown one. */
  target: readonly string[];
  /**
   * Loads the geometry of `path` (and its ancestors) into the cache without showing it: intent prefetch
   *. Idempotent, silent and with no effect if it is already there or already being requested.
   */
  prefetch: (path: readonly string[]) => void;
  /**
   * Navigates with `run` (which calls the controller and returns the route that ended up requested) and
   * returns a `Promise` that resolves when it returns to rest on it (`completed: false` if it was cut
   * short or never got applied).
   */
  navigate: (
    run: (controller: DrillController<TDatum>) => readonly string[],
  ) => Promise<TransitionResult>;
};

/** If the controller does not apply the requested route within this time (a `controlled` parent that rejects it), the promise resolves `false`. */
const REJECTED_AFTER_MS = 1000;

type Waiter = {
  target: readonly string[];
  resolve: (result: TransitionResult) => void;
  /** The requested route has already been seen as the controller's target. */
  seen: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const defaultFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);

// Numeric identity of each collection: lets "these collections" be summarized in a stable string.
const collectionIds = new WeakMap<object, number>();
let nextCollectionId = 1;
const idOfCollection = (collection: object | undefined): string => {
  if (collection === undefined) return "-";
  let id = collectionIds.get(collection);
  if (id === undefined) {
    id = nextCollectionId++;
    collectionIds.set(collection, id);
  }
  return String(id);
};

const samePath = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// ── stable features ─────────────────────────────────────────────────────────────────────────────
// `toFeatureCollection` of a Topology returns a NEW object on every call and a filter produces a new
// array: without these caches, every render would recompute all the paths. They are indexed by the
// geometry's identity (a `WeakMap`: it does not retain what nobody uses anymore) and by the filter's RESULT.
const collections = new WeakMap<object, Map<string, FeatureCollection>>();
const filtered = new WeakMap<FeatureCollection, Map<string, FeatureCollection>>();

const featureCollectionOf = (
  geography: GeographyData,
  objectName: string | undefined,
): FeatureCollection => {
  const byName = collections.get(geography) ?? new Map<string, FeatureCollection>();
  collections.set(geography, byName);
  const name = objectName ?? "";
  const found = byName.get(name);
  if (found !== undefined) return found;
  const created = toFeatureCollection({ geography, objectName });
  byName.set(name, created);
  return created;
};

const stableFilter = (
  raw: FeatureCollection,
  keep: (feature: Feature) => boolean,
): FeatureCollection => {
  const kept = raw.features.flatMap((feature, index) => (keep(feature) ? [index] : []));
  if (kept.length === raw.features.length) return raw;
  const signature = kept.join(",");
  const bySignature = filtered.get(raw) ?? new Map<string, FeatureCollection>();
  filtered.set(raw, bySignature);
  const found = bySignature.get(signature);
  if (found !== undefined) return found;
  const created: FeatureCollection = {
    ...raw,
    features: kept.flatMap((index) => {
      const feature = raw.features[index];
      return feature === undefined ? [] : [feature];
    }),
  };
  bySignature.set(signature, created);
  return created;
};

// ── geometries ──────────────────────────────────────────────────────────────────────────────────

const isSync = (input: GeographyInput): input is GeographyData =>
  typeof input !== "function" && !("then" in input);

/** Resolves a `GeographyInput` (including an ES module) to its data. */
const resolveInput = (input: GeographyInput): Promise<GeographyData> =>
  isSync(input)
    ? Promise.resolve(input)
    : (typeof input === "function" ? input() : input).then(unwrapGeography);

/** A fixed geometry (not a function) needs neither loading nor cache: it is read during render. */
const fixedGeography = (level: DrillLevel<never>): GeographyData | undefined => {
  const { geography } = level;
  return typeof geography === "function" || geography === "inherit" || !isSync(geography)
    ? undefined
    : geography;
};

const NO_LEVELS: readonly DrillLevel<never>[] = [
  { id: "root", geography: { type: "FeatureCollection", features: [] } },
];

const EMPTY_PATH: readonly string[] = [];
const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

export const useDrillEngine = <TDatum>({
  drill,
  data,
  filterFeatures,
  store,
  onDrill,
  onDrillEnd,
  onDrillError,
}: DrillEngineParams<TDatum>): DrillEngine<TDatum> => {
  const active = drill !== undefined;
  // Always called (hooks are not conditional); without `drill` it keeps a filler level.
  const internal = useDrillDown<TDatum>({
    levels:
      drill === undefined || isDrillController(drill)
        ? (NO_LEVELS as readonly DrillLevel<TDatum>[])
        : drill,
  });
  const controller: DrillController<TDatum> | null =
    drill === undefined ? null : isDrillController(drill) ? drill : internal;
  const levels = controller?.levels ?? (NO_LEVELS as readonly DrillLevel<TDatum>[]);
  const target = controller?.path ?? EMPTY_PATH;
  const targetKey = JSON.stringify(target);

  // The choreography state machine. It starts at rest on the initial route (a URL on mount does not animate).
  const [machine, dispatch] = useReducer(drillReducer, target, createDrillState);

  // ── geometries of the requested route's levels ──────────────────────────────────────────────────
  // `cache` holds what comes from functions (`geography: (ctx) => import(…)`); fixed geometries are
  // read directly. `failed` holds the keys that errored; `pending`, the ones in flight.
  const [cache] = useState<LruCache<GeographyData>>(() => createLruCache<GeographyData>());
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState<ReadonlyMap<string, unknown>>(new Map());
  const pending = useRef(new Set<string>());

  const sourceOf = useCallback((depth: number) => sourceDepth(levels, depth), [levels]);
  /** Cache key of the geometry drawn at `depth` under `path`. */
  const keyAt = (depth: number, path: readonly string[]) =>
    geographyKeyFor(levels, path.slice(0, sourceOf(depth)));
  const geographyAt = (depth: number, path: readonly string[]): GeographyData | undefined => {
    const level = levels[sourceOf(depth)];
    if (level === undefined) return undefined;
    return fixedGeography(level) ?? cache.get(keyAt(depth, path));
  };

  // Requests whatever a route is missing (async load) and notifies on arrival. Used by the target effect
  // and by the prefetch. A failing prefetch does not mark the key as failed: the real error, if any, will
  // come from the click (which will request it again); `version` in the effect's dependencies retries it
  // as soon as it comes back.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const request = (path: readonly string[], prefetching: boolean, retryFailed = false) => {
    for (let depth = 0; depth <= path.length; depth++) {
      const source = sourceOf(depth);
      const level = levels[source];
      if (level === undefined || fixedGeography(level) !== undefined) continue;
      const key = keyAt(depth, path);
      if (cache.has(key) || pending.current.has(key)) continue;
      if (failed.has(key) && !retryFailed) continue;
      const input =
        typeof level.geography === "function"
          ? level.geography(contextOf(path.slice(0, source)))
          : level.geography;
      if (input === "inherit") continue;
      pending.current.add(key);
      resolveInput(input).then(
        (loaded) => {
          pending.current.delete(key);
          cache.set(key, loaded);
          if (mounted.current) setVersion((v) => v + 1);
        },
        (error: unknown) => {
          pending.current.delete(key);
          if (!mounted.current) return;
          if (prefetching) setVersion((v) => v + 1);
          else setFailed((previous) => new Map(previous).set(key, error));
        },
      );
    }
  };
  const latestRequest = useRef(request);
  useEffect(() => {
    latestRequest.current = request;
  });
  const prefetch = useCallback(
    (path: readonly string[]) => {
      if (active) latestRequest.current(path, true);
    },
    [active],
  );

  // A key that failed is retried when THAT route is requested again (a new click), not on every unrelated reload.
  const requestedTarget = useRef("");
  useEffect(() => {
    const retryFailed = requestedTarget.current !== targetKey;
    requestedTarget.current = targetKey;
    if (active) request(target, false, retryFailed);
    // `target`/`levels` are summarized in `targetKey`; `version` retries whatever a failed prefetch left unloaded.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetKey, levels, version]);

  // ── features per depth ────────────────────────────────────────────────────────────────────
  /** The filter of the level at `depth`: the map's (root only) and each level's, with ITS context. */
  const keepFor = (depth: number, path: readonly string[]) => {
    const source = sourceOf(depth);
    return (feature: Feature): boolean => {
      for (let k = source; k <= depth; k++) {
        const level = levels[k];
        if (level?.filterFeatures?.(feature, contextOf(path.slice(0, k))) === false) return false;
      }
      return source !== 0 || filterFeatures === undefined || filterFeatures(feature);
    };
  };
  const featuresAt = (depth: number, path: readonly string[]): FeatureCollection | undefined => {
    const geography = geographyAt(depth, path);
    if (geography === undefined) return undefined;
    const raw = featureCollectionOf(geography, levels[sourceOf(depth)]?.objectName);
    return stableFilter(raw, keepFor(depth, path));
  };
  const featuresFor = (path: readonly string[]) =>
    Array.from({ length: path.length + 1 }, (_, d) => featuresAt(d, path));

  const chainLevelOf = (depth: number, fc: FeatureCollection): ChainLevel => ({
    features: fc.features,
    idOf: levels[depth]?.getFeatureId ?? levels[sourceOf(depth)]?.getFeatureId ?? defaultFeatureId,
  });
  /**
   * The chain of levels of a route. To frame region `path[d − 1]` only the PARENT levels' data is
   * needed; the last one (the one about to be shown) may still be unloaded: it is filled in empty.
   */
  const chainLevelsFor = (path: readonly string[]): ChainLevel[] | null => {
    const collectionsByDepth = featuresFor(path);
    const parents = collectionsByDepth.slice(0, path.length);
    if (parents.some((fc) => fc === undefined)) return null;
    return collectionsByDepth.map((fc, depth) => chainLevelOf(depth, fc ?? EMPTY_COLLECTION));
  };

  // ── what is ready and what is shown? ────────────────────────────────────────────────────────────
  const targetFeatures = active ? featuresFor(target) : [];
  const targetGeometry = active && targetFeatures.every((f) => f !== undefined);
  const targetEmpty = targetGeometry && (targetFeatures[target.length]?.features.length ?? 0) === 0;
  const liveData = resolveDrillData(data, contextOf(target));
  /** The target's geometry and data are ready: it can now be shown without gray or false warnings. */
  const targetReady = targetGeometry && !targetEmpty && liveData !== undefined;

  // What is shown is dictated by the machine: the target only counts on reveal (or when going up / jumping, which do not fly).
  const shownPath = machine.phase === "revealing" ? machine.path : machine.settledPath;
  const shownKey = JSON.stringify(shownPath);
  const shownIsTarget = samePath(shownPath, target);
  const shownFeatures = active ? (shownIsTarget ? targetFeatures : featuresFor(shownPath)) : [];
  const hasShown = active && shownFeatures.every((f) => f !== undefined);

  // The shown level's data. If the target is not shown yet, the old level's: they sit in an object that
  // is updated after each commit (an effect), not during render, so as not to depend on the selector
  // returning the same list (almost nobody does).
  const [latest] = useState(() => ({
    data: undefined as readonly TDatum[] | undefined,
    path: shownPath,
    chain: [] as readonly ChainLevel[],
    fills: new Map<string, string>() as ReadonlyMap<string, string>,
  }));
  const rememberFills = useCallback(
    (fills: ReadonlyMap<string, string>) => {
      latest.fills = fills;
    },
    [latest],
  );

  // The collections are stable by construction (the caches above): their identity, summarized in a
  // string, tells whether `chain` changed. (A variable number of dependencies cannot be passed to `useMemo`.)
  const chainSig = `${shownKey}|${shownFeatures.map(idOfCollection).join(",")}`;
  const chain = useMemo<ChainLevel[]>(
    () => shownFeatures.flatMap((fc, depth) => (fc === undefined ? [] : [chainLevelOf(depth, fc)])),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [chainSig, levels],
  );

  // What was shown BEFORE the last level change (the exiting layer needs it): taken during the render in
  // which the shown route changes (a state adjustment during render), from what was saved after the previous commit.
  const [seen, setSeen] = useState<readonly string[]>(shownPath);
  const [previous, setPrevious] = useState<DrillPrevious | null>(null);
  if (!samePath(seen, shownPath)) {
    setSeen(shownPath);
    setPrevious({ path: latest.path, chain: latest.chain, fills: latest.fills });
  }
  useEffect(() => {
    latest.path = shownPath;
    latest.chain = chain;
    if (shownIsTarget && liveData !== undefined) latest.data = liveData;
  });

  const depth = shownPath.length;
  const level = active ? (levels[depth] ?? null) : null;
  const sourceLevel = levels[sourceOf(depth)];
  const features = hasShown ? shownFeatures[depth] : undefined;
  const geography = hasShown ? geographyAt(depth, shownPath) : undefined;

  // ── errors: they are reported, and the machine undoes the descent ───────────────────────────────
  // The "0 regions" error is memoized per target: if it were built on every render, each render would
  // be a "new" error and it would be reported over and over.
  const emptyError = useMemo(() => {
    if (!targetEmpty) return null;
    const parent = target.at(-1) ?? null;
    const id = levels[target.length]?.id ?? "?";
    return new Error(
      `[choropleth] drill level "${id}" has 0 features for "${parent}". Hint: return false from canDrill for it.`,
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEmpty, targetKey, levels]);
  const failure = (() => {
    if (!active) return null;
    for (let d = 0; d <= target.length; d++) {
      const error = failed.get(keyAt(d, target));
      if (error !== undefined) return { error };
    }
    return emptyError === null ? null : { error: emptyError };
  })();

  const latestProps = useRef({ onDrill, onDrillEnd, onDrillError, controller, target, machine });
  useEffect(() => {
    latestProps.current = { onDrill, onDrillEnd, onDrillError, controller, target, machine };
  });

  // ── handle navigation: the Promise resolves on returning to rest at the requested route ──────────
  const waiters = useRef<Waiter[]>([]);
  const finish = (waiter: Waiter, completed: boolean) => {
    clearTimeout(waiter.timer);
    waiters.current = waiters.current.filter((w) => w !== waiter);
    waiter.resolve({ completed });
  };
  const arrived = (waiter: Waiter) => {
    const { target: wanted, machine: current } = latestProps.current;
    if (!samePath(wanted, waiter.target)) return false;
    waiter.seen = true;
    return current.phase === "idle" && samePath(current.settledPath, waiter.target);
  };
  const navigate = useCallback<DrillEngine<TDatum>["navigate"]>((run) => {
    const ctl = latestProps.current.controller;
    if (ctl === null) return Promise.resolve({ completed: false });
    const wanted = run(ctl);
    return new Promise<TransitionResult>((resolve) => {
      const waiter: Waiter = { target: wanted, resolve, seen: false, timer: undefined };
      waiter.timer = setTimeout(() => {
        if (!waiter.seen) finish(waiter, false);
      }, REJECTED_AFTER_MS);
      // A new navigation replaces earlier ones that were heading elsewhere: those will no longer arrive.
      for (const other of waiters.current) {
        if (!samePath(other.target, wanted)) finish(other, false);
      }
      waiters.current.push(waiter);
      // Already there (nothing to wait for), or already heading there (wait for it to finish).
      if (arrived(waiter)) finish(waiter, true);
    });
    // `finish`/`arrived` only touch refs: they do not change meaning between renders.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    for (const waiter of waiters.current) {
      if (arrived(waiter)) finish(waiter, true);
      // Another route became the target after the request was seen: it was replaced or the machine undid it.
      else if (waiter.seen && !samePath(target, waiter.target)) finish(waiter, false);
    }
  });
  useEffect(
    () => () => {
      for (const waiter of waiters.current) finish(waiter, false);
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── from the real world to reducer events ───────────────────────────────────────────────────────
  // `dispatched`: the last route requested from the machine. `machineAtDispatch`: the machine at that
  // instant; it avoids mistaking for a "rejection" the render in which the reducer has not yet processed the request.
  const dispatched = useRef<readonly string[]>(target);
  const machineAtDispatch = useRef<DrillMachineState>(machine);
  const clicked = useRef<MapItem<TDatum> | undefined>(undefined);
  const noteItem = useCallback((item: MapItem<TDatum>) => {
    clicked.current = item;
  }, []);

  // 1) The requested route changed. Down and lateral start NOW; up and jump wait until everything is
  //    available (usually cached). Returning to the origin while descending (`equal`) cancels, and is immediate.
  const settledKey = JSON.stringify(machine.settledPath);
  useEffect(() => {
    if (!active || controller === null) return;
    if (samePath(dispatched.current, target)) return;
    const direction = classifyDrill(machine.settledPath, target);
    const eager = direction === "down" || direction === "lateral" || direction === "equal";
    if (!eager && !targetReady) return;
    dispatched.current = target;
    machineAtDispatch.current = machine;
    const view = store.getZoom()?.getView();
    dispatch({
      type: "DRILL",
      to: target,
      cached: targetReady,
      ...(view === undefined ? {} : { camera: { k: view.k, x: view.x, y: view.y } }),
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetKey, targetReady, settledKey]);

  // 2) The target's geometry and data arrived.
  useEffect(() => {
    if (!active || machine.geometry !== "pending" || machine.geometryKey === null) return;
    if (targetReady && samePath(machine.path, target)) {
      dispatch({ type: "GEOMETRY_READY", key: machine.geometryKey });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetReady, machine.geometry, machine.geometryKey]);

  // 3) The load failed (or the level came back empty): it is reported once and undone.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    if (!active || failure === null || reported.current === failure.error) return;
    reported.current = failure.error;
    const { onDrillError: report, controller: ctl, machine: current } = latestProps.current;
    const wanted = latestProps.current.target;
    if (report !== undefined) report({ error: failure.error, ctx: contextOf(wanted) });
    else if (!isProduction()) {
      const reason = failure.error instanceof Error ? failure.error.message : String(failure.error);
      console.error(
        reason.startsWith("[choropleth]")
          ? reason
          : `[choropleth] drill: failed to load the geometry for ${JSON.stringify(wanted)}: ${reason}`,
      );
    }
    if (samePath(dispatched.current, wanted) && machine.geometryKey !== null) {
      // Already requested from the machine: it decides the backing out (reverse flight).
      dispatch({ type: "GEOMETRY_ERROR", key: machine.geometryKey });
    } else if (ctl !== null) {
      // Still waiting (up / jump): it was never requested, so returning the route is enough.
      dispatched.current = current.settledPath;
      ctl.drillTo(current.settledPath);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, failure]);

  // 4) The machine undid the descent (error, a gesture that cut the flight, "back to origin"): the
  //    controller must find out, since it is the one in charge of the route.
  const machinePathKey = JSON.stringify(machine.path);
  useEffect(() => {
    if (!active || controller === null) return;
    if (machine === machineAtDispatch.current) return; // has not processed the request yet
    if (!samePath(dispatched.current, target) || samePath(machine.path, target)) return;
    dispatched.current = machine.path;
    machineAtDispatch.current = machine;
    controller.drillTo(machine.path);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, machinePathKey, targetKey]);

  // ── events to the consumer and state ──────────────────────────────────────────────────────────────
  const lastTarget = useRef<readonly string[]>(target);
  useEffect(() => {
    if (!active || samePath(lastTarget.current, target)) return;
    const event = buildDrillEvent<TDatum>({
      from: lastTarget.current,
      to: target,
      item: clicked.current,
    });
    lastTarget.current = target;
    clicked.current = undefined;
    if (event !== null) latestProps.current.onDrill?.(event);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetKey]);

  // `onDrillEnd`: when the choreography ends (the machine returns to rest on a different route).
  const lastEnd = useRef<readonly string[]>(machine.settledPath);
  useEffect(() => {
    if (!active || machine.phase !== "idle") return;
    const previousEnd = lastEnd.current;
    if (samePath(previousEnd, machine.settledPath)) return;
    lastEnd.current = machine.settledPath;
    const event = buildDrillEvent<TDatum>({ from: previousEnd, to: machine.settledPath });
    if (event !== null) latestProps.current.onDrillEnd?.(event);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, machine.phase, settledKey]);

  const status: DrillEngine<TDatum>["status"] = !active
    ? "loading"
    : hasShown
      ? "ready"
      : failure !== null
        ? "error"
        : "loading";
  const bridge = controller?.[DRILL_BRIDGE];
  const phase = machine.phase;
  useEffect(() => {
    bridge?.setStatus(phase);
  }, [bridge, phase]);

  return {
    active,
    controller,
    levels,
    shownPath,
    shownKey,
    depth,
    level,
    geography,
    status,
    objectName: sourceLevel?.objectName,
    features,
    levelFeatures: shownFeatures,
    getFeatureId: level?.getFeatureId ?? sourceLevel?.getFeatureId,
    chain,
    chainSig,
    filterFeatures: active && hasShown ? keepFor(depth, shownPath) : undefined,
    rootFeatures: hasShown ? shownFeatures[0] : undefined,
    data: !active ? undefined : shownIsTarget ? liveData : latest.data,
    noteItem,
    machine,
    dispatch,
    previous,
    rememberFills,
    chainLevelsFor,
    target,
    prefetch,
    navigate,
  };
};
