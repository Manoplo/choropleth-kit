import { useEffect, useRef, useState, type RefObject } from "react";

export type ContainerSize = { width: number; height: number };

export type UseContainerSizeOptions = {
  /** Size while there is no measurement (first render, SSR, jsdom). 960 wide by default. */
  initial?: ContainerSize;
  /** width / height. 960 / 500 by default, the world's proportion in Equal Earth. */
  aspectRatio?: number;
  /**
   * Use the container's REAL height (which must have its own height, e.g. `height: 400px`).
   * By default the height is derived from the width: if the `<svg>` set the height of a container with no
   * height of its own, narrowing it would never lower the height and the map would lose its proportion.
   */
  useContainerHeight?: boolean;
};

const DEFAULT_WIDTH = 960;
const DEFAULT_ASPECT_RATIO = 960 / 500;

/**
 * Measures an element with `ResizeObserver`. Observing the DOM is a real side effect, so `useEffect`
 * is the right tool here; whatever can be derived is derived while rendering.
 *
 * Only what was MEASURED is stored (real width and height); the height that comes from the ratio is
 * computed while rendering. That way, if `aspectRatio` changes (e.g. `"auto"` when the geometry
 * finishes loading) the height is corrected without waiting for another measurement.
 *
 * It never returns 0: a hidden or not-yet-measured container would give `width = 0` and
 * `createProjection` throws on non-positive sizes. Until there is a valid measurement the previous one is kept.
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
