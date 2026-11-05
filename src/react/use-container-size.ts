import { useEffect, useRef, useState, type RefObject } from "react";

export type ContainerSize = { width: number; height: number };

export type UseContainerSizeOptions = {
  /** Tamaño mientras no hay medida (primer render, SSR, jsdom). Por defecto 960 × 500. */
  initial?: ContainerSize;
  /** ancho / alto. Por defecto 960 / 500, la proporción del mundo en Equal Earth. */
  aspectRatio?: number;
  /**
   * Usar el alto REAL del contenedor (que debe tener altura propia, p. ej. `height: 400px`).
   * Por defecto el alto se deriva del ancho: si el `<svg>` fijara la altura de un contenedor sin
   * altura propia, al estrecharlo el alto no bajaría nunca y el mapa perdería su proporción.
   */
  useContainerHeight?: boolean;
};

const DEFAULT_SIZE: ContainerSize = { width: 960, height: 500 };

/**
 * Mide un elemento con `ResizeObserver`. Observar el DOM es un efecto
 * secundario real, así que `useEffect` es lo correcto aquí; lo que se pueda derivar se deriva al renderizar.
 *
 * Nunca devuelve 0: un contenedor oculto o aún sin medir daría `width = 0` y `createProjection`
 * lanza error con tamaños no positivos. Mientras no haya una medida válida se mantiene la anterior.
 */
export const useContainerSize = <T extends HTMLElement = HTMLDivElement>({
  initial = DEFAULT_SIZE,
  aspectRatio = DEFAULT_SIZE.width / DEFAULT_SIZE.height,
  useContainerHeight = false,
}: UseContainerSizeOptions = {}): ContainerSize & { ref: RefObject<T | null> } => {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ContainerSize>(initial);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (!(width > 0)) return;
      const nextHeight = useContainerHeight && height > 0 ? height : width / aspectRatio;
      setSize((prev) =>
        prev.width === width && prev.height === nextHeight ? prev : { width, height: nextHeight },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspectRatio, useContainerHeight]);

  return { ref, ...size };
};
