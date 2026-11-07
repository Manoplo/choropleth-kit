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
 * El motor del drill-down dentro del mapa (dd.md §11.2). Para el resto del hook `useChoropleth`, un mapa
 * con `drill` es un mapa de UN nivel (el que se está mostrando) con otras opciones: este motor decide
 * cuál es ese nivel, carga su geometría (y la de sus ancestros, para la cadena de proyecciones) y
 * entrega las opciones efectivas. Así el join, la escala, las burbujas y la leyenda no se enteran.
 *
 * **La coreografía la gobierna `drillReducer`** (`core/drill.ts`, pura). Este hook es el pegamento con el
 * mundo real: traduce lo que pasa (el consumidor cambia la ruta, llega la geometría, falla una carga) a
 * eventos del reducer, y pinta el estado resultante. El vuelo de cámara y el temporizador del revelado
 * viven en `use-drill-choreography.ts`, porque necesitan el tamaño y las proyecciones.
 *
 *  - **Bajar / lateral:** el vuelo empieza YA (optimista) y la carga va en paralelo; el nivel nuevo no se
 *    muestra hasta que acaban las dos cosas.
 *  - **Subir / saltar:** no se piden hasta tener geometría y datos (suele ser inmediato: está en caché).
 *  - **Mientras carga** se sigue mostrando el nivel anterior con SUS datos (nunca datos nuevos sobre
 *    geometría vieja).
 */

export type DrillEngineParams<TDatum> = {
  drill: readonly DrillLevel<TDatum>[] | DrillController<TDatum> | undefined;
  /** `data` tal cual: lista, `undefined` (cargando) o selector del nivel. */
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined);
  /** El filtro del mapa (Antártida…). Se aplica solo a la geometría raíz y a lo que la hereda. */
  filterFeatures: ((feature: Feature) => boolean) | undefined;
  /** Para leer la cámara al empezar a bajar (se guarda para volver a ella al subir). */
  store: MapStore;
  onDrill: ((event: DrillEvent<TDatum>) => void) | undefined;
  onDrillEnd: ((event: DrillEvent<TDatum>) => void) | undefined;
  onDrillError: ((event: { error: unknown; ctx: DrillContext }) => void) | undefined;
};

/** Lo que se dibujó antes del último cambio de nivel: las capas que salen (`exiting`) lo necesitan. */
export type DrillPrevious = {
  path: readonly string[];
  chain: readonly ChainLevel[];
  /** Color con el que estaba pintada cada región: la capa que sale se desvanece CON su color, no en gris. */
  fills: ReadonlyMap<string, string>;
};

export type DrillEngine<TDatum> = {
  /** `false` sin prop `drill`: el hook se comporta como siempre. */
  active: boolean;
  controller: DrillController<TDatum> | null;
  levels: readonly DrillLevel<TDatum>[];
  /** La ruta de lo que se está mostrando (no la pedida, si la nueva aún carga o el vuelo no acabó). */
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
  /** Features de CADA profundidad `0..depth` de lo mostrado (las capas de contexto). */
  levelFeatures: readonly (FeatureCollection | undefined)[];
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
  /** La máquina de estados (fase, capas, vuelo pendiente…). */
  machine: DrillMachineState;
  dispatch: Dispatch<DrillMachineEvent>;
  /** Lo que se mostraba antes del último cambio (para dibujar la capa que sale). */
  previous: DrillPrevious | null;
  /** Anota los colores de lo que se está mostrando; se leen al cambiar de nivel (`previous.fills`). */
  rememberFills: (fills: ReadonlyMap<string, string>) => void;
  /** La cadena de niveles de una ruta (para calcular a dónde vuela la cámara); `null` si faltan. */
  chainLevelsFor: (path: readonly string[]) => ChainLevel[] | null;
  /** La ruta PEDIDA (la del controlador), no la mostrada. */
  target: readonly string[];
  /**
   * Carga la geometría de `path` (y de sus ancestros) en la caché sin mostrarla: el prefetch por intención
   * (dd.md §11.2.3). Idempotente, silencioso y sin efecto si ya está o ya se está pidiendo.
   */
  prefetch: (path: readonly string[]) => void;
  /**
   * Navega con `run` (que llama al controlador y devuelve la ruta que ha quedado pedida) y devuelve una
   * `Promise` que resuelve al volver a reposo en ella (`completed: false` si se cortó o no llegó a aplicarse).
   */
  navigate: (
    run: (controller: DrillController<TDatum>) => readonly string[],
  ) => Promise<TransitionResult>;
};

