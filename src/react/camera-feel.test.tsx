import { createRef } from "react";
import { act, createEvent, fireEvent, render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import type { ViewState, ZoomOptions } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import type { ChoroplethMapHandle } from "./handle";

// Step 27: bubble counter-scaling (`--cm-bubble-scale`), inertia on release and resize without a jump.
// With fake timers, `performance.now()` and `requestAnimationFrame` advance with `advanceTimersByTime`.

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

/** Drags from `from` to `to` in `steps` moves, one every `stepMs`, and releases. */
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

describe("bubble counter-scaling (--cm-bubble-scale)", () => {
  it("on mount, the scale is 1 (k = 1)", () => {
    const { root } = setup();

    expect(root.style.getPropertyValue("--cm-bubble-scale")).toBe("1");
  });

  it("by default (sqrt): 1/√k after zooming", () => {
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

  it("changing the policy reinstalls and recomputes the variable with the current camera", () => {
    const { svg, root, viewport, rerenderWith } = setup();
    zoomIn(svg);
    const { k } = cameraOf(viewport);
    rerenderWith({ zoom: { bubbleScaling: "screen" } });

    expect(Number(root.style.getPropertyValue("--cm-bubble-scale"))).toBeCloseTo(1 / k, 6);
  });
});

describe("inercia", () => {
  it("releasing a fast drag keeps sliding the map and then slows down", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]); // to the left, fast (≈ 0.6 px/ms)
    const released = cameraOf(viewport);

    advance(100);
    const mid = cameraOf(viewport);
    advance(3000);
    const end = cameraOf(viewport);
    advance(500);

    expect(mid.x).toBeLessThan(released.x); // it kept moving after release
    expect(end.x).toBeLessThanOrEqual(mid.x);
    expect(cameraOf(viewport)).toEqual(end); // and stopped
    expect(end.k).toBe(released.k); // inertia = pan only
  });

  it("the slide respects the limits (constrain)", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [-200, 50], { steps: 4, stepMs: 8 });
    advance(5000);

    expect(cameraOf(viewport).x).toBeGreaterThanOrEqual(200 - 200 * cameraOf(viewport).k - 1e-6);
  });

  it("notifies `onViewChange` ONCE at the end, with the final camera (not per frame)", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { svg, viewport } = setup({ zoom: { max: 4, onViewChange } });
    zoomIn(svg);
    onViewChange.mockClear();
    drag(svg, [100, 50], [60, 50]);
    expect(onViewChange).not.toHaveBeenCalled(); // still sliding
    advance(5000);

    expect(onViewChange).toHaveBeenCalledOnce();
    expect(onViewChange.mock.calls[0]?.[0].x).toBeCloseTo(cameraOf(viewport).x, 6);
  });

  it("while sliding there is `data-interacting`; when it stops it is removed", () => {
    const { svg, root } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    advance(50);
    expect(root.hasAttribute("data-interacting")).toBe(true);
    advance(5000);

    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("a `pointerdown` stops it dead and confirms the camera", () => {
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

  it("grabbing the map (mousedown) also stops it", () => {
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

  it("if the hand stops before releasing, there is no inertia", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50], { hold: 300 });
    const released = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(released);
  });

  it("a slow drag does not slide", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    zoomIn(svg);
    drag(svg, [100, 50], [96, 50], { stepMs: 50 }); // 4 px in 200 ms = 0.02 px/ms
    const released = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(released);
  });

  it("inertia: false disables it", () => {
    const { svg, viewport } = setup({ zoom: { max: 4, inertia: false } });
    zoomIn(svg);
    drag(svg, [100, 50], [60, 50]);
    const released = cameraOf(viewport);
    advance(3000);

    expect(cameraOf(viewport)).toEqual(released);
  });

  it("a programmatic move (zoomTo) stops the inertia", async () => {
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

describe("resize without a jump", () => {
  it("on resize the geographic center and `k` are preserved", () => {
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

  it("without zoom (k = 1) it stays at the fit", () => {
    const { ref, rerenderWith, viewport } = setup();
    rerenderWith({ width: 300, height: 150 });

    expect(ref.current?.getView().k).toBe(1);
    expect(cameraOf(viewport)).toMatchObject({ k: 1 });
  });

  it("an options change with the same size restores the camera as is", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 8 } });
    zoomIn(svg);
    const before = cameraOf(viewport);
    rerenderWith({ zoom: { max: 9 } });

    expect(cameraOf(viewport)).toEqual(before);
  });

  it("the resulting camera respects `constrain: contain`", () => {
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
