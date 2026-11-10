import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { es, type ZoomOptions } from "../core";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { useChoroplethContext } from "./choropleth-context";
import type { RootProps } from "./components/root";
import type { MapStore } from "./map-store";

// Step 25: zoom buttons, gesture hint and keyboard.

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

/** Captures the map's store to call the zoom API from the test. */
let store: MapStore;
const Grab = () => {
  const context = useChoroplethContext();
  // In an effect (not during render): RTL's `render()` has already run it when it returns.
  useEffect(() => {
    store = context.store;
  }, [context.store]);
  return null;
};

const preset = (props: Record<string, unknown> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);

const compound = (props: Partial<RootProps<Row>> = {}, children?: React.ReactNode) =>
  render(
    <Choropleth.Root {...({ ...baseProps, ...props } as RootProps<Row>)}>
      <Choropleth.Svg />
      <Grab />
      {children}
    </Choropleth.Root>,
  );

const cameraOf = (container: Element) => {
  const viewport = container.querySelector(".cm-viewport");
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport?.getAttribute("transform") ?? "",
  );
  if (match === null) throw new Error("sin transform");
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

const button = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const svgOf = (container: Element) => container.querySelector("svg") as SVGSVGElement;
const wheel = (svg: Element, init: WheelEventInit = {}) =>
  fireEvent.wheel(svg, { deltaY: -300, clientX: 100, clientY: 50, ...init });

afterEach(() => vi.unstubAllGlobals());

describe("ZoomControls · opt-in", () => {
  it("the preset does NOT draw them by default", () => {
    preset();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    preset({ zoom: true });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("`zoom={{ controls: true }}` draws +, − and ⟲ with aria-label (English by default)", () => {
    preset({ zoom: { controls: true } });

    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Zoom in",
      "Zoom out",
      "Reset view",
    ]);
  });

  it("the texts come from `labels` (Spanish)", () => {
    preset({ zoom: { controls: true }, labels: es });

    expect(button(/acercar/i)).toBeTruthy();
    expect(button(/alejar/i)).toBeTruthy();
    expect(button(/restablecer/i)).toBeTruthy();
  });

  it("`reset: false` removes the ⟲ button", () => {
    preset({ zoom: { controls: { reset: false } } });

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /reset/i })).toBeNull();
  });

  it("the corner is configurable (bottom right by default)", () => {
    const { container } = preset({ zoom: { controls: { position: "top-left" } } });
    const controls = container.querySelector<HTMLElement>(".cm-zoom-controls");

    expect(controls?.style.top).toBe("12px");
    expect(controls?.style.left).toBe("12px");
    preset({ zoom: { controls: true } });
    expect(document.querySelectorAll<HTMLElement>(".cm-zoom-controls")[1]?.style.bottom).toBe(
      "12px",
    );
  });

  it("in the compound it is placed by hand; with zoom={false} it draws nothing", () => {
    compound({}, <Choropleth.ZoomControls position="top-right" />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("with zoom={false} the controls are not drawn", () => {
    compound({ zoom: false }, <Choropleth.ZoomControls />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("they are real <button type=button> (they do not submit forms)", () => {
    preset({ zoom: { controls: true } });
    for (const b of screen.getAllByRole("button")) expect(b.getAttribute("type")).toBe("button");
  });
});

describe("ZoomControls · comportamiento", () => {
  const controls: ZoomOptions = { controls: true };

  it("at the fit, `−` and `⟲` are disabled and `+` is not", () => {
    preset({ zoom: controls });

    expect(button(/zoom in/i).disabled).toBe(false);
    expect(button(/zoom out/i).disabled).toBe(true);
    expect(button(/reset/i).disabled).toBe(true);
  });

  it("`+` zooms in ×2 centered, and enables `−` and `⟲` when done", async () => {
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));

    await waitFor(() => expect(cameraOf(container).k).toBeCloseTo(2, 3), { timeout: 2000 });
    // centered on the view: the canvas center (100, 50) stays at the center
    const { k, x, y } = cameraOf(container);
    expect(100 * k + x).toBeCloseTo(100, 3);
    expect(50 * k + y).toBeCloseTo(50, 3);
    await waitFor(() => expect(button(/zoom out/i).disabled).toBe(false));
    expect(button(/reset/i).disabled).toBe(false);
  });

  it("`+` is disabled at the maximum", async () => {
    const { container } = preset({ zoom: { ...controls, max: 2 } });
    fireEvent.click(button(/zoom in/i));

    await waitFor(() => expect(button(/zoom in/i).disabled).toBe(true), { timeout: 2000 });
    expect(cameraOf(container).k).toBeCloseTo(2, 3);
  });

  it("`−` zooms out and `⟲` returns to the fit, and is disabled again", async () => {
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));
    await waitFor(() => expect(button(/reset/i).disabled).toBe(false), { timeout: 2000 });

    fireEvent.click(button(/reset/i));
    await waitFor(() => expect(button(/reset/i).disabled).toBe(true), { timeout: 3000 });
    expect(cameraOf(container)).toMatchObject({ k: 1 });
    expect(cameraOf(container).x).toBeCloseTo(0, 3);
  });

  it("`−` tras `+` vuelve a k = 1", async () => {
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));
    await waitFor(() => expect(button(/zoom out/i).disabled).toBe(false), { timeout: 2000 });
    fireEvent.click(button(/zoom out/i));

    await waitFor(() => expect(cameraOf(container).k).toBeCloseTo(1, 3), { timeout: 2000 });
  });

  it("a wheel zoom also updates the buttons (camera confirmed when done)", async () => {
    const { container } = preset({ zoom: controls });
    wheel(svgOf(container));

    await waitFor(() => expect(button(/reset/i).disabled).toBe(false), { timeout: 1500 });
  });

  it("onViewChange is called when each button zoom ends", async () => {
    const onViewChange = vi.fn<(view: unknown) => void>();
    preset({ zoom: { controls: true, onViewChange } });
    fireEvent.click(button(/zoom in/i));

    await waitFor(() => expect(onViewChange).toHaveBeenCalledOnce(), { timeout: 2000 });
    expect(onViewChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
    );
  });

  it("with reduce motion the jump is immediate (no transition)", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));

    expect(cameraOf(container).k).toBeCloseTo(2, 6); // without waiting
  });

  it("pressing the buttons does not re-render Root", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    preset({ zoom: controls, getId });
    const before = getId.mock.calls.length;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    fireEvent.click(button(/zoom in/i));

    expect(getId.mock.calls.length).toBe(before);
  });
});

