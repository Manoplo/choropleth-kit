import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import type { FeatureCollection } from "geojson";
import type { ViewState, ZoomOptions } from "../core";
import { world110m } from "../geo";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { useChoroplethApi } from "./choropleth-context";
import type { RootProps } from "./components/root";
import type { ChoroplethMapHandle } from "./handle";

// Step 26: camera flights (`zoomTo`, `focusId`, `initialView`) and imperative handle.

type Row = { code: string; v: number | null };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];
// Two CLEAR blocks (rings clockwise, what d3 expects) at the same latitude: A at lon 0…10
// and B at lon 20…30. The shared `twoSquares` fixture has the ring backwards (d3 reads it as "the
// globe minus the square"), so its map is the whole world and it is no use for checking framings.
const block = (id: string, west: number): FeatureCollection["features"][number] => ({
  type: "Feature",
  id,
  properties: { name: id },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, 40],
        [west, 50],
        [west + 10, 50],
        [west + 10, 40],
        [west, 40],
      ],
    ],
  },
});
const blocks: FeatureCollection = {
  type: "FeatureCollection",
  features: [block("A", 0), block("B", 20)],
};
/** Geographic center of each block. */
const CENTER_A = 5;
const CENTER_B = 25;
const CENTER_LAT = 45;

const baseProps = {
  geography: blocks,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

/** `constrain: "free"` to check the exact framing without the limit shifting it. */
const free: ZoomOptions = { constrain: "free", padding: 0 };

const setup = (props: Partial<RootProps<Row>> = {}, children?: React.ReactNode) => {
  const ref = createRef<ChoroplethMapHandle>();
  const utils = render(
    <Choropleth.Root ref={ref} {...({ ...baseProps, ...props } as RootProps<Row>)}>
      <Choropleth.Svg />
      {children}
    </Choropleth.Root>,
  );
  const handle = () => ref.current as ChoroplethMapHandle;
  // Re-render WITH the same `ref`: without it, React unhooks the handle.
  const rerenderWith = (next: Partial<RootProps<Row>>) =>
    utils.rerender(
      <Choropleth.Root ref={ref} {...({ ...baseProps, ...next } as RootProps<Row>)}>
        <Choropleth.Svg />
        {children}
      </Choropleth.Root>,
    );
  return { ...utils, ref, handle, rerenderWith };
};

const cameraOf = (container: Element) => {
  const viewport = container.querySelector(".cm-viewport");
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport?.getAttribute("transform") ?? "",
  );
  if (match === null) throw new Error("sin transform");
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

afterEach(() => vi.unstubAllGlobals());

describe("handle imperativo (ref)", () => {
  it("exposes zoomTo, zoomBy, resetView, getView and drillDown / drillUp / drillTo", () => {
    const { handle } = setup();

    expect(Object.keys(handle()).sort()).toEqual([
      "drillDown",
      "drillTo",
      "drillUp",
      "getView",
      "resetView",
      "zoomBy",
      "zoomTo",
    ]);
  });

  it("at the fit, getView gives k = 1 and the geographic center", () => {
    const { handle } = setup();
    const view = handle().getView();

    expect(view).toMatchObject({ k: 1, zoom: 1, level: { id: "root", depth: 0 } });
    expect(Math.abs(view.center[0] - 15)).toBeLessThan(1.5); // the center of the two blocks (lon 0…30)
  });

  it("also on the preset <ChoroplethMap ref>", () => {
    const ref = createRef<ChoroplethMapHandle>();
    render(
      <ChoroplethMap<Row>
        ref={ref}
        {...({ ...baseProps } as unknown as ChoroplethMapProps<Row>)}
      />,
    );

    expect(ref.current?.getView().k).toBe(1);
  });
});

describe("zoomTo", () => {
  it("a region: frames it and leaves it centered (A's geographic center)", async () => {
    const { handle } = setup({ zoom: free });
    const result = await handle().zoomTo("A", { duration: 50 });

    expect(result).toEqual({ completed: true });
    const view = handle().getView();
    expect(view.k).toBeGreaterThan(1);
    expect(view.center[0]).toBeCloseTo(CENTER_A, 0);
    expect(view.center[1]).toBeCloseTo(CENTER_LAT, 0);
  });

  it("another region: flies from A to B", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomTo("A", { duration: 30 });
    await handle().zoomTo("B", { duration: 30 });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("{ center, zoom }: that point at the center with that scale relative to the fit", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomTo({ center: [CENTER_B, CENTER_LAT], zoom: 3 }, { duration: 30 });

    const view = handle().getView();
    expect(view.k).toBeCloseTo(3, 6);
    expect(view.center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("{ bounds }: frames some geographic bounds", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomTo(
      {
        bounds: [
          [21, 41],
          [29, 49],
        ],
      },
      { duration: 30 },
    );

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("duration: 0 places the camera instantly (no transition)", () => {
    const { handle, container } = setup({ zoom: free });
    const promise = handle().zoomTo("A", { duration: 0 });

    expect(cameraOf(container).k).toBeGreaterThan(1); // already there, without waiting
    return expect(promise).resolves.toEqual({ completed: true });
  });

  it("a region that does not exist: completed false and a warning in English (it does not throw)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handle } = setup();

    expect(await handle().zoomTo("ZZ")).toEqual({ completed: false });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[choropleth] zoomTo: could not resolve"),
    );
    warn.mockRestore();
  });

  it("with `constrain: contain` the target respects the limits (it does not leave the map)", async () => {
    const { handle, container } = setup(); // contain by default
    await handle().zoomTo("A", { duration: 30 });

    const { x, y, k } = cameraOf(container);
    expect(x).toBeLessThanOrEqual(1e-9);
    expect(y).toBeLessThanOrEqual(1e-9);
    expect(x + 200 * k).toBeGreaterThanOrEqual(200 - 1e-9);
    expect(y + 100 * k).toBeGreaterThanOrEqual(100 - 1e-9);
  });

  it("padding: more margin = less zoom", async () => {
    const small = setup({ zoom: { constrain: "free", padding: 0 } });
    await small.handle().zoomTo("A", { duration: 0 });
    const large = setup({ zoom: { constrain: "free", padding: 40 } });
    await large.handle().zoomTo("A", { duration: 0 });

    expect(large.handle().getView().k).toBeLessThan(small.handle().getView().k);
    // and per call: `padding` replaces the options'
    await small.handle().zoomTo("A", { duration: 0, padding: 40 });
    expect(small.handle().getView().k).toBeCloseTo(large.handle().getView().k, 6);
  });

  it("a user gesture interrupts the flight: completed false", async () => {
    const { handle, container } = setup({ zoom: free });
    const flight = handle().zoomTo("B", { duration: 800 });
    fireEvent.wheel(container.querySelector("svg") as Element, {
      deltaY: -300,
      clientX: 100,
      clientY: 50,
    });

    expect(await flight).toEqual({ completed: false });
  });

  it("onViewChange is called when each flight ends, once", async () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { handle } = setup({ zoom: { ...free, onViewChange } });
    await handle().zoomTo("A", { duration: 30 });

    await waitFor(() => expect(onViewChange).toHaveBeenCalledOnce());
  });

  it("with zoom={false} moves resolve completed: false, and getView still gives the fit", async () => {
    const { handle } = setup({ zoom: false });

    expect(await handle().zoomTo("A")).toEqual({ completed: false });
    expect(await handle().zoomBy(2)).toEqual({ completed: false });
    expect(await handle().resetView()).toEqual({ completed: false });
    expect(handle().getView().k).toBe(1);
  });
});

describe("zoomBy and resetView through the handle", () => {
  it("zoomBy multiplies and resetView returns to the fit", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomBy(3, { duration: 30 });
    expect(handle().getView().k).toBeCloseTo(3, 6);

    expect(await handle().resetView({ duration: 30 })).toEqual({ completed: true });
    expect(handle().getView().k).toBeCloseTo(1, 6);
  });

  it("chaining with await: each flight waits for the previous one", async () => {
    const { handle } = setup({ zoom: free });
    const log: string[] = [];
    await handle().zoomTo("A", { duration: 30 });
    log.push("A");
    await handle().zoomTo("B", { duration: 30 });
    log.push("B");
    await handle().resetView({ duration: 30 });
    log.push("reset");

    expect(log).toEqual(["A", "B", "reset"]);
    expect(handle().getView().k).toBeCloseTo(1, 6);
  });
});

describe("useChoroplethApi (inside the compound, without ref)", () => {
  it("a child button flies with zoomTo", async () => {
    const Button = () => {
      const api = useChoroplethApi();
      return (
        <button type="button" onClick={() => void api.zoomTo("B", { duration: 30 })}>
          volar a B
        </button>
      );
    };
    const { handle } = setup({ zoom: free }, <Button />);
    fireEvent.click(screen.getByRole("button", { name: "volar a B" }));

    await waitFor(() => expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0));
  });

  it("outside Root it throws the clear error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Orphan = () => {
      useChoroplethApi();
      return null;
    };
    expect(() => render(<Orphan />)).toThrow(/inside <Choropleth.Root>/);
    spy.mockRestore();
  });
});

