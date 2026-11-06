import type { CameraTransform } from "./camera";

/**
 * Máquina de estados del drill-down (dd.md §11.2.3). Es un _reducer_ puro: ni DOM, ni temporizadores,
 * ni promesas. Quien la use (`react/`) traduce el mundo real a eventos (clic, fin del vuelo, geometría
 * lista…) y pinta el estado resultante. Así se testean todos los bordes (clic durante un vuelo, error,
 * subir antes de terminar de bajar…) sin jsdom.
 *
 * Vocabulario:
 *  - **path**: ids desde la raíz (`[]` = mundo, `["ES"]` = España). Es el destino «optimista»: cambia en
 *    el instante del clic.
 *  - **settledPath**: el path de lo que está realmente dibujado como capa activa. Hasta el rebase,
 *    `path` y `settledPath` difieren.
 *  - **capa** (`layer`): las regiones de un nivel. La capa de profundidad `d` muestra los hijos de
 *    `path[0..d)`. En `["ES"]` hay dos: el mundo (`context`) y las regiones de España (`active`).
 */

export type DrillPhase = "idle" | "flying" | "loading" | "revealing";

/** `down`: un nivel más; `up`: a un ancestro; `lateral`: un hermano; `jump`: cualquier otro salto. */
export type DrillDirection = "down" | "up" | "lateral" | "jump";

export type DrillLayerRole = "active" | "context" | "entering" | "exiting";

export type DrillLayer = {
  /** Identidad de la capa: ver `layerKey`. */
  key: string;
  depth: number;
  role: DrillLayerRole;
};

export type DrillMachineState = {
  phase: DrillPhase;
  /** Destino (optimista). */
  path: readonly string[];
  /** Lo que está dibujado como activo ahora. */
  settledPath: readonly string[];
  /** Dirección de la transición en curso; `null` en reposo. */
  direction: DrillDirection | null;
  layers: readonly DrillLayer[];
  /** ¿Hay un vuelo de cámara esperándose? */
  flight: "pending" | "done";
  /** Identifica el vuelo vigente: un `FLIGHT_END` de otro vuelo (ya redirigido) se ignora. */
  flightId: number;
  /** Estado de la geometría de la capa nueva. `null` si no hay nada que cargar. */
  geometry: "pending" | "ready" | "error" | null;
  /** `key` de la capa cuya geometría se espera; el resto de avisos de geometría son viejos. */
  geometryKey: string | null;
  /** Cámara de cada nivel al bajar desde él, por `layerKey`. Subir vuela a la que había. */
  savedCameras: Readonly<Record<string, CameraTransform>>;
  /** Cámara en el instante en que empezó la transición: adonde se vuelve si falla o se cancela. */
  returnCamera: CameraTransform | null;
  /** `key` de la capa cuya carga falló, hasta el siguiente `DRILL`. Sirve para `onDrillError`. */
  error: string | null;
};

export type DrillMachineEvent =
  | {
      type: "DRILL";
      to: readonly string[];
      /** Solo se respeta `"jump"` (sin animación); el resto se deduce de `settledPath` → `to`. */
      direction?: DrillDirection;
      /** La cámara actual: se guarda al bajar, para que subir vuelva a ella. */
      camera?: CameraTransform;
      /** La geometría de la capa nueva ya está en caché: no hay nada que esperar. */
      cached?: boolean;
    }
  | { type: "FLIGHT_END"; id: number; completed: boolean }
  | { type: "GEOMETRY_READY"; key: string }
  | { type: "GEOMETRY_ERROR"; key: string }
  | { type: "REVEAL_END" };

// ── identidad de las capas ─────────────────────────────────────────────────────────────────────────

/**
 * Clave de la capa de profundidad `depth` bajo `path`: el JSON de `path.slice(0, depth)`. Con JSON no
 * hay colisiones aunque un id contenga `/` o `.`.
 */
export const layerKey = (path: readonly string[], depth: number = path.length): string =>
  JSON.stringify(path.slice(0, depth));

const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const startsWith = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((id, i) => id === path[i]);

