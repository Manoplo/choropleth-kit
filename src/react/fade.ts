import type { TransitionResult } from "../core";

/** Duraciones del fundido de «reducir movimiento» (dd.md §11.1.5), en ms. */
export const FADE_OUT_MS = 100;
export const FADE_IN_MS = 150;

export type Fade = {
  /** Resuelve `completed: true` al terminar el fundido de entrada; `false` si se canceló. */
  promise: Promise<TransitionResult>;
  /** Cancela lo que quede. Si aún no se había saltado, la cámara no llega a moverse. */
  cancel: () => void;
};

/**
 * Cambio de cámara SIN movimiento y SIN corte seco (dd.md §11.1.5: «un corte seco desorienta»):
 * opacidad a 0 en 100 ms, **salto** de cámara, opacidad a 1 en 150 ms. Se quita el movimiento, no la
 * continuidad.
 *
 * Usa la Web Animations API nativa (dd.md §12.6: sin librerías de animación) sobre el elemento, sin
 * pasar por React. Si el entorno no la tiene (jsdom, navegadores muy viejos), salta directamente.
 */
export const fadeThrough = (element: Element, jump: () => void): Fade => {
  if (typeof element.animate !== "function") {
    jump();
    return { promise: Promise.resolve({ completed: true }), cancel: () => {} };
  }

  const animations: Animation[] = [];
  const out = element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_OUT_MS,
    fill: "forwards",
  });
  animations.push(out);

  const promise = out.finished
    .then(() => {
      jump();
      const back = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS });
      animations.push(back);
      // La de salida mantenía la opacidad en 0 (`fill: forwards`); la de entrada ya empieza en 0.
      out.cancel();
      return back.finished;
    })
    // `finished` rechaza si se cancela: no es un error, es una interrupción.
    .then(
      (): TransitionResult => ({ completed: true }),
      (): TransitionResult => ({ completed: false }),
    );

  return { promise, cancel: () => animations.forEach((animation) => animation.cancel()) };
};
