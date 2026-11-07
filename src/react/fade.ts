import type { TransitionResult } from "../core";

/** Durations of the "reduce motion" fade (dd.md §11.1.5), in ms. */
export const FADE_OUT_MS = 100;
export const FADE_IN_MS = 150;

export type Fade = {
  /** Resolves `completed: true` when the fade-in ends; `false` if it was cancelled. */
  promise: Promise<TransitionResult>;
  /** Cancels whatever remains. If the jump had not happened yet, the camera never moves. */
  cancel: () => void;
};

/**
 * Camera change WITHOUT motion and WITHOUT a hard cut (dd.md §11.1.5: "a hard cut disorients"):
 * opacity to 0 in 100 ms, camera **jump**, opacity to 1 in 150 ms. Motion is removed, not continuity.
 *
 * It uses the native Web Animations API (dd.md §12.6: no animation libraries) on the element, without
 * going through React. If the environment lacks it (jsdom, very old browsers), it jumps directly.
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
      // The fade-out kept opacity at 0 (`fill: forwards`); the fade-in already starts at 0.
      out.cancel();
      return back.finished;
    })
    // `finished` rejects if cancelled: it is not an error, it is an interruption.
    .then(
      (): TransitionResult => ({ completed: true }),
      (): TransitionResult => ({ completed: false }),
    );

  return { promise, cancel: () => animations.forEach((animation) => animation.cancel()) };
};
