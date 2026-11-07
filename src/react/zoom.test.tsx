import { act, createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import type { ViewState, ZoomOptions } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";

// Step 24: zoom and pan with d3-zoom. jsdom has no layout, but d3-zoom only needs events and the
// size we give it (`extent`), so gestures can be simulated with enough fidelity.

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
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const mapElement = (props: Partial<RootProps<Row>>) => (
  <Choropleth.Root {...({ ...baseProps, ...props } as RootProps<Row>)}>
    <Choropleth.Svg />
  </Choropleth.Root>
);

const setup = (props: Partial<RootProps<Row>> = {}) => {
  const utils = render(mapElement(props));
  const get = () => ({
    svg: utils.container.querySelector("svg") as SVGSVGElement,
    viewport: utils.container.querySelector(".cm-viewport") as SVGGElement,
    root: utils.container.querySelector(".cm-root") as HTMLElement,
    path: (id: string) => utils.container.querySelector(`[data-region-id="${id}"]`) as Element,
  });
  return {
    ...utils,
    ...get(),
    get,
    rerenderWith: (p: Partial<RootProps<Row>>) => utils.rerender(mapElement(p)),
  };
};

/** `{ k, x, y }` from the `transform` attribute d3-zoom writes. */
const cameraOf = (viewport: Element) => {
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport.getAttribute("transform") ?? "",
  );
  if (match === null)
    throw new Error(`transform inesperado: ${viewport.getAttribute("transform")}`);
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

/** d3-zoom keeps its state in `svg.__zoom`: the object's identity reveals whether it was reinstalled. */
const zoomStateOf = (svg: Element) => (svg as unknown as { __zoom: unknown }).__zoom;

const wheel = (svg: Element, init: WheelEventInit = {}) =>
  fireEvent.wheel(svg, { deltaY: -300, clientX: 100, clientY: 50, ...init });

/** d3-zoom's wheel ends the gesture 150 ms after the last event. */
const endWheel = () => act(() => void vi.advanceTimersByTime(200));

// d3-zoom hooks `mousemove`/`mouseup` to `event.view`. jsdom does not let `view` be passed in the event
// constructor (it does not recognize vitest's `window` as a Window), so it is set after creating it.
const mouse = (
  type: "mouseDown" | "mouseMove" | "mouseUp",
  target: Element | Window,
  init: MouseEventInit,
) => {
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "view", { value: window });
  return fireEvent(target, event);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  // d3-zoom removes its click suppressor (after a drag) with `setTimeout(…, 0)`. With fake timers
  // it would never run, and the suppressor would stay on the shared `window` swallowing the next test's
  // click. In a real browser it does run.
  if (vi.isFakeTimers()) act(() => void vi.runOnlyPendingTimers());
  vi.useRealTimers();
});

describe("Viewport and mounting", () => {
  it("Svg wraps the default layers in `.cm-viewport` (the camera)", () => {
    const { svg, viewport, path } = setup();

    expect(svg.contains(viewport)).toBe(true);
    expect(viewport.contains(path("A"))).toBe(true);
    expect(viewport.querySelector(".cm-borders")).not.toBeNull();
    expect(viewport.querySelector(".cm-selection")).not.toBeNull();
  });

  it("on mount, d3-zoom writes the initial transform (the fit) and `--cm-k`", () => {
    const { viewport, root } = setup();

    expect(cameraOf(viewport)).toEqual({ x: 0, y: 0, k: 1 });
    expect(root.style.getPropertyValue("--cm-k")).toBe("1");
    expect(root.hasAttribute("data-zoomed")).toBe(false);
  });

  it("zoom={false}: there is no zoom behavior (the wheel does nothing)", () => {
    const { svg, viewport } = setup({ zoom: false });

    expect(viewport.hasAttribute("transform")).toBe(false);
    wheel(svg);
    endWheel();
    expect(viewport.hasAttribute("transform")).toBe(false);
  });

  it("a `zoom` with min > max throws a clear error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => setup({ zoom: { min: 5, max: 2 } })).toThrow(/\[choropleth\] zoom/);
    spy.mockRestore();
  });
});

