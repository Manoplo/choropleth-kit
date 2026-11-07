import { act, renderHook } from "@testing-library/react";
import { useContainerSize } from "./use-container-size";

let callback: ResizeObserverCallback = () => {};
const disconnect = vi.fn<() => void>();

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeObserverCallback) {
        callback = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const render = (options?: Parameters<typeof useContainerSize>[0]) => {
  const hook = renderHook(() => {
    const value = useContainerSize(options);
    // assigning the ref before the effect is not possible in renderHook; we do it on first render
    value.ref.current ??= document.createElement("div");
    return value;
  });
  return hook;
};

const resize = (width: number, height: number) =>
  act(() =>
    callback([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver),
  );

describe("useContainerSize", () => {
  it("before measuring, the height comes from the ratio (also with `auto`)", () => {
    expect(render({ aspectRatio: 3 }).result.current).toMatchObject({ width: 960, height: 320 });
  });

  it("if the ratio changes, the height is corrected without another measurement", () => {
    let aspectRatio = 2;
    const { result, rerender } = renderHook(() => {
      const value = useContainerSize({ aspectRatio });
      value.ref.current ??= document.createElement("div");
      return value;
    });
    resize(400, 0);
    expect(result.current.height).toBe(200);

    aspectRatio = 0.5;
    rerender();
    expect(result.current).toMatchObject({ width: 400, height: 800 });
  });

  it("reasonable initial size before measuring", () => {
    expect(render().result.current).toMatchObject({ width: 960, height: 500 });
    expect(render({ initial: { width: 300, height: 100 } }).result.current.width).toBe(300);
  });
});

describe("useContainerSize · measurement", () => {
  it("the height is derived from the width by default", () => {
    const { result } = render({ aspectRatio: 2 });
    resize(400, 999);

    expect(result.current).toMatchObject({ width: 400, height: 200 });
  });

  it("useContainerHeight uses the container's real height", () => {
    const { result } = render({ useContainerHeight: true });
    resize(400, 300);

    expect(result.current).toMatchObject({ width: 400, height: 300 });
  });

  it("useContainerHeight with height 0 falls back to the ratio", () => {
    const { result } = render({ useContainerHeight: true, aspectRatio: 2 });
    resize(400, 0);

    expect(result.current.height).toBe(200);
  });

  it("ignores measurements with width 0 (hidden container)", () => {
    const { result } = render();
    resize(0, 0);

    expect(result.current.width).toBe(960);
  });

  it("does not change state if the measurement is the same", () => {
    const { result } = render({ aspectRatio: 2 });
    resize(400, 0);
    const before = result.current;
    resize(400, 0);

    expect(result.current.width).toBe(before.width);
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render();
    unmount();

    expect(disconnect).toHaveBeenCalled();
  });

  it("without ResizeObserver (SSR/jsdom) it does not fail", () => {
    vi.unstubAllGlobals();
    expect(() => render()).not.toThrow();
  });
});