describe("zoom API (store.getZoom)", () => {
  it("zoomBy returns a Promise that resolves `completed: true` when done", async () => {
    const { container } = compound();
    const result = await store.getZoom()?.zoomBy(2, { duration: 50 });

    expect(result).toEqual({ completed: true });
    expect(cameraOf(container).k).toBeCloseTo(2, 3);
  });

  it("if another move interrupts it, it resolves `completed: false` (it does not reject)", async () => {
    compound();
    const api = store.getZoom();
    const first = api?.zoomBy(2, { duration: 400 });
    const second = api?.zoomBy(2, { duration: 50 });

    expect(await first).toEqual({ completed: false });
    expect(await second).toEqual({ completed: true });
  });

  it("a user gesture (wheel) interrupts the flight in progress", async () => {
    const { container } = compound();
    await store.getZoom()?.zoomBy(2, { duration: 30 }); // something to reset
    const flight = store.getZoom()?.resetView({ duration: 600 });
    wheel(svgOf(container));

    expect(await flight).toEqual({ completed: false });
  });

  it("resetView with its own duration flies to the fit", async () => {
    const { container } = compound();
    await store.getZoom()?.zoomBy(2, { duration: 30 });
    const result = await store.getZoom()?.resetView({ duration: 50 });

    expect(result).toEqual({ completed: true });
    expect(cameraOf(container).k).toBeCloseTo(1, 3);
  });

  it("resetView without a duration uses the flight's (clamped) and also finishes", async () => {
    const { container } = compound();
    await store.getZoom()?.zoomBy(4, { duration: 30 });

    expect(await store.getZoom()?.resetView()).toEqual({ completed: true });
    expect(cameraOf(container).k).toBeCloseTo(1, 3);
  });

  it("on unmount it unregisters and any flight is interrupted", async () => {
    const { unmount } = compound();
    const pending = store.getZoom()?.zoomBy(2, { duration: 500 });
    unmount();

    expect(store.getZoom()).toBeNull();
    expect(await pending).toEqual({ completed: false });
  });

  it("with zoom={false} there is no API", () => {
    compound({ zoom: false });
    expect(store.getZoom()).toBeNull();
  });
});

