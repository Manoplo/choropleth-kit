import { useEffect, useRef, type RefObject } from "react";
import { easeCubicInOut, easeCubicOut } from "d3-ease";
import { select } from "d3-selection";
// Importar d3-transition parchea `selection.transition()`; hace falta para los zooms animados.
import "d3-transition";
import { zoom, zoomIdentity, zoomTransform, type ZoomTransform } from "d3-zoom";
import {
  bubbleScale,
  constrainTransform,
  createZoomFilter,
  createZoomInterpolator,
  DEFAULT_FLIGHT_CURVATURE,
  flightDuration,
  FIT_TRANSFORM,
  inertiaOffset,
  INERTIA_TAU_MS,
  preserveView,
  releaseVelocity,
  toViewState,
  type CameraSample,
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
  /** [lon, lat] → píxeles del lienzo ACTUAL; con `invert` del lienzo anterior, conserva la vista al redimensionar. */
  project: (coordinates: Point) => Point | null;
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
  project,
  onViewChange,
  resolveCamera,
  focusId,
  ready,
}: UseZoomParams): void => {
  // Lo que cambia en cada render pero no debe reinstalar el comportamiento: se lee al usarlo.
  const latest = useRef({ invert, project, onViewChange, resolveCamera });
  useEffect(() => {
    latest.current = { invert, project, onViewChange, resolveCamera };
  });
  // Tamaño y proyección del lienzo anterior, y la cámara REAL al desmontar el comportamiento: con
  // ellos, un cambio de tamaño conserva el centro geográfico y la `k` (dd.md §11.1.3, punto 2).
  const previous = useRef<{
    size: { width: number; height: number };
    invert: (point: Point) => Point | null;
    camera: CameraTransform;
  } | null>(null);

  const enabled = options !== null;
  const {
    min,
    max,
    wheel,
    pinch,
    pan,
    doubleClick,
    constrain,
    initialView,
    bubbleScaling,
    inertia,
  } = options ?? NO_ZOOM;

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

    // Inercia (dd.md §11.1.4). `samples`: posiciones recientes del arrastre, para medir la velocidad
    // de suelta. `glide`: la inercia en curso (la anima un rAF; no pasa por React ni por el store
    // hasta que termina).
    let samples: CameraSample[] = [];
    let glide: { frame: number } | null = null;
    const commit = (transform: ZoomTransform, notify: boolean) => {
      const camera = { k: transform.k, x: transform.x, y: transform.y };
      store.setState({ camera, interacting: false });
      if (!notify) return;
      latest.current.onViewChange?.(
        toViewState({
          transform: camera,
          size,
          invert: latest.current.invert,
          level: ROOT_LEVEL,
        }),
      );
    };
    const stopGlide = () => {
      if (glide === null) return;
      cancelAnimationFrame(glide.frame);
      glide = null;
      commit(zoomTransform(svg), true);
    };

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
        if (event.sourceEvent === null) return;
        stopGlide(); // agarrar el mapa frena la inercia
        samples = [];
        store.setState({ interacting: true });
      })
      .on(
        "zoom",
        ({ transform, sourceEvent }: { transform: ZoomTransform; sourceEvent: Event | null }) => {
          // Por frame: cuatro escrituras en el DOM y ningún render de React.
          viewport.setAttribute("transform", transform.toString());
          root.style.setProperty("--cm-k", String(transform.k));
          root.style.setProperty(
            "--cm-bubble-scale",
            String(bubbleScale(transform.k, bubbleScaling)),
          );
          if (sourceEvent !== null) {
            samples.push({
              time: performance.now(),
              k: transform.k,
              x: transform.x,
              y: transform.y,
            });
            if (samples.length > MAX_SAMPLES) samples.shift();
          }
          // Idempotente: si ya estaba en ese estado, el DOM no cambia.
          root.toggleAttribute("data-zoomed", transform.k > ZOOMED_EPSILON);
        },
      )
      .on(
        "end",
        ({ transform, sourceEvent }: { transform: ZoomTransform; sourceEvent: Event | null }) => {
          // La inercia mueve la cámara con `behavior.transform` en cada frame: no es un fin de gesto.
          if (glide !== null) return;
          // Soltar un arrastre rápido: sigue deslizándose y frena (sin inercia con «reducir movimiento»).
          const velocity =
            inertia && sourceEvent !== null && !restoring && !prefersReducedMotion()
              ? releaseVelocity({ samples, now: performance.now() })
              : null;
          samples = [];
          if (velocity !== null) {
            store.setState({ camera: { k: transform.k, x: transform.x, y: transform.y } });
            startGlide(transform, velocity);
            return;
          }
          commit(transform, !restoring);
        },
      );

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

    // Restaura la cámara (montaje, cambio de opciones o de tamaño) sin animación. Si cambió el tamaño,
    // los píxeles ya no valen: se conserva el centro geográfico y la `k` (`preserveView`) y se vuelve
    // a limitar, porque el encaje nuevo puede dejar esa cámara fuera de los bordes.
    let restored: CameraTransform = store.getState().camera;
    const before = previous.current;
    if (before !== null && (before.size.width !== width || before.size.height !== height)) {
      const moved = preserveView({
        transform: before.camera,
        oldSize: before.size,
        newSize: size,
        invertOld: before.invert,
        projectNew: latest.current.project,
      });
      restored =
        constrain === "contain"
          ? constrainTransform({ transform: moved, content, view: content })
          : moved;
    }
    restoring = true;
    behavior.transform(selection, zoomIdentity.translate(restored.x, restored.y).scale(restored.k));
    restoring = false;
    previous.current = null;

    // La inercia: cada frame lleva la cámara a `origen + (vx, vy)·τ·(1 − e^(−t/τ))` por el MISMO
    // `behavior` (así `constrain` la frena en los bordes). Termina al agotarse o al chocar con un límite.
    const startGlide = (origin: ZoomTransform, [vx, vy]: Point) => {
      const start = performance.now();
      let last = origin;
      store.setState({ interacting: true });
      const step = () => {
        const elapsed = performance.now() - start;
        // `behavior.transform` NO aplica `constrain` (solo lo hace con gestos): se aplica a mano.
        const wanted = {
          k: origin.k,
          x: origin.x + inertiaOffset({ velocity: vx, elapsed }),
          y: origin.y + inertiaOffset({ velocity: vy, elapsed }),
        };
        const next =
          constrain === "contain"
            ? constrainTransform({ transform: wanted, content, view: content })
            : wanted;
        behavior.transform(selection, zoomIdentity.translate(next.x, next.y).scale(next.k));
        const now = zoomTransform(svg);
        const moved = Math.hypot(now.x - last.x, now.y - last.y);
        last = now;
        const remaining = Math.hypot(vx, vy) * INERTIA_TAU_MS * Math.exp(-elapsed / INERTIA_TAU_MS);
        // Frena al agotarse (< 0,5 px por recorrer) o si un límite la detiene (no se mueve).
        if (remaining < GLIDE_STOP_PX || (elapsed > 0 && moved < 0.01)) {
          glide = null;
          commit(now, true);
          return;
        }
        glide = { frame: requestAnimationFrame(step) };
      };
      glide = { frame: requestAnimationFrame(step) };
    };
    // Cualquier toque o clic frena la inercia (d3-zoom también la frenará al empezar su gesto).
    const onPointerDown = () => stopGlide();
    svg.addEventListener("pointerdown", onPointerDown);

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
      stopGlide(); // y a la inercia que siguiera deslizándose

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
      // La cámara REAL (también a mitad de un vuelo o de una inercia) y el lienzo en que estaba.
      const live = zoomTransform(svg);
      previous.current = {
        size,
        invert: latest.current.invert,
        camera: { k: live.k, x: live.x, y: live.y },
      };
      svg.removeEventListener("pointerdown", onPointerDown);
      if (glide !== null) cancelAnimationFrame(glide.frame);
      glide = null;
      fade?.cancel();
      store.registerZoom(null);
      selection.interrupt();
      selection.on(".zoom", null);
      svg.style.removeProperty("touch-action");
      root.toggleAttribute("data-zoomed", false);
      root.style.removeProperty("--cm-bubble-scale");
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
    bubbleScaling,
    inertia,
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

/** Cuántas muestras de posición se guardan para medir la velocidad de suelta. */
const MAX_SAMPLES = 12;

/** La inercia se da por terminada cuando le quedan menos px que estos por recorrer. */
const GLIDE_STOP_PX = 0.5;

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
  bubbleScaling: "sqrt",
  inertia: false,
  keyboard: false,
  padding: 0,
  initialView: undefined,
};
