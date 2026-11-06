import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import {
  contextOf,
  createLruCache,
  geographyKeyFor,
  resolveDrillData,
  toFeatureCollection,
  unwrapGeography,
  type ChainLevel,
  type DrillContext,
  type GeographyData,
  type GeographyInput,
  type LruCache,
} from "../core";
import { buildDrillEvent, type DrillEvent, type DrillLevel } from "./drill-levels";
import { isProduction } from "./env";
import type { MapItem } from "./map-item";
import {
  isDrillController,
  useDrillDown,
  DRILL_BRIDGE,
  type DrillController,
} from "./use-drill-down";
import type { GeographyStatus } from "./use-geography";

/**
 * El motor del drill-down dentro del mapa (dd.md §11.2). Para el resto del hook `useChoropleth`, un mapa
 * con `drill` es un mapa de UN nivel (el que se está mostrando) con otras opciones: este motor decide
 * cuál es ese nivel, carga su geometría (y la de sus ancestros, para la cadena de proyecciones) y
 * entrega las opciones efectivas. Así el join, la escala, las burbujas y la leyenda no se enteran.
 *
 * Paso 31: el cambio de nivel es INSTANTÁNEO. El vuelo, el contexto gris y el revelado
 * (`drillReducer`) llegan en el paso siguiente.
 */

export type DrillEngineParams<TDatum> = {
  drill: readonly DrillLevel<TDatum>[] | DrillController<TDatum> | undefined;
  /** `data` tal cual: lista, `undefined` (cargando) o selector del nivel. */
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined);
  /** El filtro del mapa (Antártida…). Se aplica solo a la geometría raíz y a lo que la hereda. */
  filterFeatures: ((feature: Feature) => boolean) | undefined;
  onDrill: ((event: DrillEvent<TDatum>) => void) | undefined;
  onDrillEnd: ((event: DrillEvent<TDatum>) => void) | undefined;
  onDrillError: ((event: { error: unknown; ctx: DrillContext }) => void) | undefined;
};

export type DrillEngine<TDatum> = {
  /** `false` sin prop `drill`: el hook se comporta como siempre. */
  active: boolean;
  controller: DrillController<TDatum> | null;
  levels: readonly DrillLevel<TDatum>[];
  /** La ruta de lo que se está mostrando (no la pedida, si la nueva aún carga). */
  shownPath: readonly string[];
  /** Cambia solo cuando cambia lo mostrado: sirve de clave para efectos. */
  shownKey: string;
  depth: number;
  level: DrillLevel<TDatum> | null;
  /** La geometría del nivel mostrado, ya resuelta. */
  geography: GeographyData | undefined;
  status: GeographyStatus;
  objectName: string | undefined;
  /** Features del nivel mostrado, ya filtradas. */
  features: FeatureCollection | undefined;
  getFeatureId: ((feature: Feature) => string | undefined) | undefined;
  /** Qué se dibuja a cada profundidad `0..depth`: para la cadena de proyecciones. */
  chain: readonly ChainLevel[];
  /** Cambia solo si cambia el contenido de `chain` (úsala de dependencia en vez de `chain`). */
  chainSig: string;
  /** El filtro compuesto del nivel mostrado: lo necesitan las fronteras (`createBorders`). */
  filterFeatures: ((feature: Feature) => boolean) | undefined;
  /** La geometría raíz (para la proporción `"auto"`, que no debe cambiar al bajar). */
  rootFeatures: FeatureCollection | undefined;
  /** Los datos del nivel mostrado (`undefined` = cargando). */
  data: readonly TDatum[] | undefined;
  /** Apunta qué item provocó el próximo cambio de ruta (lo recibe `onDrill`). */
  noteItem: (item: MapItem<TDatum>) => void;
};

const defaultFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);

// Identidad numérica de cada colección: permite resumir «estas colecciones» en una cadena estable.
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

// ── features estables ──────────────────────────────────────────────────────────────────────────────
// `toFeatureCollection` de un Topology devuelve un objeto NUEVO en cada llamada y un filtro produce un
// array nuevo: sin estas cachés, cada render recalcularía todas las rutas. Se indexan por la identidad
// de la geometría (un `WeakMap`: no retiene lo que ya nadie usa) y por el RESULTADO del filtro.
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

// ── geometrías ─────────────────────────────────────────────────────────────────────────────────────

const isSync = (input: GeographyInput): input is GeographyData =>
  typeof input !== "function" && !("then" in input);

/** Resuelve un `GeographyInput` (módulo ES incluido) a su dato. */
const resolveInput = (input: GeographyInput): Promise<GeographyData> =>
  isSync(input)
    ? Promise.resolve(input)
    : (typeof input === "function" ? input() : input).then(unwrapGeography);

