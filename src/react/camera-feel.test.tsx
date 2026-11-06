import { createRef } from "react";
import { act, createEvent, fireEvent, render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import type { ViewState, ZoomOptions } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import type { ChoroplethMapHandle } from "./handle";

// Paso 27: contraescalado de burbujas (`--cm-bubble-scale`), inercia al soltar y resize sin salto.
// Con temporizadores falsos, `performance.now()` y `requestAnimationFrame` avanzan con `advanceTimersByTime`.

type Row = { code: string; v: number | null };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const baseProps = {
  geography: twoSquares,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "bubble",
  width: 200,
  height: 100,
} as const;

const element = (props: Partial<RootProps<Row>>, ref?: React.Ref<ChoroplethMapHandle>) => (
  <Choropleth.Root ref={ref} {...({ ...baseProps, ...props } as RootProps<Row>)}>
    <Choropleth.Svg />
  </Choropleth.Root>
);

const setup = (props: Partial<RootProps<Row>> = {}) => {
  const ref = createRef<ChoroplethMapHandle>();
  const utils = render(element(props, ref));
  return {
    ...utils,
    ref,
    rerenderWith: (p: Partial<RootProps<Row>>) => utils.rerender(element(p, ref)),
    get svg() {
      return utils.container.querySelector("svg") as SVGSVGElement;
    },
    get viewport() {
      return utils.container.querySelector(".cm-viewport") as SVGGElement;
    },
    get root() {
      return utils.container.querySelector(".cm-root") as HTMLElement;
    },
  };
};

const cameraOf = (viewport: Element) => {
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport.getAttribute("transform") ?? "",
  );
  if (match === null)
    throw new Error(`transform inesperado: ${viewport.getAttribute("transform")}`);
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

const mouse = (
  type: "mouseDown" | "mouseMove" | "mouseUp",
  target: Element | Window,
  init: MouseEventInit,
) => {
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "view", { value: window });
  return fireEvent(target, event);
};

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const zoomIn = (svg: Element, zoom: ZoomOptions = {}) => {
  void zoom;
  fireEvent.wheel(svg, { deltaY: -2000, clientX: 40, clientY: 20 });
  advance(200);
};

/** Arrastra de `from` a `to` en `steps` movimientos, uno cada `stepMs`, y suelta. */
const drag = (
  svg: Element,
  from: [number, number],
  to: [number, number],
  { steps = 4, stepMs = 16, hold = 0 } = {},
) => {
  mouse("mouseDown", svg, { clientX: from[0], clientY: from[1], button: 0 });
  for (let i = 1; i <= steps; i++) {
    advance(stepMs);
    mouse("mouseMove", window, {
      clientX: from[0] + ((to[0] - from[0]) * i) / steps,
      clientY: from[1] + ((to[1] - from[1]) * i) / steps,
    });
  }
  advance(hold);
  mouse("mouseUp", window, { clientX: to[0], clientY: to[1] });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  if (vi.isFakeTimers()) act(() => void vi.runOnlyPendingTimers());
  vi.useRealTimers();
});

describe("contraescalado de burbujas (--cm-bubble-scale)", () => {
  it("al montar, la escala es 1 (k = 1)", () => {
    const { root } = setup();

    expect(root.style.getPropertyValue("--cm-bubble-scale")).toBe("1");
  });

  it("por defecto (sqrt): 1/√k tras hacer zoom", () => {
    const { svg, root, viewport } = setup();
    zoomIn(svg);
    const { k } = cameraOf(viewport);

    expect(k).toBeGreaterThan(1);
    expect(Number(root.style.getPropertyValue("--cm-bubble-scale"))).toBeCloseTo(
      1 / Math.sqrt(k),
      6,
    );
  });

  it("screen: 1/k; geo: 1", () => {
    const screen = setup({ zoom: { bubbleScaling: "screen" } });
    zoomIn(screen.svg);
    const { k } = cameraOf(screen.viewport);
    expect(Number(screen.root.style.getPropertyValue("--cm-bubble-scale"))).toBeCloseTo(1 / k, 6);
    screen.unmount();

    const geo = setup({ zoom: { bubbleScaling: "geo" } });
    zoomIn(geo.svg);
    expect(geo.root.style.getPropertyValue("--cm-bubble-scale")).toBe("1");
  });

  it("cambiar la política reinstala y recalcula la variable con la cámara actual", () => {
    const { svg, root, viewport, rerenderWith } = setup();
    zoomIn(svg);
    const { k } = cameraOf(viewport);
    rerenderWith({ zoom: { bubbleScaling: "screen" } });

    expect(Number(root.style.getPropertyValue("--cm-bubble-scale"))).toBeCloseTo(1 / k, 6);
  });
});

