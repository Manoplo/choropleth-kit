import { act, createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import type { DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { defineDrillLevels, type DrillEvent } from "./drill-levels";
import { useDrillDown, type DrillController } from "./use-drill-down";

// Step 32: the drill-down choreography (dd.md §11.2.3). Unlike `drill.test.tsx`, here there are
// REAL camera flights (350-1200 ms, real timers): it checks the order of the phases, the
// dimming, the gray context, that the rebase is not noticeable (arrival camera == context layer's
// transform) and the edge cases (going up, lateral, interrupting, failing).

const square = (id: string, west: number, south: number, size: number): Feature => ({
  type: "Feature",
  id,
  properties: { name: `Name ${id}` },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [west, south + size],
        [west + size, south + size],
        [west + size, south],
        [west, south],
      ],
    ],
  },
});
const collection = (...features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

// C is far away: it makes A and B small at the root (otherwise framing them would zoom out).
const world = collection(square("A", 0, 0, 4), square("B", 6, 0, 4), square("C", 60, 40, 4));
const children: Record<string, FeatureCollection> = {
  A: collection(square("A1", 0, 0, 2), square("A2", 2, 0, 2)),
  B: collection(square("B1", 6, 0, 2), square("B2", 8, 0, 2)),
};

type Row = { id: string; v: number; parent?: string };
const rows: Row[] = [
  { id: "A", v: 1 },
  { id: "B", v: 9 },
  { id: "C", v: 5 },
  { id: "A1", v: 2, parent: "A" },
  { id: "A2", v: 8, parent: "A" },
  { id: "B1", v: 3, parent: "B" },
  { id: "B2", v: 7, parent: "B" },
];
const select = (ctx: DrillContext) => rows.filter((r) => r.parent === (ctx.parentId ?? undefined));

const levels = defineDrillLevels<Row>([
  { id: "country", geography: world },
  { id: "region", geography: ({ parentId }) => Promise.resolve(children[parentId ?? ""] as never) },
]);

const baseProps = {
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
  data: select,
} as const;

/** A map whose `useDrillDown` controller can be driven from the test. */
const mount = (props: Partial<RootProps<Row>> = {}, drillLevels = levels) => {
  const handle: { controller: DrillController<Row> | undefined } = { controller: undefined };
  // `tick` only serves to re-render from the test (e.g. when data arrives).
  const Harness = ({ tick }: { tick: number }) => {
    const controller = useDrillDown<Row>({ levels: drillLevels });
    handle.controller = controller;
    void tick;
    return (
      <Choropleth.Root {...({ ...baseProps, drill: controller, ...props } as RootProps<Row>)}>
        <Choropleth.Svg />
      </Choropleth.Root>
    );
  };
  const utils = render(<Harness tick={0} />);
  let tick = 0;
  const rerender = () => utils.rerender(<Harness tick={++tick} />);
  const root = () => utils.container.querySelector(".cm-root") as HTMLElement;
  const phase = () => root().getAttribute("data-drill-phase");
  const ids = () =>
    Array.from(utils.container.querySelectorAll(".cm-regions [data-region-id]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
  const path = (id: string) =>
    utils.container.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;
  const viewport = () => utils.container.querySelector(".cm-viewport") as SVGGElement;
  const layers = (role: string) =>
    Array.from(utils.container.querySelectorAll(`.cm-layer[data-role="${role}"]`));
  return { ...utils, handle, root, phase, ids, path, viewport, layers, rerender };
};

const TIMEOUT = { timeout: 4000, interval: 15 };

/** `translate(x,y) scale(k)` → numbers. */
const parseTransform = (value: string | null) => {
  const m = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(value ?? "");
  if (m === null) throw new Error(`transform inesperado: ${value}`);
  return { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) };
};

beforeEach(() => {
  // Without "reduce motion": real flights.
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("going down: the phases", () => {
  it("flies first (the old level is still there), then reveals, then rest", async () => {
    const { phase, ids, path, root, handle } = mount();
    expect(phase()).toBeNull(); // at rest there is no attribute
    fireEvent.click(path("A"));

    await waitFor(() => expect(phase()).toBe("flying"), TIMEOUT);
    expect(ids()).toEqual(["A", "B", "C"]); // still the old level
    expect(handle.controller?.path).toEqual(["A"]); // but the route is optimistic: it already changed

    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);
    expect(ids()).toEqual(["A1", "A2"]);
    await waitFor(() => expect(phase()).toBeNull(), TIMEOUT);
    expect(root().hasAttribute("data-drill-phase")).toBe(false);
  });

  it("during the flight only the chosen region carries `data-drill-target` (the rest is dimmed by CSS)", async () => {
    const { phase, container, path } = mount();
    fireEvent.click(path("B"));
    await waitFor(() => expect(phase()).toBe("flying"), TIMEOUT);

    const targets = Array.from(container.querySelectorAll("[data-drill-target]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
    expect(targets).toEqual(["B"]);
    await waitFor(() => expect(phase()).toBeNull(), TIMEOUT);
    expect(container.querySelector("[data-drill-target]")).toBeNull();
  });

  it("the flight does NOT show the new level until it ends (no mid-flight jump)", async () => {
    const { phase, ids, path } = mount();
    fireEvent.click(path("A"));
    const seen = new Set<string>();
    await waitFor(() => {
      if (phase() === "flying") seen.add(ids().join(","));
      expect(phase()).toBe("revealing");
    }, TIMEOUT);

    expect([...seen]).toEqual(["A,B,C"]);
  });

  it("the new level enters with `--cm-wave` (staggered reveal) and it is removed when done", async () => {
    const { phase, path, container } = mount();
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    const waves = Array.from(container.querySelectorAll<SVGElement>(".cm-regions .cm-region")).map(
      (el) => el.style.getPropertyValue("--cm-wave"),
    );
    expect(waves).toHaveLength(2);
    for (const wave of waves) {
      expect(Number(wave)).toBeGreaterThanOrEqual(0);
      expect(Number(wave)).toBeLessThanOrEqual(1);
    }
    await waitFor(() => expect(phase()).toBeNull(), TIMEOUT);
    expect(
      container
        .querySelector<SVGElement>(".cm-regions .cm-region")
        ?.style.getPropertyValue("--cm-wave"),
    ).toBe("");
  });
});

describe("the rebase is not noticeable", () => {
  it("the camera the flight ends with == the context layer's transform (same pixels)", async () => {
    const { phase, viewport, layers, path } = mount();
    fireEvent.click(path("A"));

    // The last camera seen while flying (right before the projection change).
    let lastFlying = "";
    await waitFor(() => {
      if (phase() === "flying") lastFlying = viewport().getAttribute("transform") ?? "";
      expect(phase()).toBe("revealing");
    }, TIMEOUT);

    const before = parseTransform(lastFlying);
    const group = layers("context")[0] as SVGGElement;
    const after = parseTransform(group.getAttribute("transform"));
    // The parent is now painted with the affine map R instead of the camera: they have to match.
    expect(after.k).toBeCloseTo(before.k, 1);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    // And the child starts with the camera at the fit (k = 1).
    expect(parseTransform(viewport().getAttribute("transform"))).toEqual({ x: 0, y: 0, k: 1 });
  });
});

describe("contexto gris", () => {
  it("after going down, the level above remains as a context layer (its regions, without datum color)", async () => {
    const { phase, layers } = mount();
    expect(layers("context")).toHaveLength(0);
    fireEvent.click(layers("context")[0] ?? document.body); // no effect
    const { path } = {
      path: (id: string) =>
        document.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element,
    };
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    const [context] = layers("context");
    const ids = Array.from(context?.querySelectorAll("[data-context-id]") ?? []).map((el) =>
      el.getAttribute("data-context-id"),
    );
    expect(ids).toEqual(["A", "B", "C"]);
    // The region that was entered is marked (its outline must not look doubled under its children).
    expect(context?.querySelector("[data-focus]")?.getAttribute("data-context-id")).toBe("A");
    // No datum color: the fill comes from the CSS (`--cm-context-fill`), not an inline `style`.
    expect(context?.querySelector("path")?.getAttribute("style")).toBeNull();
  });

  it('`context: "none"` leaves no context layer', async () => {
    const none = defineDrillLevels<Row>([
      levels[0] as never,
      { ...(levels[1] as object), context: "none" } as never,
    ]);
    const { phase, layers, path } = mount({}, none);
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    expect(layers("context")).toHaveLength(0);
  });

  it('an "inherit" level does not duplicate the layer: it already draws the same regions', async () => {
    const inherited = defineDrillLevels<Row>([
      levels[0] as never,
      { id: "store", geography: "inherit" },
    ]);
    const { phase, layers, path } = mount({}, inherited);
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    expect(layers("context")).toHaveLength(0);
  });
});

describe("subir", () => {
  const down = async (utils: ReturnType<typeof mount>, id = "A") => {
    fireEvent.click(utils.path(id));
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.ids()).toEqual([`${id}1`, `${id}2`]);
  };

  it("the level above comes back NOW (with its colors) and the child leaves fading out", async () => {
    const utils = mount();
    const fillBefore = utils.path("A").getAttribute("style");
    await down(utils);
    act(() => utils.handle.controller?.drillUp());

    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]), TIMEOUT);
    expect(utils.phase()).toBe("flying");
    expect(utils.path("A").getAttribute("style")).toBe(fillBefore); // recovers the datum color
    const [exiting] = utils.layers("exiting");
    expect(exiting).toBeDefined();
    expect(
      Array.from(exiting?.querySelectorAll("[data-context-id]") ?? []).map((e) =>
        e.getAttribute("data-context-id"),
      ),
    ).toEqual(["A1", "A2"]);
  });

  it("the leaving layer fades out WITH the color it had (not in gray)", async () => {
    const utils = mount();
    await down(utils);
    const fills = ["A1", "A2"].map((id) => utils.path(id).getAttribute("style"));
    expect(fills[0]).not.toBe(fills[1]); // dos colores distintos de verdad
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.layers("exiting")).toHaveLength(1), TIMEOUT);

    const [exiting] = utils.layers("exiting");
    const leaving = ["A1", "A2"].map((id) =>
      exiting?.querySelector(`[data-context-id="${id}"]`)?.getAttribute("style"),
    );
    expect(leaving).toEqual(fills);
  });

  it("when starting to go up the camera reproduces what was seen (R), not the fit: no jump", async () => {
    const utils = mount();
    await down(utils);
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);

    const start = parseTransform(utils.viewport().getAttribute("transform"));
    expect(start.k).toBeGreaterThan(2); // zoom of the level above to frame A, not k = 1
  });

  it("waits for the DATA of the level above: it neither flies nor paints a gray map meanwhile", async () => {
    let parentReady = true;
    const utils = mount({
      data: (ctx: DrillContext) => (ctx.depth === 0 && !parentReady ? undefined : select(ctx)),
    });
    await down(utils);
    parentReady = false; // e.g. the level-above query was invalidated
    act(() => utils.handle.controller?.drillUp());
    await new Promise((resolve) => setTimeout(resolve, 600)); // more than a short flight

    expect(utils.handle.controller?.path).toEqual([]); // the route already changed…
    expect(utils.ids()).toEqual(["A1", "A2"]); // …but the child is still visible, with no flight or gray
    expect(utils.phase()).toBeNull();

    parentReady = true;
    act(() => utils.rerender());
    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });

  it("ends at rest, on the camera from before going down, and without a leaving layer", async () => {
    const utils = mount();
    await down(utils);
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);

    expect(parseTransform(utils.viewport().getAttribute("transform"))).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
    expect(utils.layers("exiting")).toHaveLength(0);
    expect(utils.layers("context")).toHaveLength(0);
  });

  it("returns to the EXACT camera from before going down (if the user had zoomed in, not to the fit)", async () => {
    const utils = mount({ zoom: { max: 6 } });
    const svg = utils.container.querySelector("svg") as SVGSVGElement;
    fireEvent.wheel(svg, { deltaY: -600, clientX: 40, clientY: 20 });
    await waitFor(
      () => expect(utils.viewport().getAttribute("transform")).not.toBe("translate(0,0) scale(1)"),
      TIMEOUT,
    );
    await new Promise((resolve) => setTimeout(resolve, 250)); // the wheel gesture ends
    const zoomed = parseTransform(utils.viewport().getAttribute("transform"));
    expect(zoomed.k).toBeGreaterThan(1);

    await down(utils);
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);

    const back = parseTransform(utils.viewport().getAttribute("transform"));
    expect(back.k).toBeCloseTo(zoomed.k, 3);
    expect(back.x).toBeCloseTo(zoomed.x, 1);
    expect(back.y).toBeCloseTo(zoomed.y, 1);
  });
});