/** Una geometría fija (no función) no necesita carga ni caché: se lee en el render. */
const fixedGeography = (level: DrillLevel<never>): GeographyData | undefined => {
  const { geography } = level;
  return typeof geography === "function" || geography === "inherit" || !isSync(geography)
    ? undefined
    : geography;
};

const NO_LEVELS: readonly DrillLevel<never>[] = [
  { id: "root", geography: { type: "FeatureCollection", features: [] } },
];

export const useDrillEngine = <TDatum>({
  drill,
  data,
  filterFeatures,
  onDrill,
  onDrillEnd,
  onDrillError,
}: DrillEngineParams<TDatum>): DrillEngine<TDatum> => {
  const active = drill !== undefined;
  // Siempre se llama (los hooks no son condicionales); sin `drill` se queda con un nivel de relleno.
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

  // ── geometrías de los niveles de la ruta pedida ─────────────────────────────────────────────────
  // `cache` guarda lo que viene de funciones (`geography: (ctx) => import(…)`); las geometrías fijas se
  // leen directamente. `failed` guarda las claves que dieron error; `pending`, las que vuelan.
  const [cache] = useState<LruCache<GeographyData>>(() => createLruCache<GeographyData>());
  const [, setVersion] = useState(0);
  const [failed, setFailed] = useState<ReadonlyMap<string, unknown>>(new Map());
  const pending = useRef(new Set<string>());

  /** Profundidad cuya geometría es la que se dibuja a `depth`: los niveles `"inherit"` usan la del padre. */
  const sourceOf = useCallback(
    (depth: number): number => {
      let source = depth;
      while (source > 0 && levels[source]?.geography === "inherit") source--;
      return source;
    },
    [levels],
  );
  const keyAt = useCallback(
    (depth: number) => geographyKeyFor(levels, target.slice(0, depth)),
    [levels, target],
  );
  const geographyAt = (depth: number): GeographyData | undefined => {
    const source = sourceOf(depth);
    const level = levels[source];
    if (level === undefined) return undefined;
    return fixedGeography(level) ?? cache.get(keyAt(source));
  };

  // Efecto real: pide lo que falta (carga asíncrona) y avisa al llegar.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    for (let depth = 0; depth <= target.length; depth++) {
      const source = sourceOf(depth);
      const level = levels[source];
      if (level === undefined || fixedGeography(level) !== undefined) continue;
      const key = keyAt(source);
      if (cache.has(key) || pending.current.has(key)) continue;
      const input =
        typeof level.geography === "function"
          ? level.geography(contextOf(target.slice(0, source)))
          : level.geography;
      if (input === "inherit") continue;
      pending.current.add(key);
      resolveInput(input).then(
        (loaded) => {
          pending.current.delete(key);
          cache.set(key, loaded);
          if (!cancelled) setVersion((v) => v + 1);
        },
        (error: unknown) => {
          pending.current.delete(key);
          if (!cancelled) setFailed((previous) => new Map(previous).set(key, error));
        },
      );
    }
    return () => {
      cancelled = true;
    };
    // `target`/`levels` se resumen en `targetKey`; `cache` y `pending` son estables.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetKey, levels]);

  // ── features por profundidad ────────────────────────────────────────────────────────────────────
  /** El filtro del nivel de `depth`: el del mapa (solo en la raíz) y el de cada nivel, con SU contexto. */
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
    const geography = geographyAt(depth);
    if (geography === undefined) return undefined;
    const raw = featureCollectionOf(geography, levels[sourceOf(depth)]?.objectName);
    return stableFilter(raw, keepFor(depth, path));
  };

  // ── ¿qué nivel se muestra? ──────────────────────────────────────────────────────────────────────
  // Mientras el destino carga (o sus datos son `undefined`) se SIGUE mostrando el nivel anterior, con
  // SUS datos: nunca datos del nivel nuevo sobre la geometría vieja (mapa gris y avisos falsos).
  const targetFeatures = active
    ? Array.from({ length: target.length + 1 }, (_, d) => featuresAt(d, target))
    : [];
  const targetReady = active && targetFeatures.every((f) => f !== undefined);
  const targetEmpty = targetReady && (targetFeatures[target.length]?.features.length ?? 0) === 0;
  const liveData = resolveDrillData(data, contextOf(target));

  const [shown, setShown] = useState<{
    path: readonly string[];
    data: readonly TDatum[] | undefined;
  } | null>(null);
  const canCommit =
    active && targetReady && !targetEmpty && (liveData !== undefined || shown === null);
  if (canCommit && (shown === null || !samePath(shown.path, target))) {
    setShown({ path: target, data: liveData });
  }
  const shownPath = canCommit ? target : (shown?.path ?? EMPTY_PATH);
  const hasShown = canCommit || shown !== null;
  const shownIsTarget = samePath(shownPath, target);
  const shownKey = JSON.stringify(shownPath);

  const shownFeatures = !hasShown
    ? []
    : shownIsTarget
      ? targetFeatures
      : Array.from({ length: shownPath.length + 1 }, (_, d) => featuresAt(d, shownPath));
  // Las colecciones son estables por construcción (cachés de arriba): su identidad, resumida en una
  // cadena, dice si `chain` cambió. (No se puede pasar un número variable de dependencias a `useMemo`.)
  const chainSig = `${shownKey}|${shownFeatures.map(idOfCollection).join(",")}`;
  const chain = useMemo<ChainLevel[]>(
    () =>
      shownFeatures.flatMap((fc, depth) =>
        fc === undefined
          ? []
          : [
              {
                features: fc.features,
                idOf:
                  levels[depth]?.getFeatureId ??
                  levels[sourceOf(depth)]?.getFeatureId ??
                  defaultFeatureId,
              },
            ],
      ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [chainSig, levels],
  );

  const depth = shownPath.length;
  const level = active ? (levels[depth] ?? null) : null;
  const sourceLevel = levels[sourceOf(depth)];
  const features = hasShown ? shownFeatures[depth] : undefined;
  const geography = hasShown ? geographyAt(depth) : undefined;

  // ── errores: se avisa y se vuelve a donde se estaba ─────────────────────────────────────────────
  const failure = (() => {
    if (!active) return null;
    for (let d = 0; d <= target.length; d++) {
      const error = failed.get(keyAt(sourceOf(d)));
      if (error !== undefined) return { error };
    }
    if (targetEmpty) {
      const parent = target.at(-1) ?? null;
      const id = levels[target.length]?.id ?? "?";
      return {
        error: new Error(
          `[choropleth] drill level "${id}" has 0 features for "${parent}". Hint: return false from canDrill for it.`,
        ),
      };
    }
    return null;
  })();

  const latest = useRef({ onDrill, onDrillEnd, onDrillError, controller, shownPath, target });
  useEffect(() => {
    latest.current = { onDrill, onDrillEnd, onDrillError, controller, shownPath, target };
  });
  const reported = useRef<unknown>(null);
  useEffect(() => {
    if (failure === null || reported.current === failure.error) return;
    reported.current = failure.error;
    const {
      onDrillError: report,
      controller: ctl,
      shownPath: back,
      target: wanted,
    } = latest.current;
    if (report !== undefined) report({ error: failure.error, ctx: contextOf(wanted) });
    else if (!isProduction()) {
      const reason = failure.error instanceof Error ? failure.error.message : String(failure.error);
      console.error(
        reason.startsWith("[choropleth]")
          ? reason
          : `[choropleth] drill: failed to load the geometry for ${JSON.stringify(wanted)}: ${reason}`,
      );
    }
    // Vuelta atrás: la ruta pedida no se puede mostrar. (Sin nada mostrado aún no hay adónde volver.)
    if (ctl !== null && !samePath(back, wanted) && shown !== null) ctl.drillTo(back);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [failure]);

  // ── eventos y estado ────────────────────────────────────────────────────────────────────────────
  const clicked = useRef<MapItem<TDatum> | undefined>(undefined);
  const noteItem = useCallback((item: MapItem<TDatum>) => {
    clicked.current = item;
  }, []);

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
    if (event !== null) latest.current.onDrill?.(event);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetKey]);

  const lastShown = useRef<readonly string[] | null>(null);
  useEffect(() => {
    if (!active || !hasShown) return;
    const previous = lastShown.current;
    lastShown.current = shownPath;
    if (previous === null || samePath(previous, shownPath)) return;
    const event = buildDrillEvent<TDatum>({ from: previous, to: shownPath });
    if (event !== null) latest.current.onDrillEnd?.(event);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasShown, shownKey]);

  const status: DrillEngine<TDatum>["status"] = !active
    ? "loading"
    : hasShown
      ? "ready"
      : failure !== null
        ? "error"
        : "loading";
  const bridge = controller?.[DRILL_BRIDGE];
  const busy = active && !shownIsTarget;
  useEffect(() => {
    bridge?.setStatus(busy ? "loading" : "idle");
  }, [bridge, busy]);

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
    getFeatureId: level?.getFeatureId ?? sourceLevel?.getFeatureId,
    chain,
    chainSig,
    filterFeatures: active && hasShown ? keepFor(depth, shownPath) : undefined,
    rootFeatures: hasShown ? shownFeatures[0] : undefined,
    data: !active ? undefined : shownIsTarget ? liveData : shown?.data,
    noteItem,
  };
};

const EMPTY_PATH: readonly string[] = [];