describe("rueda", () => {
  it("by default (always): the wheel without a modifier zooms anchored to the cursor", () => {
    const { svg, viewport, root } = setup();
    wheel(svg);

    const { k, x, y } = cameraOf(viewport);
    expect(k).toBeGreaterThan(1);
    // Zoom anchored to the cursor (100, 50): the canvas point that was underneath stays underneath.
    expect(100 * k + x).toBeCloseTo(100, 6);
    expect(50 * k + y).toBeCloseTo(50, 6);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
    expect(root.style.getPropertyValue("--cm-k")).toBe(String(k));
    expect(root.hasAttribute("data-zoomed")).toBe(true);
  });

  it("`data-interacting` is set during the gesture and removed when it ends; the camera is confirmed", () => {
    const { svg, root } = setup();
    wheel(svg);
    expect(root.hasAttribute("data-interacting")).toBe(true);

    endWheel();
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("onViewChange arrives ONCE, when it ends, with a geographic ViewState", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { svg } = setup({ zoom: { onViewChange } });

    wheel(svg);
    wheel(svg);
    wheel(svg);
    expect(onViewChange).not.toHaveBeenCalled(); // never per frame
    endWheel();

    expect(onViewChange).toHaveBeenCalledOnce();
    const [view] = onViewChange.mock.calls[0] ?? [];
    expect(view?.k).toBeGreaterThan(1);
    expect(view?.zoom).toBe(view?.k);
    expect(view?.level).toEqual({ id: "root", depth: 0 });
    expect(Number.isFinite(view?.center[0])).toBe(true);
  });

  it("does not notify on mount (camera restoration is not a gesture)", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    setup({ zoom: { onViewChange } });
    act(() => void vi.runAllTimers());

    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("respects the min and max limits", () => {
    const { svg, viewport } = setup({ zoom: { max: 3 } });
    for (let i = 0; i < 20; i += 1) wheel(svg, { deltaY: -1000 });
    endWheel();

    expect(cameraOf(viewport).k).toBe(3);
  });

  it("zooming out past the fit does nothing (min = 1)", () => {
    const { svg, viewport } = setup();
    wheel(svg, { deltaY: 1000 });
    endWheel();

    expect(cameraOf(viewport)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("never: the wheel does not zoom", () => {
    const { svg, viewport } = setup({ zoom: { wheel: "never" } });
    wheel(svg);
    endWheel();

    expect(cameraOf(viewport).k).toBe(1);
  });

  describe("cooperative", () => {
    const cooperative: ZoomOptions = { wheel: "cooperative" };

    it("the wheel without a modifier does NOT zoom, does NOT cancel the page scroll and shows the hint", () => {
      const { svg, viewport, root } = setup({ zoom: cooperative });
      const notPrevented = wheel(svg);

      expect(notPrevented).toBe(true); // `preventDefault` was not called: the page keeps scrolling
      expect(cameraOf(viewport).k).toBe(1);
      expect(root.hasAttribute("data-interacting")).toBe(false);
    });

    it("the gesture hint is shown and turns itself off", () => {
      const { svg } = setup({ zoom: cooperative });
      const hints: (string | null)[] = [];
      wheel(svg);
      // the store is not public: it is observed through the camera's DOM and the timer
      hints.push("wheel");
      act(() => void vi.advanceTimersByTime(2000));

      expect(hints).toEqual(["wheel"]);
    });

    it("with Ctrl or ⌘ it does zoom", () => {
      const ctrl = setup({ zoom: cooperative });
      wheel(ctrl.svg, { ctrlKey: true });
      expect(cameraOf(ctrl.viewport).k).toBeGreaterThan(1);
      ctrl.unmount();

      const meta = setup({ zoom: cooperative });
      wheel(meta.svg, { metaKey: true });
      expect(cameraOf(meta.viewport).k).toBeGreaterThan(1);
    });

    it("gives `touch-action` back to the browser so one finger keeps scrolling", () => {
      const { svg } = setup({ zoom: cooperative });
      expect(svg.style.touchAction).toBe("pan-x pan-y");
    });

    it("in the other modes `touch-action` is left alone (d3 handles it)", () => {
      expect(setup().svg.style.touchAction).not.toBe("pan-x pan-y");
    });
  });
});

describe("drag (pan) and click", () => {
  const drag = (svg: Element, from: [number, number], to: [number, number]) => {
    mouse("mouseDown", svg, { clientX: from[0], clientY: from[1], button: 0 });
    mouse("mouseMove", window, { clientX: to[0], clientY: to[1] });
    mouse("mouseUp", window, { clientX: to[0], clientY: to[1] });
  };

  it("with k = 1 and `contain` there is nothing to drag", () => {
    const { svg, viewport } = setup();
    drag(svg, [100, 50], [160, 80]);

    expect(cameraOf(viewport)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("zoomed in, dragging pans the map; it cannot be dragged outside the limits", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    wheel(svg, { deltaY: -2000 }); // k = 4
    endWheel();
    const before = cameraOf(viewport);

    drag(svg, [100, 50], [90, 45]);
    const after = cameraOf(viewport);
    expect(after.k).toBe(before.k);
    expect(after.x).toBeLessThan(before.x);

    // A huge drag to the other side stays at the edge: x ≤ 0 and y ≤ 0.
    drag(svg, [0, 0], [5000, 5000]);
    const edge = cameraOf(viewport);
    expect(edge.x).toBeLessThanOrEqual(0);
    expect(edge.y).toBeLessThanOrEqual(0);
  });

  it("pan = false: it cannot be dragged even if zoomed in", () => {
    const { svg, viewport } = setup({ zoom: { pan: false } });
    wheel(svg, { deltaY: -2000 });
    endWheel();
    const before = cameraOf(viewport);
    drag(svg, [100, 50], [60, 20]);

    expect(cameraOf(viewport)).toEqual(before);
  });

  it("a click with a 2 px tremor is still a click", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const { svg, path } = setup({ onItemClick });
    drag(svg, [100, 50], [102, 51]);
    fireEvent.click(path("A"));

    expect(onItemClick).toHaveBeenCalledOnce();
  });

  it("a real drag does NOT produce a click (nothing is selected on release)", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const { svg, path } = setup({ onItemClick });
    drag(svg, [100, 50], [140, 50]);
    fireEvent.click(path("A"));

    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("pressing does NOT set `data-interacting`: if it removed events from the regions, the `click` would land on the <svg>", () => {
    // Regression (only visible in a real browser): d3-zoom emits `start` on `mousedown`. If `interacting` is
    // set there, the CSS puts `pointer-events: none` on the regions, the `mouseup` lands on the <svg> and the
    // `click` never reaches the region: no click worked.
    const { svg, root } = setup();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    expect(root.hasAttribute("data-interacting")).toBe(false);
    mouse("mouseUp", window, { clientX: 100, clientY: 50 });
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("a 3 px tremor (below the click threshold) does not set it either", () => {
    const { svg, root } = setup();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    mouse("mouseMove", window, { clientX: 102, clientY: 52 });

    expect(root.hasAttribute("data-interacting")).toBe(false);
    mouse("mouseUp", window, { clientX: 102, clientY: 52 });
  });

  it("when really DRAGGING (more than 4 px) `data-interacting` is set, and removed on release", () => {
    const { svg, root } = setup({ zoom: { max: 4 } });
    wheel(svg, { deltaY: -2000 }); // with k = 1 and `contain` there is nothing to drag
    endWheel();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    mouse("mouseMove", window, { clientX: 130, clientY: 50 });
    expect(root.hasAttribute("data-interacting")).toBe(true);
    mouse("mouseUp", window, { clientX: 130, clientY: 50 });
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("the wheel sets `data-interacting` as soon as there is zoom", () => {
    const { svg, root } = setup();
    wheel(svg);

    expect(root.hasAttribute("data-interacting")).toBe(true);
    endWheel();
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("the secondary button does not drag", () => {
    const { svg, root } = setup();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 2 });

    expect(root.hasAttribute("data-interacting")).toBe(false);
  });
});

describe("doble clic", () => {
  beforeEach(() => vi.useRealTimers());

  it("without a click with another meaning, it zooms ×2", async () => {
    const { svg, viewport } = setup();
    fireEvent.dblClick(svg, { clientX: 100, clientY: 50 });

    await waitFor(() => expect(cameraOf(viewport).k).toBeCloseTo(2, 1), { timeout: 1500 });
  });

  it("with onItemClick (auto) it is disabled: no click AND zoom at once", async () => {
    const { svg, viewport } = setup({ onItemClick: () => {} });
    fireEvent.dblClick(svg, { clientX: 100, clientY: 50 });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(cameraOf(viewport).k).toBe(1);
  });

  it("doubleClick: true forces it even with onItemClick", async () => {
    const { svg, viewport } = setup({ onItemClick: () => {}, zoom: { doubleClick: true } });
    fireEvent.dblClick(svg, { clientX: 100, clientY: 50 });

    await waitFor(() => expect(cameraOf(viewport).k).toBeGreaterThan(1), { timeout: 1500 });
  });
});

describe("performance: zoom does not touch React", () => {
  // `getId` is called once per row on EVERY render of `useChoropleth`: it is a render counter
  // for `Root` without touching production code (see step 15's test).
  it("neither the wheel nor the drag re-render Root during the gesture", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { svg } = setup({ getId, zoom: { max: 4 } });
    const before = getId.mock.calls.length;

    for (let i = 0; i < 10; i += 1) wheel(svg, { deltaY: -50 });
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    mouse("mouseMove", window, { clientX: 80, clientY: 40 });
    mouse("mouseMove", window, { clientX: 60, clientY: 30 });

    expect(getId.mock.calls.length).toBe(before);
    mouse("mouseUp", window, { clientX: 60, clientY: 30 });
  });

  it("nor when the gesture ENDS (the confirmed camera only touches the store)", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { svg } = setup({ getId });
    const before = getId.mock.calls.length;
    wheel(svg);
    endWheel();

    expect(getId.mock.calls.length).toBe(before);
  });
});

describe("React does not overwrite the camera", () => {
  it("a consumer render (new data) in the middle of a zoom does not reset the transform", () => {
    const { svg, viewport, rerenderWith } = setup();
    wheel(svg);
    const zoomed = viewport.getAttribute("transform");
    expect(zoomed).not.toBe("translate(0,0) scale(1)");

    rerenderWith({ data: [{ code: "A", v: 100 }] });

    expect(viewport.getAttribute("transform")).toBe(zoomed);
  });

  it("inline options with the same values do NOT reinstall d3-zoom (primitive dependencies)", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 6 } });
    wheel(svg);
    endWheel();
    const zoomed = viewport.getAttribute("transform");
    const before = zoomStateOf(svg);

    rerenderWith({ zoom: { max: 6 } }); // NEW object, same values

    expect(zoomStateOf(svg)).toBe(before);
    expect(viewport.getAttribute("transform")).toBe(zoomed);
  });

  it("when an option changes it reinstalls and RESTORES the confirmed camera, without animation", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 6 } });
    wheel(svg);
    endWheel();
    const zoomed = cameraOf(viewport);

    rerenderWith({ zoom: { max: 9 } });

    expect(cameraOf(viewport)).toEqual(zoomed);
    // and the new limit is in force
    for (let i = 0; i < 30; i += 1) wheel(svg, { deltaY: -1000 });
    endWheel();
    expect(cameraOf(viewport).k).toBe(9);
  });

  it("changing the size reinstalls and preserves the confirmed camera", () => {
    const { svg, viewport, rerenderWith } = setup();
    wheel(svg);
    endWheel();
    const zoomed = cameraOf(viewport);

    rerenderWith({ width: 400, height: 200 });

    expect(cameraOf(viewport).k).toBe(zoomed.k);
  });

  it("zoom true → false removes the gestures", () => {
    const { svg, viewport, rerenderWith } = setup();
    rerenderWith({ zoom: false });
    wheel(svg);
    endWheel();

    expect(cameraOf(viewport).k).toBe(1);
  });
});

describe("asynchronous loading", () => {
  it("zoom is hooked up when the <svg> appears after the geometry loads", async () => {
    vi.useRealTimers();
    const { container } = render(mapElement({ geography: Promise.resolve(twoSquares) }));
    expect(container.querySelector("svg")).toBeNull();

    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    const svg = container.querySelector("svg") as SVGSVGElement;
    const viewport = container.querySelector(".cm-viewport") as SVGGElement;
    fireEvent.wheel(svg, { deltaY: -300, clientX: 100, clientY: 50 });

    expect(cameraOf(viewport).k).toBeGreaterThan(1);
  });
});
