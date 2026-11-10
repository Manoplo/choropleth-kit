import { createContext, useContext, type RefObject } from "react";
import type { ChoroplethClassNames } from "./class-names";
import type { ChoroplethMapHandle } from "./handle";
import type { MapStore } from "./map-store";
import type { UseChoroplethResult } from "./use-choropleth";

export type ChoroplethContextValue = {
  choropleth: UseChoroplethResult<unknown>;
  store: MapStore;
  /** The camera: `<Choropleth.Viewport>` fills it in and `useZoom` (in `Svg`) reads it. */
  viewportRef: RefObject<SVGGElement | null>;
  /** The imperative handle (the same one obtained with `ref`). */
  api: ChoroplethMapHandle;
  /** The consumer's classes per piece (`classNames` of `Root`). Empty if there are none. */
  classNames: ChoroplethClassNames;
  /** Id (unique per map instance) of an SVG definition: `defId("hatch")`. */
  defId: (name: string) => string;
  /** Pattern of the regions without data (`emptyPattern` or the theme's). */
  emptyPattern: "hatch" | "dots" | null;
};

export const ChoroplethContext = createContext<ChoroplethContextValue | null>(null);

/**
 * Reads the map's state. `TDatum` is only a type assertion for the consumer (the context cannot be
 * generic): the caller knows which `data` was passed to `Root`.
 */
export const useChoroplethContext = <TDatum = unknown>(): {
  choropleth: UseChoroplethResult<TDatum>;
  store: MapStore;
  viewportRef: RefObject<SVGGElement | null>;
  api: ChoroplethMapHandle;
  classNames: ChoroplethClassNames;
  defId: (name: string) => string;
  emptyPattern: "hatch" | "dots" | null;
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
    classNames: ChoroplethClassNames;
    defId: (name: string) => string;
    emptyPattern: "hatch" | "dots" | null;
  };
};

/**
 * The imperative handle from INSIDE the compound: a button that is a child of
 * `<Choropleth.Root>` can call `zoomTo` without needing a `ref`.
 */
export const useChoroplethApi = (): ChoroplethMapHandle => useChoroplethContext().api;

/**
 * The id of an SVG definition (`<pattern>`, `<linearGradient>`, `<filter>`) of THIS map. With two maps
 * on the page, `url(#hatch)` would always point to the first one: ids carry a per-instance prefix
 * (`useId`). Use it to define your own inside `<Choropleth.Defs>` (`<pattern id={useDefId("stripes")}>`)
 * and to reference them: `fill="url(#…)"`. The built-in ones are `"hatch"` and `"dots"`.
 */
export const useDefId = (name: string): string => useChoroplethContext().defId(name);
