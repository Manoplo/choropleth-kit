import { useEffect, useRef, type RefObject } from "react";
import { easeCubicInOut, easeCubicOut } from "d3-ease";
import { select } from "d3-selection";
// Importing d3-transition patches `selection.transition()`; it is needed for animated zooms.
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
  /** The `.cm-root` container: `--cm-k` and the `data-*` attributes are written here. */
  rootRef: RefObject<HTMLElement | null>;
  store: MapStore;
  /** Canvas size (px). If it changes, the behavior is reinstalled and the camera restored. */
  width: number;
  height: number;
  /** `null` = zoom disabled. */
  options: ResolvedZoom | null;
  /** To turn the camera into a geographic `ViewState`. */
  invert: (point: Point) => Point | null;
  /** [lon, lat] → CURRENT canvas pixels; with the previous canvas's `invert`, it preserves the view on resize. */
  project: (coordinates: Point) => Point | null;
  /** Called at the END of a gesture; never per frame. */
  onViewChange: ((view: ViewState) => void) | undefined;
  /** `ZoomTarget` → camera (already limited by `constrain`), or `null` if it cannot be resolved. */
  resolveCamera: (
    target: ZoomTarget,
    options?: { padding?: number | Padding },
  ) => CameraTransform | null;
  /** Flies to this region when it changes; `null` = back to the fit; the first value is placed without flying. */
  focusId: string | null | undefined;
  /** When it goes from "loading" to "ready" the `<svg>` appears: it has to hook up again. */
  ready: boolean;
};

/** Duration of the `+` / `−` buttons. */
const BUTTON_ZOOM_MS = 300;

/**
 * Is it a click or a tap on the region a drill in progress is flying to? (`data-drill-phase` and
 * `data-drill-target` are published by `Root` and `Regions`.)
 */
const isPressOnDrillTarget = (event: Event, root: HTMLElement): boolean => {
  if (event.type !== "mousedown" && event.type !== "touchstart") return false;
  const phase = root.getAttribute("data-drill-phase");
  if (phase !== "flying" && phase !== "loading") return false;
  const target = event.target;
  return target instanceof Element && target.closest("[data-drill-target]") !== null;
};

/** How many pixels the pointer can move and still count as a click (d3-zoom's `clickDistance`). */
const CLICK_DISTANCE_PX = 4;

/** Above this `k` the map is considered "zoomed in" (and therefore draggable). */
const ZOOMED_EPSILON = 1.001;