describe("lateral", () => {
  it("a click on a sibling in the context layer: flies and reveals the other; the context stays", async () => {
    const utils = mount();
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    const context = utils.container.querySelector(
      '.cm-layer[data-role="context"] [data-context-id="B"]',
    ) as Element;
    expect(context.hasAttribute("data-drillable")).toBe(true);

    fireEvent.click(context);
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    expect(utils.handle.controller?.path).toEqual(["B"]);
    expect(utils.ids()).toEqual(["A1", "A2"]); // still Spain's while flying
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);

    expect(utils.ids()).toEqual(["B1", "B2"]);
    const [stillContext] = utils.layers("context");
    expect(stillContext?.querySelector("[data-focus]")?.getAttribute("data-context-id")).toBe("B");
  });

  it("the NON-navigable context items do not respond to a click", async () => {
    const closed = defineDrillLevels<Row>([
      { ...(levels[0] as object), canDrill: (item: { id: string }) => item.id !== "C" } as never,
      levels[1] as never,
    ]);
    const utils = mount({}, closed);
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    const c = utils.container.querySelector(
      '.cm-layer[data-role="context"] [data-context-id="C"]',
    ) as Element;
    expect(c.hasAttribute("data-drillable")).toBe(false);
    fireEvent.click(c);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(utils.handle.controller?.path).toEqual(["A"]);
  });
});