describe("focusId (declarativo)", () => {
  it("on first render it places the camera WITHOUT flying and WITHOUT notifying onViewChange", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { container, handle } = setup({ focusId: "A", zoom: { ...free, onViewChange } });

    expect(cameraOf(container).k).toBeGreaterThan(1); // already at A, without waiting
    expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("on change it flies to the new region; with null, it returns to the fit", async () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const zoom = { ...free, onViewChange };
    const { handle, rerenderWith } = setup({ focusId: "A", zoom });

    rerenderWith({ focusId: "B", zoom });
    await waitFor(() => expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0), {
      timeout: 3000,
    });
    await waitFor(() => expect(onViewChange).toHaveBeenCalledTimes(1));

    rerenderWith({ focusId: null, zoom });
    await waitFor(() => expect(handle().getView().k).toBeCloseTo(1, 3), { timeout: 3000 });
  });

  it("re-rendering with the SAME focusId does not fly again", async () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const zoom = { ...free, onViewChange };
    const { rerenderWith } = setup({ focusId: "A", zoom });
    for (let i = 0; i < 3; i += 1) rerenderWith({ focusId: "A", zoom });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("a nonexistent focusId does not break: it warns and stays as it is", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handle } = setup({ focusId: "ZZ" });

    expect(handle().getView().k).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("if the map loads asynchronously, it is placed when the <svg> appears", async () => {
    const { container, handle } = setup({
      geography: Promise.resolve(blocks),
      focusId: "A",
      zoom: free,
    });
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());

    await waitFor(() => expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0));
  });
});