/**
 * Hooks `d3-zoom` to the `<svg>`. It is the ONLY piece that uses `d3-selection`.
 *
 * Rules that make this smooth and keep it from fighting React:
 *  - **React never writes the viewport's `transform`.** `d3-zoom` writes it every frame with
 *    `setAttribute`. If React wrote it, any render (new data mid-pan) would overwrite it and the map
 *    would jump.
 *  - **Nothing per frame in React**: no `setState` in `zoom`. Per frame only the `transform`
 *    attribute, `--cm-k` and `data-zoomed` are written to the DOM. The store is touched only at the
 *    START and END of the gesture.
 *  - **Primitive dependencies**: an inline `zoom={{ max: 20 }}` creates a new object on every render;
 *    if the effect depended on it, `d3-zoom` would be reinstalled on every render.
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
  // What changes on every render but must not reinstall the behavior: read at the time of use.
  const latest = useRef({ invert, project, onViewChange, resolveCamera });
  useEffect(() => {
    latest.current = { invert, project, onViewChange, resolveCamera };
  });
  // Size and projection of the previous canvas, and the REAL camera when the behavior is unmounted: with
  // them, a resize preserves the geographic center and `k`.
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

  // A legitimate useEffect: a DOM event subscription with cleanup.
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

    // `true` while the camera is being restored on (re)install: it is not a gesture, it must not notify.
    let restoring = false;

    // Inertia. `samples`: recent drag positions, to measure the release velocity.
    // `glide`: the inertia in progress (animated by a rAF; it goes through neither React nor the store
    // until it ends).
    let samples: CameraSample[] = [];
    let glide: { frame: number } | null = null;
    // The user gesture in progress: where it started, and whether it has already moved more than a click.
    let gesture = { k: 1, x: 0, y: 0, moving: false };
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

    const baseFilter = createZoomFilter({
      wheel,
      pinch,
      pan,
      doubleClick,
      onGestureHint: (kind) => store.showGestureHint(kind),
    }) as (event: Event) => boolean;

    const behavior = zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([min, max])
      // `clickDistance` is 0 by default: any tiny mouse tremor swallows the click.
      .clickDistance(CLICK_DISTANCE_PX)
      .filter((event: Event) => {
        // Pressing the region that is BEING FLOWN TO (a drill in progress) does not interrupt the flight:
        // d3-zoom interrupts on `mousedown`/`touchstart`, before knowing whether it is a drag or a plain
        // click, so a double click on the region would cancel and restart the drill (flicker and a double
        // `onDrill`). The wheel, a drag elsewhere or a tap outside still cut it short.
        if (isPressOnDrillTarget(event, root)) return false;
        return baseFilter(event);
      })
      .on("start", (event: { sourceEvent: Event | null; transform: ZoomTransform }) => {
        // User gestures only; a programmatic flight (`sourceEvent === null`) does not "interact".
        if (event.sourceEvent === null) return;
        stopGlide(); // grabbing the map stops the inertia
        samples = [];
        // `interacting` is NOT set here. d3-zoom emits `start` on `mousedown`, and `interacting` removes
        // pointer events from the regions (CSS): the `mouseup` would land on the <svg> and the browser would
        // send the `click` to the <svg>, not to the region, so NO click would ever reach the regions. It is set
        // as soon as the gesture really moves (see `zoom`), which is when it is no longer a click.
        gesture = {
          k: event.transform.k,
          x: event.transform.x,
          y: event.transform.y,
          moving: false,
        };
      })
      .on(
        "zoom",
        ({ transform, sourceEvent }: { transform: ZoomTransform; sourceEvent: Event | null }) => {
          // Per frame: four DOM writes and no React render.
          viewport.setAttribute("transform", transform.toString());
          root.style.setProperty("--cm-k", String(transform.k));
          root.style.setProperty(
            "--cm-bubble-scale",
            String(bubbleScale(transform.k, bubbleScaling)),
          );
          if (sourceEvent !== null && !gesture.moving) {
            // The wheel and pinch change `k`; a drag counts once it passes the click threshold.
            const moved =
              sourceEvent.type === "wheel" ||
              transform.k !== gesture.k ||
              Math.hypot(transform.x - gesture.x, transform.y - gesture.y) > CLICK_DISTANCE_PX;
            if (moved) {
              gesture.moving = true;
              store.setState({ interacting: true });
            }
          }
          if (sourceEvent !== null) {
            samples.push({
              time: performance.now(),
              k: transform.k,
              x: transform.x,
              y: transform.y,
            });
            if (samples.length > MAX_SAMPLES) samples.shift();
          }
          // Idempotent: if it was already in that state, the DOM does not change.
          root.toggleAttribute("data-zoomed", transform.k > ZOOMED_EPSILON);
        },
      )
      .on(
        "end",
        ({ transform, sourceEvent }: { transform: ZoomTransform; sourceEvent: Event | null }) => {
          // Inertia moves the camera with `behavior.transform` every frame: it is not a gesture end.
          if (glide !== null) return;
          // Releasing a fast drag: it keeps sliding and slows down (no inertia with "reduce motion").
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
      // d3's leaves a map smaller than the view stuck in a corner; ours centers it.
      behavior.constrain((transform, extent) => {
        const c = constrainTransform({ transform, content, view: extent });
        return zoomIdentity.translate(c.x, c.y).scale(c.k);
      });
    }

    // Programmatic flights (buttons, `resetView`) use the same curvature as `flyTo`.
    behavior.interpolate(createZoomInterpolator(DEFAULT_FLIGHT_CURVATURE));

    const selection = select(svg).call(behavior);
    // d3-zoom sets `touch-action: none`, which blocks the page's touch scrolling. In cooperative mode it
    // is given back, so one finger keeps scrolling.
    if (wheel === "cooperative") svg.style.touchAction = "pan-x pan-y";

    // Restores the camera (mount, options change or resize) without animation. If the size changed, the
    // pixels are no longer valid: the geographic center and `k` are preserved (`preserveView`) and it is
    // constrained again, because the new fit may leave that camera outside the edges.
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

    // Inertia: each frame takes the camera to `origin + (vx, vy)·τ·(1 − e^(−t/τ))` through the SAME
    // `behavior` (so `constrain` stops it at the edges). It ends when exhausted or on hitting a limit.
    const startGlide = (origin: ZoomTransform, [vx, vy]: Point) => {
      const start = performance.now();
      let last = origin;
      store.setState({ interacting: true });
      const step = () => {
        const elapsed = performance.now() - start;
        // `behavior.transform` does NOT apply `constrain` (it only does with gestures): it is applied by hand.
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
        // It stops when exhausted (< 0.5 px left to travel) or if a limit holds it (it does not move).
        if (remaining < GLIDE_STOP_PX || (elapsed > 0 && moved < 0.01)) {
          glide = null;
          commit(now, true);
          return;
        }
        glide = { frame: requestAnimationFrame(step) };
      };
      glide = { frame: requestAnimationFrame(step) };
    };
    // Any touch or click stops the inertia (d3-zoom will also stop it when its gesture starts).
    const onPointerDown = () => stopGlide();
    svg.addEventListener("pointerdown", onPointerDown);

    // Programmatic moves go through the SAME `behavior`: that way d3-zoom always knows the real camera
    // and a user gesture interrupts the flight naturally.
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
      fade?.cancel(); // a new move replaces any fade left half-done
      fade = null;
      stopGlide(); // and any inertia that was still sliding

      // `duration: 0` is explicit ("place it now"): no flight and no fade.
      if (duration <= 0) {
        restoring = silent;
        apply(selection);
        restoring = false;
        return Promise.resolve({ completed: true });
      }
      // "Reduce motion": a fade (opacity to 0, jump, opacity to 1) instead of a flight.
      if (prefersReducedMotion()) {
        fade = fadeThrough(viewport, () => apply(selection));
        return fade.promise;
      }
      const transition = selection.transition().duration(duration).ease(ease);
      apply(transition);
      // `end()` rejects if the transition is interrupted: it is not an error, it is `completed: false`.
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
      flyTo: (camera, { duration, silent } = {}) => {
        const length = duration ?? flightDuration({ from: current(), to: camera, size });
        return animate(
          length,
          (t) => behavior.transform(t as typeof selection, toZoomIdentity(camera)),
          {
            silent,
          },
        );
      },
      zoomBy: (factor, { duration = BUTTON_ZOOM_MS } = {}) =>
        animate(duration, (t) => behavior.scaleBy(t as typeof selection, factor), {
          ease: easeCubicOut,
        }),
      resetView: ({ duration, silent } = {}) => {
        const length = duration ?? flightDuration({ from: current(), to: FIT_TRANSFORM, size });
        return animate(length, (t) => behavior.transform(t as typeof selection, zoomIdentity), {
          silent,
        });
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
      // The REAL camera (also mid-flight or mid-inertia) and the canvas it was on.
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

  // `focusId` (and `initialView`): the first value is PLACED without flying or notifying; later changes
  // fly; `null` returns to the fit. It is a real effect (it moves the camera). It goes AFTER the one that
  // installs d3-zoom: within the same component effects run in order, and the registered API is needed here.
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
    // `initialView` only counts the first time: it is not a dependency.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [store, enabled, ready, focus]);

  // The gesture hint has its own timer: it is cancelled on unmount.
  useEffect(() => () => store.dispose(), [store]);
};

/** How many position samples are kept to measure the release velocity. */
const MAX_SAMPLES = 12;

/** The inertia is considered finished when fewer px than this remain to travel. */
const GLIDE_STOP_PX = 0.5;

const UNSET = Symbol("unset");

/** Neutral values when zoom is disabled (hooks cannot be conditional). */
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
