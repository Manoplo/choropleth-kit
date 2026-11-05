import { createContext, useContext } from "react";
import type { PointerStore } from "./pointer-store";
import type { UseChoroplethResult } from "./use-choropleth";

export type ChoroplethContextValue = {
  choropleth: UseChoroplethResult<unknown>;
  pointer: PointerStore;
};

export const ChoroplethContext = createContext<ChoroplethContextValue | null>(null);

/**
 * Lee el estado del mapa. `TDatum` es solo una aserción de tipo para el consumidor (el contexto
 * no puede ser genérico): quien llama sabe qué `data` pasó a `Root`.
 */
export const useChoroplethContext = <TDatum = unknown>(): {
  choropleth: UseChoroplethResult<TDatum>;
  pointer: PointerStore;
} => {
  const value = useContext(ChoroplethContext);
  if (value === null) {
    throw new Error(
      "Los componentes de Choropleth (Svg, Regions, Legend…) deben ir dentro de <Choropleth.Root>.",
    );
  }
  return value as unknown as { choropleth: UseChoroplethResult<TDatum>; pointer: PointerStore };
};
