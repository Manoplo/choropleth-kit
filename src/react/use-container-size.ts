import { useEffect, useRef, useState, type RefObject } from "react";

export type ContainerSize = { width: number; height: number };

export type UseContainerSizeOptions = {
  /** Tamaño mientras no hay medida (primer render, SSR, jsdom). Por defecto 960 de ancho. */
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

const DEFAULT_WIDTH = 960;
const DEFAULT_ASPECT_RATIO = 960 / 500;

/**
 * Mide un elemento con `ResizeObserver`. Observar el DOM es un efecto
 * secundario real, así que `useEffect` es lo correcto aquí; lo que se pueda derivar se deriva al renderizar.
 *
 * Solo se guarda lo MEDIDO (ancho y alto real); el alto que sale de la proporción se calcula al
 * renderizar. Así, si `aspectRatio` cambia (p. ej. `"auto"` cuando termina de cargar la geometría)
 * el alto se corrige sin esperar a otra medida.
 *
 * Nunca devuelve 0: un contenedor oculto o aún sin medir daría `width = 0` y `createProjection`
 * lanza error con tamaños no positivos. Mientras no haya una medida válida se mantiene la anterior.
 */
export const useContainerSize = <T extends HTMLElement = HTMLDivElement>({
  initial,
  aspectRatio = DEFAULT_ASPECT_RATIO,
  useContainerHeight = false,
}: UseContainerSizeOptions = {}): ContainerSize & { ref: RefObject<T | null> } => {
  const ref = useRef<T | null>(null);
  const [measured, setMeasured] = useState<ContainerSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (!(width > 0)) return;
      setMeasured((prev) =>
        prev?.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (measured === null) {
    return { ref, ...(initial ?? { width: DEFAULT_WIDTH, height: DEFAULT_WIDTH / aspectRatio }) };
  }
  const height =
    useContainerHeight && measured.height > 0 ? measured.height : measured.width / aspectRatio;
  return { ref, width: measured.width, height };
};