/** Si el controlador no aplica la ruta pedida en este tiempo (un padre `controlled` que la rechaza), la promesa resuelve `false`. */
const REJECTED_AFTER_MS = 1000;

type Waiter = {
  target: readonly string[];
  resolve: (result: TransitionResult) => void;
  /** Ya se vio la ruta pedida como destino del controlador. */
  seen: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
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

  // La máquina de estados de la coreografía. Nace en reposo en la ruta inicial (una URL al montar no anima).
  const [machine, dispatch] = useReducer(drillReducer, target, createDrillState);

  // ── geometrías de los niveles de la ruta pedida ─────────────────────────────────────────────────
  // `cache` guarda lo que viene de funciones (`geography: (ctx) => import(…)`); las geometrías fijas se
  // leen directamente. `failed` guarda las claves que dieron error; `pending`, las que vuelan.
  const [cache] = useState<LruCache<GeographyData>>(() => createLruCache<GeographyData>());
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState<ReadonlyMap<string, unknown>>(new Map());
  const pending = useRef(new Set<string>());

  const sourceOf = useCallback((depth: number) => sourceDepth(levels, depth), [levels]);
  /** Clave de caché de la geometría que se dibuja a `depth` bajo `path`. */
  const keyAt = (depth: number, path: readonly string[]) =>
    geographyKeyFor(levels, path.slice(0, sourceOf(depth)));
  const geographyAt = (depth: number, path: readonly string[]): GeographyData | undefined => {
    const level = levels[sourceOf(depth)];
    if (level === undefined) return undefined;
    return fixedGeography(level) ?? cache.get(keyAt(depth, path));
  };

  // Pide lo que falta de una ruta (carga asíncrona) y avisa al llegar. Lo usan el efecto del destino y el
  // prefetch. Un prefetch que falla no marca la clave como fallida: el error real, si lo hay, lo dará el
  // clic (que volverá a pedirla); `version` en las dependencias del efecto lo reintenta en cuanto vuelve.
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

  // Una clave que falló se reintenta al volver a pedir ESA ruta (un clic nuevo), no en cada recarga ajena.
  const requestedTarget = useRef("");
  useEffect(() => {
    const retryFailed = requestedTarget.current !== targetKey;
    requestedTarget.current = targetKey;
    if (active) request(target, false, retryFailed);
    // `target`/`levels` se resumen en `targetKey`; `version` reintenta lo que un prefetch fallido dejó sin cargar.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetKey, levels, version]);

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
   * La cadena de niveles de una ruta. Para encuadrar la región `path[d − 1]` solo hace falta lo de los
   * niveles PADRE; el último (el que se va a mostrar) puede estar sin cargar todavía: se rellena vacío.
   */
  const chainLevelsFor = (path: readonly string[]): ChainLevel[] | null => {
    const collectionsByDepth = featuresFor(path);
    const parents = collectionsByDepth.slice(0, path.length);
    if (parents.some((fc) => fc === undefined)) return null;
    return collectionsByDepth.map((fc, depth) => chainLevelOf(depth, fc ?? EMPTY_COLLECTION));
  };

  // ── ¿qué está listo y qué se muestra? ───────────────────────────────────────────────────────────
  const targetFeatures = active ? featuresFor(target) : [];
  const targetGeometry = active && targetFeatures.every((f) => f !== undefined);
  const targetEmpty = targetGeometry && (targetFeatures[target.length]?.features.length ?? 0) === 0;
  const liveData = resolveDrillData(data, contextOf(target));
  /** Geometría y datos del destino listos: ya se puede mostrar sin gris ni avisos falsos. */
  const targetReady = targetGeometry && !targetEmpty && liveData !== undefined;

  // Lo mostrado lo manda la máquina: el destino solo cuenta al revelar (o al subir / saltar, que no vuelan).
  const shownPath = machine.phase === "revealing" ? machine.path : machine.settledPath;
  const shownKey = JSON.stringify(shownPath);
  const shownIsTarget = samePath(shownPath, target);
  const shownFeatures = active ? (shownIsTarget ? targetFeatures : featuresFor(shownPath)) : [];
  const hasShown = active && shownFeatures.every((f) => f !== undefined);

  // Los datos del nivel mostrado. Si el destino aún no se muestra, los del nivel viejo: están en un
  // objeto que se actualiza tras cada commit (un efecto), no en el render, para no depender de que el
  // selector devuelva la misma lista (casi nadie lo hace).
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

  // Las colecciones son estables por construcción (cachés de arriba): su identidad, resumida en una
  // cadena, dice si `chain` cambió. (No se puede pasar un número variable de dependencias a `useMemo`.)
  const chainSig = `${shownKey}|${shownFeatures.map(idOfCollection).join(",")}`;
  const chain = useMemo<ChainLevel[]>(
    () => shownFeatures.flatMap((fc, depth) => (fc === undefined ? [] : [chainLevelOf(depth, fc)])),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [chainSig, levels],
  );

  // Lo que se mostraba ANTES del último cambio de nivel (la capa que sale lo necesita): se toma en el render
  // en que cambia la ruta mostrada (ajuste de estado durante el render), de lo guardado tras el commit anterior.
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

  // ── errores: se avisan, y la máquina deshace la bajada ──────────────────────────────────────────
  // El error de «0 regiones» se memoiza por destino: si se construyera en cada render, cada render sería un
  // error «nuevo» y se avisaría una y otra vez.
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

  // ── navegación del handle: la Promise resuelve al volver a reposo en la ruta pedida ───────────────
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
      // Una navegación nueva sustituye a las anteriores que iban a otra parte: esas ya no llegarán.
      for (const other of waiters.current) {
        if (!samePath(other.target, wanted)) finish(other, false);
      }
      waiters.current.push(waiter);
      // Ya estaba allí (nada que esperar), o ya iba hacia allí (esperar a que acabe).
      if (arrived(waiter)) finish(waiter, true);
    });
    // `finish`/`arrived` solo tocan refs: no cambian de significado entre renders.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    for (const waiter of waiters.current) {
      if (arrived(waiter)) finish(waiter, true);
      // Otra ruta pasó a ser el destino tras haber visto el pedido: lo sustituyeron o la máquina lo deshizo.
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

  // ── del mundo real a eventos del reducer ────────────────────────────────────────────────────────
  // `dispatched`: la última ruta pedida a la máquina. `machineAtDispatch`: la máquina en ese instante; sirve
  // para no tomar por «rechazo» el render en que el reducer aún no ha procesado la petición.
  const dispatched = useRef<readonly string[]>(target);
  const machineAtDispatch = useRef<DrillMachineState>(machine);
  const clicked = useRef<MapItem<TDatum> | undefined>(undefined);
  const noteItem = useCallback((item: MapItem<TDatum>) => {
    clicked.current = item;
  }, []);

  // 1) La ruta pedida cambió. Bajar y lateral empiezan YA; subir y saltar esperan a tener todo (suele estar
  //    en caché). Volver al origen mientras se baja (`equal`) cancela, y es inmediato.
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

  // 2) Llegó la geometría y los datos del destino.
  useEffect(() => {
    if (!active || machine.geometry !== "pending" || machine.geometryKey === null) return;
    if (targetReady && samePath(machine.path, target)) {
      dispatch({ type: "GEOMETRY_READY", key: machine.geometryKey });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetReady, machine.geometry, machine.geometryKey]);

  // 3) Falló la carga (o el nivel viene vacío): se avisa una vez y se deshace.
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
      // Ya se pidió a la máquina: ella decide la vuelta atrás (vuelo inverso).
      dispatch({ type: "GEOMETRY_ERROR", key: machine.geometryKey });
    } else if (ctl !== null) {
      // Todavía esperaba (subida / salto): no se llegó a pedir, basta con devolver la ruta.
      dispatched.current = current.settledPath;
      ctl.drillTo(current.settledPath);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, failure]);

  // 4) La máquina deshizo la bajada (error, gesto que cortó el vuelo, «volver al origen»): el controlador
  //    debe enterarse, que es quien manda sobre la ruta.
  const machinePathKey = JSON.stringify(machine.path);
  useEffect(() => {
    if (!active || controller === null) return;
    if (machine === machineAtDispatch.current) return; // aún no ha procesado la petición
    if (!samePath(dispatched.current, target) || samePath(machine.path, target)) return;
    dispatched.current = machine.path;
    machineAtDispatch.current = machine;
    controller.drillTo(machine.path);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, machinePathKey, targetKey]);

  // ── eventos al consumidor y estado ──────────────────────────────────────────────────────────────
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

  // `onDrillEnd`: al terminar la coreografía (la máquina vuelve a reposo en una ruta distinta).
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
