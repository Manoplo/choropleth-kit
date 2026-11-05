import type { ViewState } from "./camera";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type ZoomControlsOptions = {
  /** Esquina del mapa. Por defecto `"bottom-right"` (la leyenda va por defecto abajo a la izquierda). */
  position?: Corner;
  /** Mostrar el botón «restablecer vista». Por defecto `true`. */
  reset?: boolean;
};

/** Resultado de un movimiento de cámara animado: `completed` es `false` si algo lo interrumpió. */
export type TransitionResult = { completed: boolean };

/**
 * Opciones de zoom y pan (dd.md §11.1.1). Aquí solo van las que ya hacen algo; `inertia`, `padding`
 * e `initialView` se añaden en los pasos 26-27 con su comportamiento (declararlas antes sería
 * prometer lo que no existe).
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
  /** Atajos de teclado con el mapa enfocado: `+`, `−` y `0`. Default `true`. */
  keyboard?: boolean;
  /**
   * Botones `+` / `−` / `⟲`. **Opt-in** (default `false`): `true` o `{ position, reset }`. Los dibuja el
   * preset; con el compound, pon `<Choropleth.ZoomControls>` donde quieras.
   */
  controls?: boolean | ZoomControlsOptions;
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
  keyboard: boolean;
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
    keyboard: options.keyboard ?? true,
  };
};

/** `zoom.controls` → qué dibujar, o `null` si no hay controles (el default). */
export const resolveControls = (
  zoom: boolean | ZoomOptions | undefined,
): Required<ZoomControlsOptions> | null => {
  if (typeof zoom !== "object" || zoom.controls === undefined || zoom.controls === false) {
    return null;
  }
  const options = zoom.controls === true ? {} : zoom.controls;
  return { position: options.position ?? "bottom-right", reset: options.reset ?? true };
};

export type ZoomKeyAction = "in" | "out" | "reset";

/**
 * Qué hace una tecla sobre el mapa enfocado: `+` acerca, `−` aleja, `0` vuelve al encaje.
 *
 * Con Ctrl, ⌘ o Alt NO se interpreta: Ctrl/⌘ + `+`, `−`, `0` es el zoom de la página del navegador, y
 * quitárselo al usuario sería un fallo de accesibilidad.
 */
export const zoomKeyAction = (event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): ZoomKeyAction | null => {
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return null;
  switch (event.key) {
    case "+":
    case "=": // la misma tecla que `+` en un teclado US, sin Shift
      return "in";
    case "-":
    case "_":
      return "out";
    case "0":
      return "reset";
    default:
      return null;
  }
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