/**
 * Cómo se llega de `from` a `to`: `"equal"` si son iguales; `"down"` si `to` es `from` + un id;
 * `"up"` si `to` es un ancestro (de cualquier número de pasos); `"lateral"` si cambia solo el último
 * id; `"jump"` en cualquier otro caso (varios niveles hacia abajo, otra rama…).
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

// ── estado inicial ─────────────────────────────────────────────────────────────────────────────────

/** Las capas de un path ya asentado: la última `active`, las anteriores `context`. */
const settledLayers = (path: readonly string[]): DrillLayer[] =>
  Array.from({ length: path.length + 1 }, (_, depth) => ({
    key: layerKey(path, depth),
    depth,
    role: depth === path.length ? "active" : "context",
  }));

/** Estado en reposo en `path` (por defecto, el mundo). Montar con una ruta de la URL no anima. */
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

/** La cámara a la que volver al subir a `path` (la que había al bajar desde ahí), si se guardó. */
export const savedCameraFor = (
  state: DrillMachineState,
  path: readonly string[],
): CameraTransform | null => state.savedCameras[layerKey(path)] ?? null;

// ── piezas del reducer ─────────────────────────────────────────────────────────────────────────────

/**
 * Capas tras pasar a `to`: las que `to` necesita (activa la última, contexto las demás), más las que
 * sobran como `exiting`. Las que no existían entran con `newRole` (`entering` si hay revelado,
 * `active` si no).
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

/** Fin de las animaciones de capa: lo que entraba pasa a activo y lo que salía desaparece. */
const settleLayers = (layers: readonly DrillLayer[]): DrillLayer[] =>
  layers
    .filter((layer) => layer.role !== "exiting")
    .map((layer) => (layer.role === "entering" ? { ...layer, role: "active" } : layer));

/** Deja en reposo lo que ya terminó de cambiar (revelado o subida); no toca una bajada a medias. */
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

/** Sin vuelo ni carga pendientes, en `settledPath`. Conserva `error` (lo lee `onDrillError`). */
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

/** Vuelta atrás con vuelo inverso hasta `returnCamera` (cancelación o fallo de carga). */
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
  // Un clic repetido sobre el destino que ya se está yendo: nada que hacer (y no hay que perder una
  // geometría que ya llegó).
  if (start.direction !== null && start.direction !== "up" && samePath(to, start.path))
    return state;
  const busy = start.direction !== null; // una bajada, un salto o una vuelta con vuelo en curso

  if (direction === "equal") {
    // Volver al origen mientras se baja = cancelar: vuelo de vuelta y se descarta la carga.
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
    // Sin animación: se pinta el estado final en cuanto está la geometría.
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

  // down / lateral: vuelo en el espacio del origen, en paralelo a la carga. Una redirección a mitad de
  // vuelo conserva la cámara de partida original (es la que hay que restaurar).
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

/** El vuelo y la geometría están listos: el rebase ocurre aquí y empieza el revelado. */
const startReveal = (state: DrillMachineState): DrillMachineState => ({
  ...state,
  phase: "revealing",
  layers: layersFor(state.layers, state.path, "entering"),
  flight: "done",
});

/** Un salto que ya tiene su geometría: se pinta el estado final sin revelado. */
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
      // Subida (o vuelta atrás): ya estaba todo dibujado, solo faltaba la cámara.
      if (state.direction === "up") return settle(state);
      // Un gesto del usuario cortó el vuelo de bajada: se cancela la bajada, no se sigue contra él.
      if (!event.completed) return cancelled(state);
      if (state.geometry === "error") return flyBack(state);
      return state.geometry === "ready"
        ? startReveal(state)
        : { ...state, phase: "loading", flight: "done" };
    }

    case "GEOMETRY_READY": {
      if (event.key !== state.geometryKey || state.geometry !== "pending") return state;
      const ready = { ...state, geometry: "ready" as const };
      if (state.phase !== "loading") return ready; // aún vuela: el fin del vuelo hará el rebase
      return state.direction === "jump" ? finishJump(ready) : startReveal(ready);
    }

    case "GEOMETRY_ERROR": {
      if (event.key !== state.geometryKey || state.geometry !== "pending") return state;
      const failed = { ...state, geometry: "error" as const, error: event.key };
      if (state.phase === "flying") return failed; // el fin del vuelo deshará la bajada
      if (state.phase !== "loading") return state;
      return state.direction === "jump" ? cancelled(failed) : flyBack(failed);
    }

    case "REVEAL_END":
      return state.phase === "revealing" ? settle(state) : state;
  }
};