describe("slow loading and failures", () => {
  it("if the load takes longer than the flight: `loading` phase (the region breathes) and then reveal", async () => {
    let release: (value: FeatureCollection) => void = () => {};
    const slow = defineDrillLevels<Row>([
      levels[0] as never,
      {
        id: "region",
        geography: () => new Promise<never>((resolve) => (release = resolve as never)),
      },
    ]);
    const utils = mount({}, slow);
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(utils.phase()).toBe("loading"), TIMEOUT);
    expect(utils.ids()).toEqual(["A", "B", "C"]); // the old level is kept
    expect(
      utils.container.querySelector("[data-drill-target]")?.getAttribute("data-region-id"),
    ).toBe("A");
    expect(utils.handle.controller?.status).toBe("loading");

    await act(async () => release(children["A"] as FeatureCollection));
    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });

  it("if the load fails: waits for the end of the flight, flies back and warns ONCE", async () => {
    const failing = defineDrillLevels<Row>([
      levels[0] as never,
      { id: "region", geography: () => Promise.reject(new Error("boom")) },
    ]);
    const onDrillError = vi.fn<(e: { error: unknown; ctx: DrillContext }) => void>();
    const utils = mount({ onDrillError }, failing);
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(onDrillError).toHaveBeenCalledOnce(), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.handle.controller?.path).toEqual([]);
    expect(utils.ids()).toEqual(["A", "B", "C"]);
    expect(parseTransform(utils.viewport().getAttribute("transform"))).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
    expect(onDrillError).toHaveBeenCalledOnce();
  });
});

