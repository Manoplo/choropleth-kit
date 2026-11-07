import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buildBreadcrumbs,
  clampPath,
  contextOf,
  validateLevels,
  type DrillContext,
  type DrillCrumb,
} from "../core";
import type { Feature } from "geojson";
import type { DrillLevel } from "./drill-levels";
import { isProduction } from "./env";

/** Choreography phases the map reports to the hook (computed by `drillReducer`). */
export type DrillStatus = "idle" | "flying" | "loading" | "revealing";

/**
 * Channel through which the MAP writes `status` and the hook reads it with `useSyncExternalStore`. It
 * lives outside React for the same reason as the `map-store`: the consumer's tree must not be
 * rendered on every phase change.
 */
export type DrillBridge = {
  getStatus: () => DrillStatus;
  setStatus: (status: DrillStatus) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createDrillBridge = (): DrillBridge => {
  let status: DrillStatus = "idle";
  const listeners = new Set<() => void>();
  return {
    getStatus: () => status,
    setStatus: (next) => {
      if (next === status) return;
      status = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
};

/** Key (symbol) of the channel on the controller: for the map's internal use, not public API. */
export const DRILL_BRIDGE = Symbol("choropleth.drillBridge");

export type DrillBreadcrumb = DrillCrumb;

export type DrillController<TDatum> = {
  levels: readonly DrillLevel<TDatum>[];
  /** Ids from the root. Already trimmed to the levels that exist. */
  path: readonly string[];
  context: DrillContext;
  /** The current level: `levels[path.length]`. */
  level: DrillLevel<TDatum>;
  breadcrumbs: readonly DrillBreadcrumb[];
  /** Written by the map; while no map is mounted, `"idle"`. */
  status: DrillStatus;
  canDrillUp: boolean;
  /**
   * Goes down one level to child `id`. With no level below, it does nothing (and warns in development).
   * Returns the route that ended up requested (already trimmed): the map uses it to know where it
   * expects to arrive.
   */
  drillDown: (id: string) => readonly string[];
  /** Goes up `steps` levels (1 by default); more than the depth = to the root. */
  drillUp: (steps?: number) => readonly string[];
  /** Any route: lateral, jumps, the URL. */
  drillTo: (path: readonly string[]) => readonly string[];
  /** Back to the root. */
  reset: () => readonly string[];
  /** @internal The channel through which the map publishes `status`. */
  readonly [DRILL_BRIDGE]: DrillBridge;
};

export type UseDrillDownOptions<TDatum> = {
  levels: readonly DrillLevel<TDatum>[];
  /** Controlled: you are in charge (e.g. from the URL). The hook only notifies via `onPathChange`. */
  path?: readonly string[];
  /** No controlado: ruta inicial. */
  defaultPath?: readonly string[];
  /** Called on every requested route change (click, keyboard, breadcrumbs, `drillTo`), controlled or not. */
  onPathChange?: (path: readonly string[]) => void;
  /**
   * Name of each breadcrumb step. The id by default. (The hook does not see the geometry: the region's
   * name, `properties.name`, is set by the map when it exists; here `feature` and `datum` are empty.)
   */
  getLabel?: (args: { id: string; depth: number; feature?: Feature; datum?: TDatum }) => string;
};

const samePath = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const warn = (message: string) => {
  if (!isProduction()) console.warn(`[choropleth] useDrillDown: ${message}`);
};

/**
 * Drill-down navigation state (dd.md §11.2.2): the route, in controlled or uncontrolled mode, and
 * what is deduced from it (level, context, breadcrumbs). It loads no geometry and moves no camera:
 * the map does that, and it also reports its phase back (`status`).
 *
 * Controlled = `path` present (the `<input value>` pattern). The route is trimmed to the levels that
 * exist: with N levels, N − 1 ids at most.
 */
export const useDrillDown = <TDatum>({
  levels,
  path: controlledPath,
  defaultPath,
  onPathChange,
  getLabel,
}: UseDrillDownOptions<TDatum>): DrillController<TDatum> => {
  // The list of levels is usually a constant; if its content changes it is checked again.
  useMemo(() => validateLevels(levels), [levels]);

  const controlled = controlledPath !== undefined;
  const [innerPath, setInnerPath] = useState<readonly string[]>(
    () => clampPath(defaultPath ?? [], levels.length).path,
  );
  const [bridge] = useState(createDrillBridge);

  const requested = controlled ? controlledPath : innerPath;
  const { path, clamped } = clampPath(requested, levels.length);
  const pathKey = JSON.stringify(requested);

  // A route deeper than the levels (typical: an old URL) is trimmed; a warning is given once per route.
  useEffect(() => {
    if (clamped) {
      warn(
        `path ${pathKey} is deeper than the ${levels.length} level(s) allow; it was truncated to ${JSON.stringify(path)}.`,
      );
    }
    // `path` and `levels.length` are derived from what is already in the dependencies.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, pathKey]);

  // Last, so the functions are stable (they are passed to handlers and to the map's effects).
  const latest = useRef({ path, levels: levels.length, controlled, onPathChange });
  useEffect(() => {
    latest.current = { path, levels: levels.length, controlled, onPathChange };
  });

  const commit = useCallback((next: readonly string[]): readonly string[] => {
    const current = latest.current;
    const { path: valid, clamped: tooDeep } = clampPath(next, current.levels);
    if (tooDeep) {
      warn(
        `cannot drill to ${JSON.stringify(next)}: only ${current.levels} level(s) are defined (max depth ${current.levels - 1}).`,
      );
    }
    if (samePath(valid, current.path)) return valid;
    // Two calls in the same tick (`drillUp(); drillDown(x)`) see the already-changed route.
    latest.current = { ...current, path: valid };
    if (!current.controlled) setInnerPath(valid);
    current.onPathChange?.(valid);
    return valid;
  }, []);

  const drillDown = useCallback(
    (id: string): readonly string[] => commit([...latest.current.path, id]),
    [commit],
  );
  const drillUp = useCallback(
    (steps = 1): readonly string[] => {
      const up = Number.isFinite(steps) ? Math.max(0, Math.floor(steps)) : 0;
      const { path: current } = latest.current;
      return commit(current.slice(0, Math.max(0, current.length - up)));
    },
    [commit],
  );
  const drillTo = commit;
  const reset = useCallback((): readonly string[] => commit([]), [commit]);

  const status = useSyncExternalStore(bridge.subscribe, bridge.getStatus, bridge.getStatus);

  const rootLabel = levels[0]?.label ?? levels[0]?.id ?? "";
  const breadcrumbs = useMemo(
    () =>
      buildBreadcrumbs({
        path,
        rootLabel,
        getLabel: getLabel === undefined ? undefined : ({ id, depth }) => getLabel({ id, depth }),
      }),
    // `getLabel` is usually an inline function: its identity must not recompute the breadcrumbs on every render.
    // The route (`pathKey`) and the root do.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [pathKey, rootLabel],
  );

  const level = levels[path.length] ?? (levels[levels.length - 1] as DrillLevel<TDatum>);
  const context = useMemo(() => contextOf(path), [path]);

  return useMemo(
    () => ({
      levels,
      path,
      context,
      level,
      breadcrumbs,
      status,
      canDrillUp: path.length > 0,
      drillDown,
      drillUp,
      drillTo,
      reset,
      [DRILL_BRIDGE]: bridge,
    }),
    [levels, path, context, level, breadcrumbs, status, drillDown, drillUp, drillTo, reset, bridge],
  );
};

/**
 * The `drill` prop accepts a list of levels (uncontrolled) or a `useDrillDown` controller
 * (controlled). This tells one from the other.
 */
export const isDrillController = <TDatum>(
  drill: readonly DrillLevel<TDatum>[] | DrillController<TDatum>,
): drill is DrillController<TDatum> => !Array.isArray(drill);
