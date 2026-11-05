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
    // asignar la ref antes del efecto no es posible en renderHook; lo hacemos en el primer render
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
  it("antes de medir, el alto sale de la proporción (también con `auto`)", () => {
    expect(render({ aspectRatio: 3 }).result.current).toMatchObject({ width: 960, height: 320 });
  });

  it("si cambia la proporción, el alto se corrige sin otra medida", () => {
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

  it("tamaño inicial razonable antes de medir", () => {
    expect(render().result.current).toMatchObject({ width: 960, height: 500 });
    expect(render({ initial: { width: 300, height: 100 } }).result.current.width).toBe(300);
  });
});

describe("useContainerSize · medición", () => {
  it("el alto se deriva del ancho por defecto", () => {
    const { result } = render({ aspectRatio: 2 });
    resize(400, 999);

    expect(result.current).toMatchObject({ width: 400, height: 200 });
  });

  it("useContainerHeight usa el alto real del contenedor", () => {
    const { result } = render({ useContainerHeight: true });
    resize(400, 300);

    expect(result.current).toMatchObject({ width: 400, height: 300 });
  });

  it("useContainerHeight con alto 0 recurre a la proporción", () => {
    const { result } = render({ useContainerHeight: true, aspectRatio: 2 });
    resize(400, 0);

    expect(result.current.height).toBe(200);
  });

  it("ignora medidas con ancho 0 (contenedor oculto)", () => {
    const { result } = render();
    resize(0, 0);

    expect(result.current.width).toBe(960);
  });

  it("no cambia el estado si la medida es la misma", () => {
    const { result } = render({ aspectRatio: 2 });
    resize(400, 0);
    const before = result.current;
    resize(400, 0);

    expect(result.current.width).toBe(before.width);
  });

  it("desconecta el observer al desmontar", () => {
    const { unmount } = render();
    unmount();

    expect(disconnect).toHaveBeenCalled();
  });

  it("sin ResizeObserver (SSR/jsdom) no falla", () => {
    vi.unstubAllGlobals();
    expect(() => render()).not.toThrow();
  });
});
