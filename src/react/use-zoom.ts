import { useEffect, useRef, type RefObject } from "react";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import {
  constrainTransform,
  createZoomFilter,
  toViewState,
  type Point,
  type ResolvedZoom,
  type ViewState,
} from "../core";
import { ROOT_LEVEL } from "./map-item";
import type { MapStore } from "./map-store";

export type UseZoomParams = {
  svgRef: RefObject<SVGSVGElement | null>;
  viewportRef: RefObject<SVGGElement | null>;
  /** El contenedor `.cm-root`: aquí se escriben `--cm-k` y los atributos `data-*`. */
  rootRef: RefObject<HTMLElement | null>;
  store: MapStore;
  /** Tamaño del lienzo (px). Si cambia, se reinstala el comportamiento y se restaura la cámara. */
  width: number;
  height: number;
  /** `null` = zoom desactivado. */
  options: ResolvedZoom | null;
  /** Para convertir la cámara en un `ViewState` geográfico. */
  invert: (point: Point) => Point | null;
  /** Se llama al TERMINAR un gesto; nunca por frame. */
  onViewChange: ((view: ViewState) => void) | undefined;
  /** Cuando pasa de «cargando» a «listo» aparece el `<svg>`: hay que volver a engancharse. */
  ready: boolean;
};

/** Por encima de esta `k` se considera que el mapa está «ampliado» (y por tanto arrastrable). */
const ZOOMED_EPSILON = 1.001;

/**
 * Engancha `d3-zoom` al `<svg>` (dd.md §11.1.3). Es la ÚNICA pieza que usa `d3-selection`.
 *
 * Reglas que hacen que esto sea fluido y que no se pelee con React:
 *  - **React nunca escribe el `transform` del viewport.** Lo escribe `d3-zoom` en cada frame con
 *    `setAttribute`. Si React lo escribiera, cualquier render (datos nuevos a mitad de un pan) lo
 *    pisaría y el mapa saltaría.
 *  - **Nada por frame en React**: ni `setState` en `zoom`. Por frame solo se escriben el atributo
 *    `transform`, `--cm-k` y `data-zoomed` en el DOM. El store se toca únicamente al EMPEZAR y al
 *    TERMINAR el gesto.
 *  - **Dependencias primitivas**: `zoom={{ max: 20 }}` en línea crea un objeto nuevo en cada render;
 *    si el efecto dependiera de él, se reinstalaría `d3-zoom` en cada render.
 */
export const useZoom = ({
  svgRef,
  viewportRef,
  rootRef,
  store,
  width,
  height,
  options,
  invert,
  onViewChange,
  ready,
}: UseZoomParams): void => {
  // Lo que cambia en cada render pero no debe reinstalar el comportamiento: se lee al usarlo.
  const latest = useRef({ invert, onViewChange });
  useEffect(() => {
    latest.current = { invert, onViewChange };
  });

  const enabled = options !== null;
  const { min, max, wheel, pinch, pan, doubleClick, constrain } = options ?? NO_ZOOM;

  // useEffect legítimo: suscripción a eventos del DOM con limpieza.
  useEffect(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    const root = rootRef.current;
    if (!enabled || !ready || svg === null || viewport === null || root === null) return;

    const size = { width, height };
    const content = [
      [0, 0],
      [width, height],
    ] as const;

    // `true` mientras se restaura la cámara al (re)instalar: no es un gesto, no debe avisar.
    let restoring = false;

    const behavior = zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([min, max])
      // `clickDistance` por defecto es 0: cualquier micro-temblor del ratón se come el clic.
      .clickDistance(4)
      .filter(
        createZoomFilter({
          wheel,
          pinch,
          pan,
          doubleClick,
          onGestureHint: (kind) => store.showGestureHint(kind),
        }) as (event: Event) => boolean,
      )
      .on("start", (event: { sourceEvent: Event | null }) => {
        // Solo gestos del usuario; un vuelo programático (`sourceEvent === null`) no «interactúa».
        if (event.sourceEvent !== null) store.setState({ interacting: true });
      })
      .on("zoom", ({ transform }: { transform: ZoomTransform }) => {
        // Por frame: tres escrituras en el DOM y ningún render de React.
        viewport.setAttribute("transform", transform.toString());
        root.style.setProperty("--cm-k", String(transform.k));
        // Idempotente: si ya estaba en ese estado, el DOM no cambia.
        root.toggleAttribute("data-zoomed", transform.k > ZOOMED_EPSILON);
      })
      .on("end", ({ transform }: { transform: ZoomTransform }) => {
        const camera = { k: transform.k, x: transform.x, y: transform.y };
        store.setState({ camera, interacting: false });
        if (restoring) return;
        latest.current.onViewChange?.(
          toViewState({
            transform: camera,
            size,
            invert: latest.current.invert,
            level: ROOT_LEVEL,
          }),
        );
      });

    if (constrain === "contain") {
      // El de d3 deja un mapa más pequeño que la vista pegado a una esquina; el nuestro lo centra.
      behavior.constrain((transform, extent) => {
        const c = constrainTransform({ transform, content, view: extent });
        return zoomIdentity.translate(c.x, c.y).scale(c.k);
      });
    }

    const selection = select(svg).call(behavior);
    // d3-zoom pone `touch-action: none`, que bloquea el scroll táctil de la página. En modo
    // cooperativo se devuelve, para que un dedo siga haciendo scroll.
    if (wheel === "cooperative") svg.style.touchAction = "pan-x pan-y";

    // Restaura la cámara confirmada (montaje, cambio de opciones o de tamaño) sin animación.
    const { k, x, y } = store.getState().camera;
    restoring = true;
    behavior.transform(selection, zoomIdentity.translate(x, y).scale(k));
    restoring = false;

    return () => {
      selection.on(".zoom", null);
      svg.style.removeProperty("touch-action");
      root.toggleAttribute("data-zoomed", false);
      store.setState({ interacting: false });
    };
  }, [
    svgRef,
    viewportRef,
    rootRef,
    store,
    enabled,
    ready,
    width,
    height,
    min,
    max,
    wheel,
    pinch,
    pan,
    doubleClick,
    constrain,
  ]);

  // El aviso de gesto tiene un temporizador propio: se cancela al desmontar.
  useEffect(() => () => store.dispose(), [store]);
};

/** Valores neutros cuando el zoom está desactivado (los hooks no pueden ser condicionales). */
const NO_ZOOM: ResolvedZoom = {
  min: 1,
  max: 1,
  wheel: "never",
  pinch: false,
  pan: false,
  doubleClick: false,
  constrain: "contain",
};