describe("initialView", () => {
  it("places the camera on mount, without animating or notifying", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { handle } = setup({
      zoom: { ...free, initialView: { center: [CENTER_B, CENTER_LAT], zoom: 2 }, onViewChange },
    });

    expect(handle().getView().k).toBeCloseTo(2, 6);
    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("accepts a region", () => {
    const { handle } = setup({ zoom: { ...free, initialView: "B" } });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("focusId manda sobre initialView", () => {
    const { handle } = setup({ focusId: "A", zoom: { ...free, initialView: "B" } });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0);
  });

  it("only counts on mount: changing it afterwards does not move the camera", () => {
    const { handle, rerenderWith } = setup({ zoom: { ...free, initialView: "A" } });
    rerenderWith({ zoom: { ...free, initialView: "B" } });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0);
  });
});

describe("reduce motion: a fade instead of a flight", () => {
  type FakeAnimation = { keyframes: Keyframe[]; finish: () => void; cancel: () => void };
  const animations: FakeAnimation[] = [];

  beforeEach(() => {
    animations.length = 0;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    Element.prototype.animate = function (keyframes: Keyframe[]) {
      let resolve: () => void = () => {};
      let reject: (reason: unknown) => void = () => {};
      const finished = new Promise<unknown>((res, rej) => {
        resolve = () => res(undefined);
        reject = rej;
      });
      const animation = {
        keyframes,
        finished,
        finish: resolve,
        cancel: () => reject(new DOMException("cancelled", "AbortError")),
      };
      animations.push(animation);
      return animation as unknown as Animation;
    };
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  it("zoomTo is done with a fade: the camera jumps midway, without interpolating", async () => {
    const { handle, container } = setup({ zoom: free });
    const flight = handle().zoomTo("A");

    expect(animations).toHaveLength(1);
    expect(animations[0]?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(cameraOf(container).k).toBe(1); // has not moved yet

    animations[0]?.finish();
    await waitFor(() => expect(cameraOf(container).k).toBeGreaterThan(1)); // it jumped
    expect(animations[1]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);

    animations[1]?.finish();
    expect(await flight).toEqual({ completed: true });
  });

  it("there is no camera transition at all (only the fade)", async () => {
    const { handle, container } = setup({ zoom: free });
    const flight = handle().zoomTo("A");
    animations[0]?.finish();
    await waitFor(() => expect(animations).toHaveLength(2));
    const jumped = cameraOf(container);
    animations[1]?.finish();
    await flight;

    // the camera does not change after the jump: there was no interpolation
    expect(cameraOf(container)).toEqual(jumped);
  });

  it("a new move cancels the previous fade (completed: false)", async () => {
    const { handle } = setup({ zoom: free });
    const first = handle().zoomTo("A");
    const second = handle().zoomTo("B");

    expect(await first).toEqual({ completed: false });
    animations[1]?.finish();
    await waitFor(() => expect(animations).toHaveLength(3));
    animations[2]?.finish();
    expect(await second).toEqual({ completed: true });
  });

  it("duration: 0 is still instantaneous (not even a fade): focusId and initialView do not flicker", () => {
    const { handle } = setup({ focusId: "A", zoom: free });

    expect(animations).toHaveLength(0);
    expect(handle().getView().k).toBeGreaterThan(1);
  });

  it("zoomBy and the buttons also use the fade", async () => {
    const { handle } = setup({ zoom: free });
    void handle().zoomBy(2);

    expect(animations).toHaveLength(1);
  });

  it("when unmounting midway through a fade, it is cancelled and resolves completed: false", async () => {
    const { handle, unmount } = setup({ zoom: free });
    const flight = handle().zoomTo("A");
    unmount();

    expect(await flight).toEqual({ completed: false });
  });
});

describe("framings with real geodata (world110m)", () => {
  const world = (props: Record<string, unknown> = {}) => {
    const ref = createRef<ChoroplethMapHandle>() as RefObject<ChoroplethMapHandle>;
    render(
      <ChoroplethMap<{ id: string; v: number }>
        ref={ref}
        {...({
          geography: world110m,
          objectName: "countries",
          data: [],
          getId: (r: { id: string }) => r.id,
          getValue: (r: { v: number }) => r.v,
          variant: "sequential",
          filterFeatures: (f: { id?: unknown }) => f.id !== "AQ",
          width: 960,
          height: 500,
          zoom: { constrain: "free", padding: 0, max: 40 },
          diagnostics: false,
          ...props,
        } as unknown as ChoroplethMapProps<{ id: string; v: number }>)}
      />,
    );
    const view = async (id: string) => {
      await ref.current?.zoomTo(id, { duration: 0 });
      return ref.current?.getView() as ViewState;
    };
    return { view };
  };

  it("France: frames the mainland, NOT Guiana or the overseas islands", async () => {
    const { view } = world();
    const v = await view("FR");

    expect(v.bounds[0][0]).toBeGreaterThan(-12); // Guiana is at −54
    expect(v.bounds[1][0]).toBeLessThan(20);
    expect(v.center[0]).toBeGreaterThan(-3);
    expect(v.center[0]).toBeLessThan(6);
  });

  it("US: the contiguous territory, not Alaska or Hawaii", async () => {
    const { view } = world();
    const v = await view("US");

    expect(v.bounds[0][0]).toBeGreaterThan(-135); // Alaska llega a −170
    expect(v.center[0]).toBeLessThan(-90);
    expect(v.center[0]).toBeGreaterThan(-110);
  });

  it("Spain includes the CANARY ISLANDS by default (a business decision)", async () => {
    const { view } = world();
    const v = await view("ES");

    // The framing spans from the Canary Islands (−18°) to Menorca (4°): its center falls WEST of the peninsula.
    expect(v.center[0]).toBeLessThan(-5.5);
    expect(v.bounds[0][1]).toBeLessThan(29); // reaches ~28° N
  });

  it("focusBounds={{ ES: null }} returns to the peninsula (without the Canary Islands)", async () => {
    const { view } = world({ focusBounds: { ES: null } });
    const v = await view("ES");

    expect(v.center[0]).toBeGreaterThan(-5); // the peninsula is centered at ~−3.7°
    expect(v.bounds[0][1]).toBeGreaterThan(29); // and it does not reach the Canary Islands (28° N)
  });

  it("a custom focusBounds replaces the library's", async () => {
    const { view } = world({
      focusBounds: {
        ES: [
          [-10, 36],
          [4, 44],
        ],
      },
    });
    const v = await view("ES");

    expect(v.center[0]).toBeGreaterThan(-5);
    expect(v.center[0]).toBeLessThan(-1);
  });

  it("Fiji (crosses the antimeridian): a small framing, not half the world", async () => {
    const { view } = world();
    const v = await view("FJ");

    expect(v.k).toBeGreaterThan(8);
    expect(Math.abs(v.center[0])).toBeGreaterThan(170);
  });

  it("Russia: the main body (Chukotka, on the other side of the map, is left out)", async () => {
    const { view } = world();
    const v = await view("RU");

    expect(v.center[0]).toBeGreaterThan(30);
    expect(v.center[0]).toBeLessThan(120);
  });
});