describe("teclado", () => {
  const key = (svg: Element, init: KeyboardEventInit) => fireEvent.keyDown(svg, init);

  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  });

  it("the <svg> is a tab stop (tabIndex 0) when there are shortcuts", () => {
    const { container } = compound();
    expect(svgOf(container).getAttribute("tabindex")).toBe("0");
  });

  it("+ zooms in, − zooms out and 0 returns to the fit, and the browser's behavior is cancelled", () => {
    const { container } = compound();
    const svg = svgOf(container);

    expect(key(svg, { key: "+" })).toBe(false); // `preventDefault` called
    expect(cameraOf(container).k).toBeCloseTo(2, 6);
    key(svg, { key: "=" });
    expect(cameraOf(container).k).toBeCloseTo(4, 6);
    key(svg, { key: "-" });
    expect(cameraOf(container).k).toBeCloseTo(2, 6);
    key(svg, { key: "0" });
    expect(cameraOf(container).k).toBeCloseTo(1, 6);
  });

  it("Ctrl/⌘ + key is NOT intercepted (it is the page zoom)", () => {
    const { container } = compound();
    const svg = svgOf(container);

    expect(key(svg, { key: "+", ctrlKey: true })).toBe(true);
    expect(key(svg, { key: "-", metaKey: true })).toBe(true);
    expect(cameraOf(container).k).toBe(1);
  });

  it("other keys are left alone (Tab keeps working)", () => {
    const { container } = compound();

    expect(key(svgOf(container), { key: "Tab" })).toBe(true);
    expect(key(svgOf(container), { key: "a" })).toBe(true);
  });

  it("zoom={{ keyboard: false }} and zoom={false}: no tab stop or shortcuts", () => {
    const off = compound({ zoom: { keyboard: false } });
    expect(svgOf(off.container).hasAttribute("tabindex")).toBe(false);
    expect(key(svgOf(off.container), { key: "+" })).toBe(true);
    off.unmount();

    const none = compound({ zoom: false });
    expect(svgOf(none.container).hasAttribute("tabindex")).toBe(false);
  });

  it("the keyboard does not re-render Root", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { container } = compound({ getId });
    const before = getId.mock.calls.length;
    key(svgOf(container), { key: "+" });

    expect(getId.mock.calls.length).toBe(before);
  });
});

describe("GestureHint", () => {
  const cooperative: ZoomOptions = { wheel: "cooperative" };
  const hint = (container: Element) => container.querySelector(".cm-gesture-hint") as HTMLElement;

  it("the preset includes it, hidden and aria-hidden", () => {
    const { container } = preset({ zoom: cooperative });

    expect(hint(container)).not.toBeNull();
    expect(hint(container).getAttribute("aria-hidden")).toBe("true");
    expect(hint(container).hasAttribute("data-visible")).toBe(false);
  });

  it("wheel without a modifier in cooperative: Ctrl + scroll appears and turns itself off", () => {
    vi.useFakeTimers();
    const { container } = preset({ zoom: cooperative });
    wheel(svgOf(container));

    expect(hint(container).hasAttribute("data-visible")).toBe(true);
    expect(hint(container).textContent).toBe("Use Ctrl + scroll to zoom");

    act(() => void vi.advanceTimersByTime(1600));
    expect(hint(container).hasAttribute("data-visible")).toBe(false);
    // the text is kept during the fade-out
    expect(hint(container).textContent).toBe("Use Ctrl + scroll to zoom");
    vi.useRealTimers();
  });

  it("on macOS it shows ⌘", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const { container } = preset({ zoom: cooperative });
    wheel(svgOf(container));

    expect(hint(container).textContent).toBe("Use ⌘ + scroll to zoom");
    vi.restoreAllMocks();
  });

  it("one finger in cooperative: two fingers", () => {
    const { container } = preset({ zoom: cooperative });
    fireEvent.touchStart(svgOf(container), { touches: [{ clientX: 10, clientY: 10 }] });

    expect(hint(container).hasAttribute("data-visible")).toBe(true);
    expect(hint(container).textContent).toBe("Use two fingers to move the map");
  });

  it("the texts come from `labels`", () => {
    const { container } = preset({ zoom: cooperative, labels: es });
    wheel(svgOf(container));

    expect(hint(container).textContent).toBe("Usa Ctrl + rueda para hacer zoom");
  });

  it("with `always` (default) the wheel zooms and there is NO hint", () => {
    const { container } = preset();
    wheel(svgOf(container));

    expect(hint(container).hasAttribute("data-visible")).toBe(false);
  });

  it("with Ctrl + wheel in cooperative it zooms and does not warn either", () => {
    const { container } = preset({ zoom: cooperative });
    wheel(svgOf(container), { ctrlKey: true });

    expect(hint(container).hasAttribute("data-visible")).toBe(false);
    expect(cameraOf(container).k).toBeGreaterThan(1);
  });

  it("the compound offers it as a piece (`<Choropleth.GestureHint>`)", () => {
    const { container } = compound({ zoom: cooperative }, <Choropleth.GestureHint />);
    wheel(svgOf(container));

    expect(container.querySelector(".cm-gesture-hint[data-visible]")).not.toBeNull();
  });
});
