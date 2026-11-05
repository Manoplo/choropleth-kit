import type { ViewState } from "./camera";

/**
 * Opciones de zoom y pan (dd.md §11.1.1). Aquí solo van las que ya hacen algo; `controls`,
 * `keyboard`, `inertia`, `padding` e `initialView` se añaden en los pasos 25-27 con su
 * comportamiento (declararlas antes sería prometer lo que no existe).
 */
export type ZoomOptions = {
  /** Escala mínima relativa al encaje del nivel (1 = no se puede alejar más que el encaje). Default 1. */
  min?: number;
  /** Escala máxima. Default 12. */
  max?: number;
  /**
   * Qué hace la rueda sobre el mapa. Default `"always"`: con el ratón encima, la rueda hace zoom.
   *  - `"cooperative"`: solo con Ctrl/⌘ + rueda (y táctil con dos dedos); la página sigue
   *    haciendo scroll. Recomendado para mapas dentro de una página larga o un dashboard.
   *  - `"never"`: la rueda no hace zoom (se puede seguir arrastrando y pellizcando).
   *
   * ⚠️ Con `"always"`, un mapa en una página con scroll se «come» la rueda al pasar por encima
   * (_scroll-jacking_). dd.md §11.1.1 propone `"cooperative"` como default; aquí se eligió `"always"`.
   */
  wheel?: "cooperative" | "always" | "never";
  /** Pellizco con dos dedos. Default `true`. (El pellizco de trackpad llega como Ctrl + rueda.) */
  pinch?: boolean;
  /** Arrastrar para desplazar. Default `true`. */
  pan?: boolean;
  /**
   * Doble clic / doble toque = zoom ×2. `"auto"` (default): activo salvo que el clic tenga otro
   * significado (`onItemClick` o selección), para no hacer las dos cosas a la vez.
   */
  doubleClick?: boolean | "auto";
  /** `"contain"` (default): el contenido no se pierde y se centra si cabe. `"free"`: sin límites. */
  constrain?: "contain" | "free";
  /** Al TERMINAR cada gesto (nunca por frame). Con vuelos programáticos, al terminar el vuelo. */
  onViewChange?: (view: ViewState) => void;
};

export type ResolvedZoom = {
  min: number;
  max: number;
  wheel: "cooperative" | "always" | "never";
  pinch: boolean;
  pan: boolean;
  /** Ya resuelto: `"auto"` pasa a `true`/`false` según si el clic tiene otro significado. */
  doubleClick: boolean;
  constrain: "contain" | "free";
};

export const DEFAULT_ZOOM_MIN = 1;
export const DEFAULT_ZOOM_MAX = 12;

/**
 * `zoom` (la prop) → opciones completas, o `null` si el zoom está desactivado (`zoom={false}`).
 * `clickIsBusy`: el clic ya hace algo (`onItemClick`, selección), para resolver `doubleClick: "auto"`.
 */
export const resolveZoomOptions = (
  zoom: boolean | ZoomOptions | undefined,
  { clickIsBusy }: { clickIsBusy: boolean },
): ResolvedZoom | null => {
  if (zoom === false) return null;
  const options = zoom === true || zoom === undefined ? {} : zoom;
  const { min = DEFAULT_ZOOM_MIN, max = DEFAULT_ZOOM_MAX } = options;
  if (!(min > 0) || !Number.isFinite(max) || max < min) {
    throw new Error(
      `[choropleth] zoom: "min" must be > 0 and "max" must be finite and ≥ "min" (received: min = ${min}, max = ${max}).`,
    );
  }
  const { doubleClick = "auto" } = options;
  return {
    min,
    max,
    wheel: options.wheel ?? "always",
    pinch: options.pinch ?? true,
    pan: options.pan ?? true,
    doubleClick: doubleClick === "auto" ? !clickIsBusy : doubleClick,
    constrain: options.constrain ?? "contain",
  };
};

/** Lo mínimo que el filtro necesita de un evento del DOM (así se prueba sin DOM). */
export type ZoomEventLike = {
  type: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  button?: number;
  touches?: { length: number };
};

export type ZoomFilterParams = Pick<ResolvedZoom, "wheel" | "pinch" | "pan" | "doubleClick"> & {
  /** Se llama cuando un gesto NO hace zoom pero se le puede enseñar cómo (aviso de Ctrl/⌘ + rueda). */
  onGestureHint?: (kind: "wheel" | "touch") => void;
};

/**
 * Qué eventos activan el zoom (dd.md §11.1.2). Sustituye al filtro por defecto de d3-zoom, que es
 * `(!ctrlKey || type === "wheel") && !button`.
 *
 * Devolver `false` NO llama a `preventDefault`: en `cooperative` la rueda sin modificador y el
 * toque con un dedo siguen haciendo scroll de la página.
 */
export const createZoomFilter =
  ({ wheel, pinch, pan, doubleClick, onGestureHint }: ZoomFilterParams) =>
  (event: ZoomEventLike): boolean => {
    switch (event.type) {
      case "wheel": {
        if (wheel === "never") return false;
        if (wheel === "always" || event.ctrlKey === true || event.metaKey === true) return true;
        onGestureHint?.("wheel"); // no hace zoom, pero enseña cómo
        return false;
      }
      case "touchstart": {
        const multi = (event.touches?.length ?? 0) >= 2;
        if (multi) return pinch || pan; // dos dedos: pellizco y desplazamiento a la vez
        if (wheel === "cooperative") {
          onGestureHint?.("touch");
          return false; // un dedo = scroll de la página
        }
        return pan;
      }
      case "dblclick":
        return doubleClick;
      case "mousedown":
        return pan && !event.button; // solo el botón principal
      default:
        return !event.button;
    }
  };
