import { createContext, useContext, type RefObject } from "react";
import type { ChoroplethMapHandle } from "./handle";
import type { MapStore } from "./map-store";
import type { UseChoroplethResult } from "./use-choropleth";

export type ChoroplethContextValue = {
  choropleth: UseChoroplethResult<unknown>;
  store: MapStore;
  /** La cámara: `<Choropleth.Viewport>` la rellena y `useZoom` (en `Svg`) la lee. */
  viewportRef: RefObject<SVGGElement | null>;
  /** El handle imperativo (el mismo que se obtiene con `ref`). */
  api: ChoroplethMapHandle;
};

export const ChoroplethContext = createContext<ChoroplethContextValue | null>(null);

/**
 * Lee el estado del mapa. `TDatum` es solo una aserción de tipo para el consumidor (el contexto
 * no puede ser genérico): quien llama sabe qué `data` pasó a `Root`.
 */
export const useChoroplethContext = <TDatum = unknown>(): {
  choropleth: UseChoroplethResult<TDatum>;
  store: MapStore;
  viewportRef: RefObject<SVGGElement | null>;
  api: ChoroplethMapHandle;
} => {
  const value = useContext(ChoroplethContext);
  if (value === null) {
    throw new Error(
      "[choropleth] Choropleth components (Svg, Regions, Legend…) must be rendered inside <Choropleth.Root>.",
    );
  }
  return value as unknown as {
    choropleth: UseChoroplethResult<TDatum>;
    store: MapStore;
    viewportRef: RefObject<SVGGElement | null>;
    api: ChoroplethMapHandle;
  };
};

/**
 * El handle imperativo desde DENTRO del compound (dd.md §9.5): un botón hijo de `<Choropleth.Root>`
 * puede llamar a `zoomTo` sin necesitar un `ref`.
 */
export const useChoroplethApi = (): ChoroplethMapHandle => useChoroplethContext().api;
