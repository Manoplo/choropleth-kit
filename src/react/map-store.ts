import { useSyncExternalStore } from "react";
import type { ItemRef } from "./map-item";

export type PointerPosition = { x: number; y: number };

/** Estado de interacción del mapa. Vive FUERA de React (dd.md §11.0, §12.1 y §14). */
export type MapState = {
  /** Item (región o punto) bajo el cursor o con el primer toque (táctil). */
  hovered: ItemRef | null;
  /** Posición del cursor relativa al contenedor; `null` si está fuera. */
  pointer: PointerPosition | null;
};

export type MapStore = {
  subscribe: (listener: () => void) => () => void;
  getState: () => MapState;
  /** Fusiona un parche. No notifica si ningún campo cambia (misma referencia / mismo valor). */
  setState: (patch: Partial<MapState>) => void;
};

const INITIAL_STATE: MapState = { hovered: null, pointer: null };

/**
 * Hover, puntero y (más adelante) foco, cámara confirmada y `interacting`.
 *
 * Si esto fuera `useState` en `Root`, cada cambio de región o cada `mousemove` re-renderizaría
 * `Root` y recalcularía join, escala, leyenda y burbujas. Aquí solo se re-renderiza quien se
 * suscribe con `useMapStore(store, selector)` y su selector devuelve un valor distinto.
 */
export const createMapStore = (): MapStore => {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();
  return {
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
  };
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
