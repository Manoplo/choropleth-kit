import { fadeThrough, FADE_IN_MS, FADE_OUT_MS } from "./fade";

// Un `Element.animate` falso donde el test decide cuándo termina cada animación.
type FakeAnimation = {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
  cancel: () => void;
  cancelled: boolean;
  finished: Promise<unknown>;
};

const fakeElement = () => {
  const animations: FakeAnimation[] = [];
  const element = {
    animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      let resolve: () => void = () => {};
      let reject: (reason: unknown) => void = () => {};
      const finished = new Promise<unknown>((res, rej) => {
        resolve = () => res(undefined);
        reject = rej;
      });
      const animation: FakeAnimation = {
        keyframes,
        options,
        finished,
        cancelled: false,
        finish: resolve,
        cancel: () => {
          animation.cancelled = true;
          reject(new DOMException("cancelled", "AbortError"));
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  return { element: element as unknown as Element, animations };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("fadeThrough (reduced-motion: fundido en vez de vuelo)", () => {
  it("sin Web Animations API, salta directamente y resuelve", async () => {
    const jump = vi.fn<() => void>();
    const fade = fadeThrough({} as Element, jump);

    expect(jump).toHaveBeenCalledOnce();
    expect(await fade.promise).toEqual({ completed: true });
  });

  it("opacidad a 0 en 100 ms → SALTO → opacidad a 1 en 150 ms, en ese orden", async () => {
    const { element, animations } = fakeElement();
    const order: string[] = [];
    const fade = fadeThrough(element, () => order.push("jump"));

    // nada ha saltado mientras se apaga
    expect(animations).toHaveLength(1);
    expect(animations[0]?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(animations[0]?.options.duration).toBe(FADE_OUT_MS);
    expect(animations[0]?.options.fill).toBe("forwards");
    expect(order).toEqual([]);

    animations[0]?.finish();
    await tick();
    expect(order).toEqual(["jump"]);
    expect(animations).toHaveLength(2);
    expect(animations[1]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animations[1]?.options.duration).toBe(FADE_IN_MS);
    expect(animations[0]?.cancelled).toBe(true); // se libera el `fill: forwards`

    animations[1]?.finish();
    expect(await fade.promise).toEqual({ completed: true });
  });

  it("los fundidos son cortos (la cámara no se mueve: solo continuidad)", () => {
    expect(FADE_OUT_MS).toBeLessThanOrEqual(100);
    expect(FADE_IN_MS).toBeLessThanOrEqual(150);
  });

  it("cancelar durante el fundido de salida: la cámara NUNCA llega a saltar", async () => {
    const { element, animations } = fakeElement();
    const jump = vi.fn<() => void>();
    const fade = fadeThrough(element, jump);
    fade.cancel();

    expect(await fade.promise).toEqual({ completed: false });
    expect(jump).not.toHaveBeenCalled();
    expect(animations).toHaveLength(1);
  });

  it("cancelar durante el fundido de entrada: ya saltó, resuelve completed: false", async () => {
    const { element, animations } = fakeElement();
    const jump = vi.fn<() => void>();
    const fade = fadeThrough(element, jump);
    animations[0]?.finish();
    await tick();
    fade.cancel();

    expect(await fade.promise).toEqual({ completed: false });
    expect(jump).toHaveBeenCalledOnce();
  });
});
