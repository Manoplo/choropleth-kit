import { useEffect, useRef, type RefObject } from "react";
import { easeCubicInOut, easeCubicOut } from "d3-ease";
import { select } from "d3-selection";
// Importar d3-transition parchea `selection.transition()`; hace falta para los zooms animados.
import "d3-transition";
import { zoom, zoomIdentity, zoomTransform, type ZoomTransform } from "d3-zoom";
import {
  constrainTransform,
  createZoomFilter,
  createZoomInterpolator,
  DEFAULT_FLIGHT_CURVATURE,
  flightDuration,
  FIT_TRANSFORM,
  toViewState,
  type CameraTransform,
  type Padding,
  type Point,
  type ResolvedZoom,
  type TransitionResult,
  type ViewState,
  type ZoomTarget,
} from "../core";
import { isProduction, prefersReducedMotion } from "./env";
import { fadeThrough, type Fade } from "./fade";
import { ROOT_LEVEL } from "./map-item";
import type { MapStore, ZoomApi } from "./map-store";

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
  /** `ZoomTarget` → cámara (ya limitada por `constrain`), o `null` si no se puede resolver. */
  resolveCamera: (
    target: ZoomTarget,
    options?: { padding?: number | Padding },
  ) => CameraTransform | null;
  /** Vuela a esta región cuando cambia; `null` = vuelve al encaje; el primer valor se coloca sin volar. */
  focusId: string | null | undefined;
  /** Cuando pasa de «cargando» a «listo» aparece el `<svg>`: hay que volver a engancharse. */
  ready: boolean;
};

/** Duración de los botones `+` / `−` (dd.md §11.1.2). */
const BUTTON_ZOOM_MS = 300;

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
  resolveCamera,
  focusId,
  ready,
}: UseZoomParams): void => {
  // Lo que cambia en cada render pero no debe reinstalar el comportamiento: se lee al usarlo.
  const latest = useRef({ invert, onViewChange, resolveCamera });
  useEffect(() => {
    latest.current = { invert, onViewChange, resolveCamera };
  });

  const enabled = options !== null;
  const { min, max, wheel, pinch, pan, doubleClick, constrain, initialView } = options ?? NO_ZOOM;

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

    // Los vuelos programáticos (botones, `resetView`) usan la misma curvatura que dd.md §11.1.5.
    behavior.interpolate(createZoomInterpolator(DEFAULT_FLIGHT_CURVATURE));

    const selection = select(svg).call(behavior);
    // d3-zoom pone `touch-action: none`, que bloquea el scroll táctil de la página. En modo
    // cooperativo se devuelve, para que un dedo siga haciendo scroll.
    if (wheel === "cooperative") svg.style.touchAction = "pan-x pan-y";

    // Restaura la cámara confirmada (montaje, cambio de opciones o de tamaño) sin animación.
    const { k, x, y } = store.getState().camera;
    restoring = true;
    behavior.transform(selection, zoomIdentity.translate(x, y).scale(k));
    restoring = false;

    // Movimientos programáticos por el MISMO `behavior`: así d3-zoom siempre conoce la cámara real y
    // un gesto del usuario interrumpe el vuelo de forma natural (dd.md §11.1.3, punto 4).
    let fade: Fade | null = null;
    type Target = typeof selection | ReturnType<typeof selection.transition>;

    const animate = (
      duration: number,
      apply: (target: Target) => void,
      {
        ease = easeCubicInOut,
        silent = false,
      }: { ease?: (t: number) => number; silent?: boolean } = {},
    ): Promise<TransitionResult> => {
      fade?.cancel(); // un movimiento nuevo sustituye al fundido que quedara a medias
      fade = null;

      // `duration: 0` es explícito («colócala ya»): ni vuelo ni fundido.
      if (duration <= 0) {
        restoring = silent;
        apply(selection);
        restoring = false;
        return Promise.resolve({ completed: true });
      }
      // «Reducir movimiento»: fundido (opacidad a 0, salto, opacidad a 1) en lugar de vuelo.
      if (prefersReducedMotion()) {
        fade = fadeThrough(viewport, () => apply(selection));
        return fade.promise;
      }
      const transition = selection.transition().duration(duration).ease(ease);
      apply(transition);
      // `end()` rechaza si la transición se interrumpe: no es un error, es `completed: false`.
      return transition.end().then(
        () => ({ completed: true }),
        () => ({ completed: false }),
      );
    };

    const toZoomIdentity = ({ k, x, y }: CameraTransform) => zoomIdentity.translate(x, y).scale(k);
    const current = (): CameraTransform => {
      const { k, x, y } = zoomTransform(svg);
      return { k, x, y };
    };

    const api: ZoomApi = {
      zoomTo: (target, { duration, padding, silent } = {}) => {
        const destination = latest.current.resolveCamera(target, { padding });
        if (destination === null) {
          if (!isProduction()) {
            console.warn(
              `[choropleth] zoomTo: could not resolve ${JSON.stringify(target)} (unknown region id, or a point outside the projection).`,
            );
          }
          return Promise.resolve({ completed: false });
        }
        const length = duration ?? flightDuration({ from: current(), to: destination, size });
        return animate(
          length,
          (t) => behavior.transform(t as typeof selection, toZoomIdentity(destination)),
          {
            silent,
          },
        );
      },
      zoomBy: (factor, { duration = BUTTON_ZOOM_MS } = {}) =>
        animate(duration, (t) => behavior.scaleBy(t as typeof selection, factor), {
          ease: easeCubicOut,
        }),
      resetView: ({ duration } = {}) => {
        const length = duration ?? flightDuration({ from: current(), to: FIT_TRANSFORM, size });
        return animate(length, (t) => behavior.transform(t as typeof selection, zoomIdentity));
      },
      getView: () =>
        toViewState({
          transform: current(),
          size,
          invert: latest.current.invert,
          level: ROOT_LEVEL,
        }),
    };
    store.registerZoom(api);

    return () => {
      fade?.cancel();
      store.registerZoom(null);
      selection.interrupt();
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

  // `focusId` (y `initialView`): el primer valor se COLOCA sin volar ni avisar; los cambios posteriores
  // vuelan; `null` vuelve al encaje. Es un efecto real (mueve la cámara). Va DESPUÉS del que instala
  // d3-zoom: en el mismo componente los efectos corren en orden, y aquí hace falta la API registrada.
  const applied = useRef<string | null | typeof UNSET>(UNSET);
  const focus = focusId ?? null;
  useEffect(() => {
    if (!enabled || !ready) return;
    const api = store.getZoom();
    if (api === null) return;

    if (applied.current === UNSET) {
      applied.current = focus;
      const first = focus ?? initialView;
      if (first !== undefined && first !== null)
        void api.zoomTo(first, { duration: 0, silent: true });
      return;
    }
    if (focus === applied.current) return;
    applied.current = focus;
    if (focus === null) void api.resetView();
    else void api.zoomTo(focus);
    // `initialView` solo cuenta la primera vez: no es una dependencia.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store, enabled, ready, focus]);

  // El aviso de gesto tiene un temporizador propio: se cancela al desmontar.
  useEffect(() => () => store.dispose(), [store]);
};

const UNSET = Symbol("unset");

/** Valores neutros cuando el zoom está desactivado (los hooks no pueden ser condicionales). */
const NO_ZOOM: ResolvedZoom = {
  min: 1,
  max: 1,
  wheel: "never",
  pinch: false,
  pan: false,
  doubleClick: false,
  constrain: "contain",
  keyboard: false,
  padding: 0,
  initialView: undefined,
};
