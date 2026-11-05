export type Point = { x: number; y: number };

export type PointerStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Point | null;
  set: (point: Point | null) => void;
};

/**
 * Posición del cursor FUERA del estado de React del mapa.
 *
 * Si la posición fuera un `useState` en `Root`, cada `mousemove` re-renderizaría todas las
 * regiones. Aquí solo se re-renderiza quien se suscribe con `useSyncExternalStore` (el tooltip),
 * y no hace falta un `useEffect` para registrar listeners (dd.md §14: «tooltip fuera del árbol»).
 */
export const createPointerStore = (): PointerStore => {
  let current: Point | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => current,
    set: (point) => {
      current = point;
      for (const listener of listeners) listener();
    },
  };
};
