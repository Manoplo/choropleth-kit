import { useSyncExternalStore } from "react";
import { FIT_TRANSFORM, type CameraTransform, type TransitionResult } from "../core";
import type { ItemRef } from "./map-item";

/**
 * Lo que los botones, el teclado y (paso 26) el handle imperativo pueden pedirle al zoom. Lo
 * registra `use-zoom` al instalar `d3-zoom`; cada movimiento devuelve una `Promise` que resuelve al
 * terminar (`completed: false` si un gesto del usuario lo interrumpió).
 */
export type ZoomApi = {
  /** Multiplica el zoom actual (×2 acerca, ×0,5 aleja) centrado en la vista. */
  zoomBy: (factor: number, options?: { duration?: number }) => Promise<TransitionResult>;
  /** Vuelo al encaje del nivel. */
  resetView: (options?: { duration?: number }) => Promise<TransitionResult>;
};

export type PointerPosition = { x: number; y: number };

/** Estado de interacción del mapa. Vive FUERA de React (dd.md §11.0, §12.1 y §14). */
export type MapState = {
  /** Item (región o punto) bajo el cursor o con el primer toque (táctil). */
  hovered: ItemRef | null;
  /** Posición del cursor relativa al contenedor; `null` si está fuera. */
  pointer: PointerPosition | null;
  /** Hay un gesto de zoom/pan en curso (ratón, toque o rueda). No incluye vuelos programáticos. */
  interacting: boolean;
  /**
   * Cámara «confirmada»: la de la última vez que TERMINÓ un gesto. Durante el gesto la escribe
   * `d3-zoom` directamente en el DOM y esto no cambia (dd.md §11.0: nada por frame en React).
   */
  camera: CameraTransform;
  /** Aviso de cómo hacer zoom (Ctrl/⌘ + rueda, dos dedos). Se apaga solo. */
  gestureHint: "wheel" | "touch" | null;
};

export type MapStore = {
  subscribe: (listener: () => void) => () => void;
  getState: () => MapState;
  /** Fusiona un parche. No notifica si ningún campo cambia (misma referencia / mismo valor). */
  setState: (patch: Partial<MapState>) => void;
  /** Enseña el aviso de gesto y lo quita solo tras `GESTURE_HINT_MS`. Repetirlo prolonga el aviso. */
  showGestureHint: (kind: "wheel" | "touch") => void;
  /** Cancela el temporizador del aviso (al desmontar). */
  dispose: () => void;
  /** `use-zoom` registra aquí su API al instalarse y `null` al desinstalarse. */
  registerZoom: (api: ZoomApi | null) => void;
  /** La API de zoom, o `null` si el zoom está desactivado o aún no se ha instalado. */
  getZoom: () => ZoomApi | null;
};

/** Cuánto dura el aviso «Usa Ctrl + rueda para hacer zoom» (dd.md §11.1.2). */
export const GESTURE_HINT_MS = 1500;

const INITIAL_STATE: MapState = {
  hovered: null,
  pointer: null,
  interacting: false,
  camera: FIT_TRANSFORM,
  gestureHint: null,
};

/**
 * Hover, puntero, cámara confirmada, `interacting` y el aviso de gesto. (El foco de teclado llega
 * con la accesibilidad.)
 *
 * Si esto fuera `useState` en `Root`, cada cambio de región o cada `mousemove` re-renderizaría
 * `Root` y recalcularía join, escala, leyenda y burbujas. Aquí solo se re-renderiza quien se
 * suscribe con `useMapStore(store, selector)` y su selector devuelve un valor distinto.
 */
export const createMapStore = (): MapStore => {
  let state = INITIAL_STATE;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let zoomApi: ZoomApi | null = null;
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
  };
  return store;
};

/**
 * Lee un trozo del store. El selector debe devolver un valor estable (primitivo o la misma
 * referencia mientras no cambie): si crea un objeto nuevo en cada llamada, React re-renderizará
 * en bucle.
 */
export const useMapStore = <T>(store: MapStore, selector: (state: MapState) => T): T =>
  useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(INITIAL_STATE),
  );
