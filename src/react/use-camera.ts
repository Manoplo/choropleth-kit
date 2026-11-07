import { useMemo, useSyncExternalStore } from "react";
import type { ViewState } from "../core";
import { useChoroplethContext } from "./choropleth-context";
import type { MapStore } from "./map-store";

/**
 * Selector subscription to the CONFIRMED camera (dd.md §11.1.7): it is re-evaluated when a gesture, a
 * flight or a level change ends, **never per frame** (during the gesture `d3-zoom` writes to the DOM
 * and React is unaware). Use it inside `<Choropleth.Root>`:
 *
 * ```tsx
 * const zoomedIn = useCamera((view) => view.zoom > 3);
 * ```
 *
 * The component only re-renders if the selector's result changes: primitives by `Object.is`, and
 * objects or arrays (`(v) => v.center`) by shallow equality, so there is no need to memoize the
 * selector or return a stable reference.
 */
export const useCamera = <T>(selector: (view: ViewState) => T): T => {
  const { store, api } = useChoroplethContext();
  const getSnapshot = useMemo(
    () => createCameraSnapshot(store, () => api.getView(), selector),
    [store, api, selector],
  );
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

/**
 * The `getSnapshot` of `useSyncExternalStore`, with a cache keyed by the confirmed camera's reference:
 * the store also notifies on hover and pointer, and `getView` projects bounds, so the selector is only
 * evaluated when the camera really changes. It lives outside the hook because it holds mutable state.
 */
const createCameraSnapshot = <T>(
  store: MapStore,
  getView: () => ViewState,
  selector: (view: ViewState) => T,
): (() => T) => {
  let lastCamera: unknown;
  let last: { value: T } | undefined;
  return () => {
    const camera = store.getState().camera;
    if (last !== undefined && Object.is(camera, lastCamera)) return last.value;
    const value = selector(getView());
    lastCamera = camera;
    if (last === undefined || !shallowEqual(last.value, value)) last = { value };
    return last.value;
  };
};

const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
};
