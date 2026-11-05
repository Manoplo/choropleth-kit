import { useEffect, useState } from "react";
import { unwrapGeography, type GeographyData, type GeographyInput } from "../core";

/**
 * Caché de geometrías cargadas (dd.md §21 tarea 8). Dos mapas con el mismo `() => import("…")` no
 * descargan dos veces. Se indexa por `geographyKey` si el consumidor lo da, y si no por la
 * identidad de la función / promesa. Una función en línea (`() => import(…)`) tiene identidad
 * nueva en cada render: no rompe nada (el módulo ya cargado devuelve el mismo objeto y React no
 * re-renderiza), pero la caché solo sirve con una función estable o con `geographyKey`.
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
  // Un fallo no se cachea: el siguiente intento (otro montaje) puede volver a pedirla.
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
 * Resuelve la prop `geography`. Un dato síncrono se devuelve en el mismo render (sin parpadeo ni
 * efecto); una promesa o un cargador se esperan en un efecto (carga asíncrona = efecto real) y
 * mientras tanto `geography` es `undefined` y el estado, `loading`.
 *
 * Si cambia a otra geometría que aún no se ha cargado, se mantiene la anterior hasta que llegue.
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
    // `onError` queda fuera a propósito: suele ser una función en línea y relanzaría la carga.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [input, key, ready]);

  const geography = ready ?? loaded;
  if (geography !== undefined) return { geography, status: "ready" };
  return { geography: undefined, status: failed ? "error" : "loading" };
};

/** Solo para tests: vacía la caché entre pruebas. */
export const clearGeographyCache = (): void => {
  promisesByKey.clear();
  valuesByKey.clear();
};