describe("interrupt and redirect", () => {
  it("a user gesture during the flight cancels the descent (it does not go on against the hand)", async () => {
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>();
    const utils = mount({ onDrill });
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    const svg = utils.container.querySelector("svg") as SVGSVGElement;
    // Zoom in (not out): with `k` at the minimum d3 exits before interrupting and does nothing.
    fireEvent.wheel(svg, { deltaY: -100, clientX: 100, clientY: 50 });

    await waitFor(() => expect(utils.handle.controller?.path).toEqual([]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.ids()).toEqual(["A", "B", "C"]);
  });

  it("a click on another region during the flight: redirects without going through the first target", async () => {
    const utils = mount();
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    fireEvent.click(utils.path("B"));
    await waitFor(() => expect(utils.handle.controller?.path).toEqual(["B"]), TIMEOUT);
    await waitFor(() => expect(utils.ids()).toEqual(["B1", "B2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });

  it("going up before finishing going down: comes back without ever showing the child", async () => {
    const utils = mount();
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    const seen = new Set<string>();
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => {
      seen.add(utils.ids().join(","));
      expect(utils.phase()).toBeNull();
    }, TIMEOUT);

    expect([...seen]).toEqual(["A,B,C"]);
    expect(utils.handle.controller?.path).toEqual([]);
  });
});

// d3-zoom hooks `mousemove`/`mouseup` to `event.view`; jsdom does not let it be passed in the constructor.
const mouse = (type: "mouseDown" | "mouseUp", target: Element | Window, init: MouseEventInit) => {
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "view", { value: window });
  return fireEvent(target, event);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A click as a browser sends it: `mousedown`, a pause, `mouseup` and `click`. */
const realClick = async (target: Element, x = 40, y = 50) => {
  mouse("mouseDown", target, { clientX: x, clientY: y, button: 0 });
  await sleep(50);
  mouse("mouseUp", window, { clientX: x, clientY: y });
  fireEvent.click(target);
};

describe("click and double click (real mouse events)", () => {
  it("a click goes down a level", async () => {
    const utils = mount();
    await realClick(utils.path("A"));

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), TIMEOUT);
  });

  it("the double click does NOT zoom ×2 on the map: the click already drills", () => {
    const utils = mount();
    const before = utils.viewport().getAttribute("transform");
    fireEvent.doubleClick(utils.container.querySelector("svg") as SVGSVGElement, {
      clientX: 100,
      clientY: 50,
    });

    expect(utils.viewport().getAttribute("transform")).toBe(before);
  });

  it("double click on a region: ends at the level below, with no stray zoom or double drill", async () => {
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>();
    const utils = mount({ onDrill });
    const svg = utils.container.querySelector("svg") as SVGSVGElement;
    await realClick(utils.path("A"));
    await sleep(120);
    await realClick(utils.path("A")); // the second click lands on the region being flown to
    fireEvent.doubleClick(svg, { clientX: 40, clientY: 50 });

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(parseTransform(utils.viewport().getAttribute("transform"))).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
    // Pressing the target region does NOT interrupt the flight: a single `onDrill` (not "down, up, down").
    expect(onDrill).toHaveBeenCalledTimes(1);
    expect(onDrill.mock.calls[0]?.[0].direction).toBe("down");
  });

  it("pressing ANOTHER region during the flight does interrupt and redirect", async () => {
    const utils = mount();
    await realClick(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    await realClick(utils.path("B"));

    await waitFor(() => expect(utils.ids()).toEqual(["B1", "B2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.handle.controller?.path).toEqual(["B"]);
  });
});

describe("eventos", () => {
  it("onDrill at the instant of the click (route already changed); onDrillEnd when the reveal ends", async () => {
    const calls: string[] = [];
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>(() => void calls.push("drill"));
    const onDrillEnd = vi.fn<(e: DrillEvent<Row>) => void>(() => void calls.push("end"));
    const utils = mount({ onDrill, onDrillEnd });
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(onDrill).toHaveBeenCalledOnce(), TIMEOUT);
    expect(utils.phase()).toBe("flying"); // has not finished yet
    expect(onDrillEnd).not.toHaveBeenCalled();
    await waitFor(() => expect(onDrillEnd).toHaveBeenCalledOnce(), TIMEOUT);
    expect(calls).toEqual(["drill", "end"]);
  });
});

describe("without zoom", () => {
  it("with `zoom={false}` there is no flight: the level is revealed directly", async () => {
    const utils = mount({ zoom: false });
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), { timeout: 1000 });
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });
});

describe("reduce motion", () => {
  it("the flight is a jump and the reveal lasts 0: the level appears right away", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList,
    );
    const utils = mount();
    const start = Date.now();
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), { timeout: 1000 });
    expect(Date.now() - start).toBeLessThan(900); // a real flight would take ≥ 350 ms + reveal
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });
});
