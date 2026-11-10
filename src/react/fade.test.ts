import { fadeThrough, FADE_IN_MS, FADE_OUT_MS } from "./fade";

// A fake `Element.animate` where the test decides when each animation ends.
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

describe("fadeThrough (reduced motion: a fade instead of a flight)", () => {
  it("without the Web Animations API, it jumps directly and resolves", async () => {
    const jump = vi.fn<() => void>();
    const fade = fadeThrough({} as Element, jump);

    expect(jump).toHaveBeenCalledOnce();
    expect(await fade.promise).toEqual({ completed: true });
  });

  it("opacity to 0 in 100 ms → JUMP → opacity to 1 in 150 ms, in that order", async () => {
    const { element, animations } = fakeElement();
    const order: string[] = [];
    const fade = fadeThrough(element, () => order.push("jump"));

    // nothing has jumped while it fades out
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
    expect(animations[0]?.cancelled).toBe(true); // the `fill: forwards` is released

    animations[1]?.finish();
    expect(await fade.promise).toEqual({ completed: true });
  });

  it("the fades are short (the camera does not move: continuity only)", () => {
    expect(FADE_OUT_MS).toBeLessThanOrEqual(100);
    expect(FADE_IN_MS).toBeLessThanOrEqual(150);
  });

  it("cancelling during the fade-out: the camera NEVER gets to jump", async () => {
    const { element, animations } = fakeElement();
    const jump = vi.fn<() => void>();
    const fade = fadeThrough(element, jump);
    fade.cancel();

    expect(await fade.promise).toEqual({ completed: false });
    expect(jump).not.toHaveBeenCalled();
    expect(animations).toHaveLength(1);
  });

  it("cancelling during the fade-in: it already jumped, resolves completed: false", async () => {
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