describe("inercia", () => {
  it("soltar un arrastre rápido sigue deslizando el mapa y luego frena", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]); // hacia la izquierda, rápido (≈ 0,6 px/ms)
    const released = cameraOf(viewport);

    advance(100);
    const mid = cameraOf(viewport);
    advance(3000);
    const end = cameraOf(viewport);
    advance(500);

    expect(mid.x).toBeLessThan(released.x); // siguió moviéndose tras soltar
    expect(end.x).toBeLessThanOrEqual(mid.x);
    expect(cameraOf(viewport)).toEqual(end); // y paró
    expect(end.k).toBe(released.k); // inercia = solo pan
  });

  it("el deslizamiento respeta los límites (constrain)", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [-200, 50], { steps: 4, stepMs: 8 });
    advance(5000);

    expect(cameraOf(viewport).x).toBeGreaterThanOrEqual(200 - 200 * cameraOf(viewport).k - 1e-6);
  });

  it("avisa a `onViewChange` UNA vez al terminar, con la cámara final (no por frame)", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { svg, viewport } = setup({ zoom: { max: 4, onViewChange } });
    zoomIn(svg);
    onViewChange.mockClear();
    drag(svg, [100, 50], [60, 50]);
    expect(onViewChange).not.toHaveBeenCalled(); // aún desliza
    advance(5000);

    expect(onViewChange).toHaveBeenCalledOnce();
    expect(onViewChange.mock.calls[0]?.[0].x).toBeCloseTo(cameraOf(viewport).x, 6);
  });

  it("mientras desliza hay `data-interacting`; al parar se quita", () => {
    const { svg, root } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    advance(50);
    expect(root.hasAttribute("data-interacting")).toBe(true);
    advance(5000);

    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("un `pointerdown` la frena en seco y confirma la cámara", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { svg, viewport, root } = setup({ zoom: { max: 4, onViewChange } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    advance(100);
    onViewChange.mockClear();
    fireEvent.pointerDown(svg);
    const stopped = cameraOf(viewport);
    advance(2000);

    expect(cameraOf(viewport)).toEqual(stopped);
    expect(onViewChange).toHaveBeenCalledOnce();
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("agarrar el mapa (mousedown) también la frena", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    advance(100);
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    const held = cameraOf(viewport);
    advance(1000);

    expect(cameraOf(viewport)).toEqual(held);
    mouse("mouseUp", window, { clientX: 100, clientY: 50 });
  });

  it("si se detiene la mano antes de soltar, no hay inercia", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50], { hold: 300 });
    const released = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(released);
  });

  it("un arrastre lento no desliza", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [96, 50], { stepMs: 50 }); // 4 px en 200 ms = 0,02 px/ms
    const released = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(released);
  });

  it("inertia: false la desactiva", () => {
    const { svg, viewport } = setup({ zoom: { max: 4, inertia: false } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    const released = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(released);
  });

  it("un movimiento programático (zoomTo) frena la inercia", async () => {
    const { svg, ref, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    advance(50);
    act(() => void ref.current?.zoomTo({ center: [0, 0], zoom: 2 }, { duration: 0 }));
    const placed = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(placed);
  });
});

describe("resize sin salto", () => {
  it("al cambiar el tamaño se conservan el centro geográfico y la `k`", () => {
    const { svg, ref, rerenderWith } = setup({ zoom: { max: 8 } });
    zoomIn(svg);
    const before = ref.current?.getView();
    expect(before?.k).toBeGreaterThan(1);

    rerenderWith({ width: 300, height: 100 });
    const after = ref.current?.getView();

    expect(after?.k).toBeCloseTo(before?.k ?? 0, 6);
    expect(after?.center[0]).toBeCloseTo(before?.center[0] ?? 0, 4);
    expect(after?.center[1]).toBeCloseTo(before?.center[1] ?? 0, 4);
  });

  it("sin zoom (k = 1) sigue en el encaje", () => {
    const { ref, rerenderWith, viewport } = setup();
    rerenderWith({ width: 300, height: 150 });

    expect(ref.current?.getView().k).toBe(1);
    expect(cameraOf(viewport)).toMatchObject({ k: 1 });
  });

  it("un cambio de opciones con el mismo tamaño restaura la cámara tal cual", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 8 } });
    zoomIn(svg);
    const before = cameraOf(viewport);
    rerenderWith({ zoom: { max: 9 } });

    expect(cameraOf(viewport)).toEqual(before);
  });

  it("la cámara resultante respeta `constrain: contain`", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 8 } });
    zoomIn(svg);
    rerenderWith({ width: 300, height: 100 });
    const { k, x, y } = cameraOf(viewport);

    expect(x).toBeLessThanOrEqual(1e-6);
    expect(y).toBeLessThanOrEqual(1e-6);
    expect(x).toBeGreaterThanOrEqual(300 - 300 * k - 1e-6);
    expect(y).toBeGreaterThanOrEqual(100 - 100 * k - 1e-6);
  });
});
