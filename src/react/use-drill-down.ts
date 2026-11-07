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

/** Fases de la coreografía que el mapa le cuenta al hook (las calcula `drillReducer`). */
export type DrillStatus = "idle" | "flying" | "loading" | "revealing";

/**
 * Canal por el que el MAPA escribe `status` y el hook lo lee con `useSyncExternalStore`. Vive fuera de
 * React por la misma razón que el `map-store`: no hay que renderizar el árbol del consumidor en cada
 * cambio de fase.
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

/** Clave (símbolo) del canal en el controlador: es de uso interno del mapa, no API pública. */
export const DRILL_BRIDGE = Symbol("choropleth.drillBridge");

export type DrillBreadcrumb = DrillCrumb;

export type DrillController<TDatum> = {
  levels: readonly DrillLevel<TDatum>[];
  /** Ids desde la raíz. Ya recortada a los niveles que existen. */
  path: readonly string[];
  context: DrillContext;
  /** El nivel actual: `levels[path.length]`. */
  level: DrillLevel<TDatum>;
  breadcrumbs: readonly DrillBreadcrumb[];
  /** Lo escribe el mapa; mientras no hay mapa montado, `"idle"`. */
  status: DrillStatus;
  canDrillUp: boolean;
  /**
   * Baja un nivel al hijo `id`. Sin nivel por debajo no hace nada (y avisa en desarrollo). Devuelve la
   * ruta que ha quedado pedida (ya recortada): el mapa la usa para saber a dónde espera llegar.
   */
  drillDown: (id: string) => readonly string[];
  /** Sube `steps` niveles (por defecto 1); más que la profundidad = a la raíz. */
  drillUp: (steps?: number) => readonly string[];
  /** Cualquier ruta: lateral, saltos, la URL. */
  drillTo: (path: readonly string[]) => readonly string[];
  /** Vuelve a la raíz. */
  reset: () => readonly string[];
  /** @internal El canal con el que el mapa publica `status`. */
  readonly [DRILL_BRIDGE]: DrillBridge;
};

export type UseDrillDownOptions<TDatum> = {
  levels: readonly DrillLevel<TDatum>[];
  /** Controlado: tú mandas (p. ej. desde la URL). El hook solo avisa con `onPathChange`. */
  path?: readonly string[];
  /** No controlado: ruta inicial. */
  defaultPath?: readonly string[];
  /** Se llama en cada cambio de ruta pedido (clic, teclado, migas, `drillTo`), controlado o no. */
  onPathChange?: (path: readonly string[]) => void;
  /**
   * Nombre de cada paso de las migas. Por defecto, el id. (El hook no ve la geometría: el nombre de la
   * región, `properties.name`, lo pone el mapa cuando exista; aquí `feature` y `datum` van vacíos.)
   */
  getLabel?: (args: { id: string; depth: number; feature?: Feature; datum?: TDatum }) => string;
};

const samePath = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const warn = (message: string) => {
  if (!isProduction()) console.warn(`[choropleth] useDrillDown: ${message}`);
};

/**
 * Estado de navegación del drill-down (dd.md §11.2.2): la ruta, en modo controlado o no controlado, y
 * lo que se deduce de ella (nivel, contexto, migas). No carga geometría ni mueve la cámara: eso lo hace
 * el mapa, que además le cuenta su fase (`status`).
 *
 * Controlado = `path` presente (el patrón de `<input value>`). La ruta se recorta a los niveles que
 * existen: con N niveles, N − 1 ids como máximo.
 */
export const useDrillDown = <TDatum>({
  levels,
  path: controlledPath,
  defaultPath,
  onPathChange,
  getLabel,
}: UseDrillDownOptions<TDatum>): DrillController<TDatum> => {
  // La lista de niveles suele ser una constante; si cambia de contenido se vuelve a comprobar.
  useMemo(() => validateLevels(levels), [levels]);

  const controlled = controlledPath !== undefined;
  const [innerPath, setInnerPath] = useState<readonly string[]>(
    () => clampPath(defaultPath ?? [], levels.length).path,
  );
  const [bridge] = useState(createDrillBridge);

  const requested = controlled ? controlledPath : innerPath;
  const { path, clamped } = clampPath(requested, levels.length);
  const pathKey = JSON.stringify(requested);

  // Una ruta más profunda que los niveles (típico: una URL vieja) se recorta; se avisa una vez por ruta.
  useEffect(() => {
    if (clamped) {
      warn(
        `path ${pathKey} is deeper than the ${levels.length} level(s) allow; it was truncated to ${JSON.stringify(path)}.`,
      );
    }
    // `path` y `levels.length` se derivan de lo que ya está en las dependencias.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, pathKey]);

  // Lo último, para que las funciones sean estables (se pasan a handlers y a efectos del mapa).
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
    // Dos llamadas en el mismo tick (`drillUp(); drillDown(x)`) ven la ruta ya cambiada.
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
    // `getLabel` suele ser una función en línea: su identidad no debe recalcular las migas en cada render.
    // La ruta (`pathKey`) y la raíz sí.
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
 * La prop `drill` admite una lista de niveles (no controlado) o un controlador de `useDrillDown`
 * (controlado). Esto distingue una cosa de la otra.
 */
export const isDrillController = <TDatum>(
  drill: readonly DrillLevel<TDatum>[] | DrillController<TDatum>,
): drill is DrillController<TDatum> => !Array.isArray(drill);
