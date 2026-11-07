import { useEffect, useState } from "react";
import { unwrapGeography, type GeographyData, type GeographyInput } from "../core";

/**
 * Cache of loaded geometries (dd.md §21 task 8). Two maps with the same `() => import("…")` do not
 * download twice. It is keyed by `geographyKey` if the consumer gives one, and otherwise by the
 * identity of the function / promise. An inline function (`() => import(…)`) has a new identity on
 * every render: it breaks nothing (the already-loaded module returns the same object and React does
 * not re-render), but the cache only helps with a stable function or with `geographyKey`.
 */
const promisesByKey = new Map<string, Promise<GeographyData>>();
const promisesByIdentity = new WeakMap<object, Promise<GeographyData>>();
const valuesByKey = new Map<string, GeographyData>();
const valuesByIdentity = new WeakMap<object, GeographyData>();

const isDeferred = (input: GeographyInput): input is Exclude<GeographyInput, GeographyData> =>
  typeof input === "function" || "then" in input;

const peek = (input: GeographyInput, key: string | undefined): GeographyData | undefined => {
  if (!isDeferred(input)) return input;
  return key === undefined ? valuesByIdentity.get(input) : valuesByKey.get(key);
};

const load = (
  input: Exclude<GeographyInput, GeographyData>,
  key: string | undefined,
): Promise<GeographyData> => {
  const cached = key === undefined ? promisesByIdentity.get(input) : promisesByKey.get(key);
  if (cached !== undefined) return cached;

  const promise = (typeof input === "function" ? input() : input).then((module) => {
    const value = unwrapGeography(module);
    if (key === undefined) valuesByIdentity.set(input, value);
    else valuesByKey.set(key, value);
    return value;
  });
  if (key === undefined) promisesByIdentity.set(input, promise);
  else promisesByKey.set(key, promise);
  // A failure is not cached: the next attempt (another mount) can request it again.
  promise.catch(() => {
    if (key === undefined) promisesByIdentity.delete(input);
    else promisesByKey.delete(key);
  });
  return promise;
};

export type GeographyStatus = "loading" | "ready" | "error";

export type UseGeographyResult = {
  geography: GeographyData | undefined;
  status: GeographyStatus;
};

/**
 * Resolves the `geography` prop. Synchronous data is returned in the same render (no flicker and no
 * effect); a promise or a loader is awaited in an effect (async loading = a real effect) and in the
 * meantime `geography` is `undefined` and the status is `loading`.
 *
 * If it changes to another geometry that has not loaded yet, the previous one is kept until it arrives.
 */
export const useGeography = (
  input: GeographyInput,
  key: string | undefined,
  onError?: (error: Error) => void,
): UseGeographyResult => {
  const ready = peek(input, key);
  const [loaded, setLoaded] = useState<GeographyData | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ready !== undefined || !isDeferred(input)) return;
    let cancelled = false;
    load(input, key).then(
      (value) => {
        if (cancelled) return;
        setFailed(false);
        setLoaded(value);
      },
      (reason: unknown) => {
        if (cancelled) return;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        setFailed(true);
        if (onError === undefined)
          console.error(`[choropleth] Failed to load geography: ${error.message}`);
        else onError(error);
      },
    );
    return () => {
      cancelled = true;
    };
    // `onError` is left out on purpose: it is usually an inline function and would relaunch the load.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [input, key, ready]);

  const geography = ready ?? loaded;
  if (geography !== undefined) return { geography, status: "ready" };
  return { geography: undefined, status: failed ? "error" : "loading" };
};

/** For tests only: empties the cache between tests. */
export const clearGeographyCache = (): void => {
  promisesByKey.clear();
  valuesByKey.clear();
};
