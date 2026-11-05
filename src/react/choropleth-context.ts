import { createContext, useContext } from "react";
import type { MapStore } from "./map-store";
import type { UseChoroplethResult } from "./use-choropleth";

export type ChoroplethContextValue = {
  choropleth: UseChoroplethResult<unknown>;
  store: MapStore;
};

export const ChoroplethContext = createContext<ChoroplethContextValue | null>(null);

/**
 * Lee el estado del mapa. `TDatum` es solo una aserción de tipo para el consumidor (el contexto
 * no puede ser genérico): quien llama sabe qué `data` pasó a `Root`.
 */
export const useChoroplethContext = <TDatum = unknown>(): {
  choropleth: UseChoroplethResult<TDatum>;
  store: MapStore;
} => {
  const value = useContext(ChoroplethContext);
  if (value === null) {
    throw new Error(
      "[choropleth] Choropleth components (Svg, Regions, Legend…) must be rendered inside <Choropleth.Root>.",
    );
  }
  return value as unknown as { choropleth: UseChoroplethResult<TDatum>; store: MapStore };
};
