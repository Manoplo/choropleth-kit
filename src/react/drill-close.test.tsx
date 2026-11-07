import type { MockInstance } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import { createRef, type RefObject } from "react";
import { es, type DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { useChoroplethApi } from "./choropleth-context";
import { defineDrillLevels } from "./drill-levels";
import type { ChoroplethMapHandle } from "./handle";
import { useDrillDown } from "./use-drill-down";

// Step 34: drill closing. Handle (`drillDown` / `drillUp` / `drillTo` with Promise), intent prefetch
// (`onDrillIntent`), two-tap touch mode and development warnings. Simulated "reduce motion": the flight
// is a jump and the reveal lasts 0, so the tests do not wait for d3 flights.

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
const select = (ctx: DrillContext) =>
  rows.filter((r) => r.parent === (ctx.depth === 0 ? undefined : (ctx.path.at(-1) ?? undefined)));

const geographyOf = ({ parentId }: DrillContext) =>
  Promise.resolve(children[parentId ?? ""] as never);
const levels = defineDrillLevels<Row>([
  { id: "country", geography: world },
  { id: "region", geography: geographyOf },
]);
const threeLevels = defineDrillLevels<Row>([
  { id: "country", geography: world },
  { id: "region", geography: geographyOf },
  { id: "store", geography: "inherit" },
]);

const baseProps = {
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
  data: select,
} as const;

const mount = (props: Partial<RootProps<Row>> = {}) => {
  const ref: RefObject<ChoroplethMapHandle | null> = createRef<ChoroplethMapHandle>();
  const utils = render(
    <Choropleth.Root {...({ ...baseProps, drill: levels, ...props } as RootProps<Row>)} ref={ref}>
      <Choropleth.Svg />
      <Choropleth.Tooltip />
    </Choropleth.Root>,
  );
  const ids = () =>
    Array.from(utils.container.querySelectorAll(".cm-regions [data-region-id]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
  const path = (id: string) =>
    utils.container.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;
  const handle = () => ref.current as ChoroplethMapHandle;
  return { ...utils, ids, path, handle };
};

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList,
  );
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type Result = { completed: boolean };
/**
 * Launches a handle navigation and waits for its result. `await` CANNOT be used inside `act(async)`: `act`
 * holds renders until the callback ends, and the Promise depends on those renders (it would hang).
 */
const call = async (start: () => Promise<Result>): Promise<Result> => {
  let result: Result | undefined;
  act(() => {
    void start().then((r) => {
      result = r;
    });
  });
  await waitFor(() => expect(result).toBeDefined());
  return result as Result;
};

const warnings = () => warn.mock.calls.map((call) => String(call[0]));

describe("drill handle", () => {
  it("drillDown resolves when the new level is at rest", async () => {
    const { handle, ids } = mount();

    const result = await call(() => handle().drillDown("A"));

    expect(result).toEqual({ completed: true });
    expect(ids()).toEqual(["A1", "A2"]);
  });

  it("chains: going down, up and jumping with await (a script without timers)", async () => {
    const { handle, ids } = mount({ drill: threeLevels });

    expect(await call(() => handle().drillDown("A"))).toEqual({ completed: true });
    expect(ids()).toEqual(["A1", "A2"]);
    expect(await call(() => handle().drillUp())).toEqual({ completed: true });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(await call(() => handle().drillTo(["B"]))).toEqual({ completed: true });
    expect(ids()).toEqual(["B1", "B2"]);
    expect(await call(() => handle().drillDown("B1"))).toEqual({ completed: true });
    expect(await call(() => handle().drillUp(5))).toEqual({ completed: true }); // too many = to the root
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("drillTo with a deep route at once", async () => {
    const { handle, ids } = mount({ drill: threeLevels });
    expect(await call(() => handle().drillTo(["A", "A1"]))).toEqual({ completed: true });
    // The last level inherits the regions' geometry (stores over the region).
    expect(ids()).toEqual(["A1", "A2"]);
  });

  it("already being there resolves `completed: true` without touching anything (also going up from the root)", async () => {
    const { handle, ids } = mount();
    expect(await call(() => handle().drillUp())).toEqual({ completed: true });
    expect(await call(() => handle().drillTo([]))).toEqual({ completed: true });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(warnings()).toEqual([]);
  });

  it("an id that does not exist at the level does not navigate: `completed: false` and a warning in English", async () => {
    const { handle, ids } = mount();
    const result = await call(() => handle().drillDown("ZZ"));

    expect(result).toEqual({ completed: false });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(warnings().join("\n")).toMatch(/\[choropleth\] drillDown\(\).*"ZZ".*does not exist/);
  });

  it("a nonexistent id in an intermediate stretch of drillTo is also rejected", async () => {
    const { handle } = mount({ drill: threeLevels });
    expect(await call(() => handle().drillTo(["ZZ", "A1"]))).toEqual({ completed: false });
    expect(warnings().join("\n")).toContain('"ZZ"');
  });

  it("`canDrill: false` rejects the descent with its warning", async () => {
    const noC = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id !== "C" },
      { id: "region", geography: geographyOf },
    ]);
    const { handle, ids } = mount({ drill: noC });
    expect(await call(() => handle().drillDown("C"))).toEqual({ completed: false });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(warnings().join("\n")).toMatch(/canDrill/);
    expect(await call(() => handle().drillDown("A"))).toEqual({ completed: true });
  });

  it("deeper than the defined levels: rejected, with a warning", async () => {
    const { handle } = mount();
    expect(await call(() => handle().drillTo(["A", "A1"]))).toEqual({ completed: false });
    expect(warnings().join("\n")).toMatch(/only 2 level\(s\) are defined/);
  });

  it("without the `drill` prop: `completed: false` and a warning explaining it", async () => {
    const { handle } = mount({ drill: undefined, data: rows, geography: world });
    expect(await call(() => handle().drillDown("A"))).toEqual({ completed: false });
    expect(warnings().join("\n")).toMatch(/drillDown\(\) needs the `drill` prop/);
  });

  it("a new navigation replaces the previous one: the first resolves `false`", async () => {
    const { handle, ids } = mount();
    let first: Result | undefined;
    let second: Result | undefined;
    act(() => {
      void handle()
        .drillTo(["A"])
        .then((r) => {
          first = r;
        });
      void handle()
        .drillTo(["B"])
        .then((r) => {
          second = r;
        });
    });
    await waitFor(() => expect(second).toBeDefined());
    expect(first).toEqual({ completed: false });
    expect(second).toEqual({ completed: true });
    expect(ids()).toEqual(["B1", "B2"]);
  });

  it("a load error undoes the descent: `completed: false` and `onDrillError`", async () => {
    const onDrillError = vi.fn<(event: { error: unknown; ctx: DrillContext }) => void>();
    const failing = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => Promise.reject(new Error("boom")) },
    ]);
    const { handle, ids } = mount({ drill: failing, onDrillError });
    const result = await call(() => handle().drillDown("A"));

    expect(result).toEqual({ completed: false });
    expect(onDrillError).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("controlled mode: if the parent rejects the route, it resolves `false` without hanging", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ref = createRef<ChoroplethMapHandle>();
    const Harness = () => {
      // The parent ignores `onPathChange`: the route stays at [].
      const drill = useDrillDown<Row>({ levels, path: [], onPathChange: () => {} });
      return (
        <Choropleth.Root {...({ ...baseProps, drill } as RootProps<Row>)} ref={ref}>
          <Choropleth.Svg />
        </Choropleth.Root>
      );
    };
    render(<Harness />);

    let result: Result | undefined;
    act(() => {
      void (ref.current as ChoroplethMapHandle).drillDown("A").then((r) => {
        result = r;
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(result).toEqual({ completed: false });
  });

  it("on unmount, the pending promises resolve `false`", async () => {
    const slow = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => new Promise<never>(() => {}) },
    ]);
    const { handle, unmount } = mount({ drill: slow });
    let result: { completed: boolean } | undefined;
    const pending = handle()
      .drillDown("A")
      .then((r) => {
        result = r;
      });
    unmount();
    await pending;
    expect(result).toEqual({ completed: false });
  });

  it("`useChoroplethApi` offers the same from a child of the compound", async () => {
    const Button = () => {
      const api = useChoroplethApi();
      return <button onClick={() => void api.drillDown("B")}>go</button>;
    };
    const { container, getByText } = (() => {
      const utils = render(
        <Choropleth.Root {...({ ...baseProps, drill: levels } as RootProps<Row>)}>
          <Choropleth.Svg />
          <Button />
        </Choropleth.Root>,
      );
      return { ...utils, getByText: utils.getByText };
    })();
    fireEvent.click(getByText("go"));
    await waitFor(() =>
      expect(container.querySelector(".cm-regions [data-region-id='B1']")).not.toBeNull(),
    );
  });
});

describe("intent to go down (onDrillIntent and prefetch)", () => {
  const spyLevels = () => {
    const geography = vi.fn<(ctx: DrillContext) => Promise<never>>(geographyOf);
    return {
      geography,
      drill: defineDrillLevels<Row>([
        { id: "country", geography: world, canDrill: (item) => item.id !== "C" },
        { id: "region", geography },
      ]),
    };
  };
  const leave = (container: HTMLElement) =>
    fireEvent.pointerOver(container.querySelector(".cm-regions") as Element);

  it("150 ms over a drillable region: notifies with the target level's context and preloads its geometry", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path, ids, container } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("A"));
    expect(onDrillIntent).not.toHaveBeenCalled();
    await waitFor(() => expect(onDrillIntent).toHaveBeenCalledTimes(1));

    expect(onDrillIntent).toHaveBeenCalledWith({ path: ["A"], parentId: "A", depth: 1 });
    expect(geography).toHaveBeenCalledTimes(1); // preloaded before the click

    // When the click arrives, the geometry is already there: it is not requested again.
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    expect(geography).toHaveBeenCalledTimes(1);
    leave(container);
  });

  it("a fleeting pass (< 150 ms) is not intent", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path, container } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("A"));
    leave(container);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onDrillIntent).not.toHaveBeenCalled();
    expect(geography).not.toHaveBeenCalled();
  });

  it("a region that cannot be drilled (`canDrill: false`) generates no intent", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("C"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onDrillIntent).not.toHaveBeenCalled();
    expect(geography).not.toHaveBeenCalled();
  });

  it("without `onDrillIntent` it also preloads the geometry", async () => {
    const { geography, drill } = spyLevels();
    const { path } = mount({ drill });

    fireEvent.pointerOver(path("B"));
    await waitFor(() => expect(geography).toHaveBeenCalledTimes(1));
  });

  it("re-entering after leaving is another dwell (it notifies again; the geometry is not repeated)", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path, container } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("A"));
    await waitFor(() => expect(onDrillIntent).toHaveBeenCalledTimes(1));
    leave(container);
    fireEvent.pointerOver(path("A"));
    await waitFor(() => expect(onDrillIntent).toHaveBeenCalledTimes(2));
    expect(geography).toHaveBeenCalledTimes(1);
  });

  it("does not re-render `Root`: hover and intent do not call `getId` again", async () => {
    const { drill } = spyLevels();
    const getId = vi.fn<(row: Row) => string>((r) => r.id);
    const { path } = mount({ drill, getId, onDrillIntent: () => {} });
    const before = getId.mock.calls.length;

    fireEvent.pointerOver(path("A"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The preloaded geometry arrives (a legitimate engine render), but neither the hover nor the timer render.
    expect(getId.mock.calls.length - before).toBeLessThan(rows.length * 3);
  });

  it("a failing prefetch does not doom the click: it is retried", async () => {
    let calls = 0;
    const flaky = defineDrillLevels<Row>([
      { id: "country", geography: world },
      {
        id: "region",
        geography: (ctx) => (calls++ === 0 ? Promise.reject(new Error("net")) : geographyOf(ctx)),
      },
    ]);
    const onDrillError = vi.fn<(event: { error: unknown; ctx: DrillContext }) => void>();
    const { path, ids } = mount({ drill: flaky, onDrillError });

    fireEvent.pointerOver(path("A"));
    await waitFor(() => expect(calls).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(path("A"));

    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    expect(onDrillError).not.toHaveBeenCalled();
    expect(calls).toBe(2);
  });
});

describe("touch: two taps", () => {
  const touch = { pointerType: "touch" };
  const tap = (el: Element) => {
    fireEvent.pointerDown(el, touch);
    fireEvent.pointerOver(el, touch);
    fireEvent.pointerUp(el, touch);
    fireEvent.click(el);
  };

  // Going down is asynchronous (the geometry arrives in a microtask): to assert it did NOT go down, time must pass.
  const quiet = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));

  it("the first tap previews (tooltip with Tap again) and the second goes down", async () => {
    const onItemHover = vi.fn<(item: unknown) => void>();
    const onDrill = vi.fn<(event: unknown) => void>();
    const { path, ids, container } = mount({ onItemHover, onDrill });

    tap(path("A"));
    await quiet();
    expect(ids()).toEqual(["A", "B", "C"]); // still in the world
    expect(onDrill).not.toHaveBeenCalled();
    expect(onItemHover).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".cm-tooltip")?.textContent).toContain("Tap again to enter");
    expect(container.querySelector(".cm-tooltip")?.textContent).not.toContain("Click to see");

    tap(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
  });

  it("tapping another region moves the preview: two taps are needed on IT", async () => {
    const { path, ids } = mount();
    tap(path("A"));
    tap(path("B"));
    await quiet();
    expect(ids()).toEqual(["A", "B", "C"]);
    tap(path("B"));
    await waitFor(() => expect(ids()).toEqual(["B1", "B2"]));
  });

  it("tapping outside (the ocean) withdraws the preview: the next tap is the first again", async () => {
    const { path, ids, container } = mount();
    tap(path("A"));
    fireEvent.pointerOver(container.querySelector(".cm-regions") as Element, touch);
    tap(path("A"));
    await quiet();
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("the hint texts come from `labels`", () => {
    const { path, container } = mount({ labels: es });
    tap(path("A"));
    expect(container.querySelector(".cm-tooltip")?.textContent).toContain(
      "Toca de nuevo para entrar",
    );
  });

  it("with a mouse a single click goes down (nothing changes)", async () => {
    const { path, ids } = mount();
    fireEvent.pointerDown(path("A"), { pointerType: "mouse" });
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
  });

  it("a region that cannot be drilled is selected with one tap, as always", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const noC = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id !== "C" },
      { id: "region", geography: geographyOf },
    ]);
    const { path } = mount({ drill: noC, onItemClick });
    tap(path("C"));
    expect(onItemClick).toHaveBeenCalledTimes(1);
  });
});

describe("drill development warnings", () => {
  it("a URL route with an id that does not exist warns (without breaking)", async () => {
    const Harness = () => {
      const drill = useDrillDown<Row>({ levels, path: ["ZZ"] });
      return (
        <Choropleth.Root {...({ ...baseProps, drill } as RootProps<Row>)}>
          <Choropleth.Svg />
        </Choropleth.Root>
      );
    };
    render(<Harness />);
    await waitFor(() => expect(warnings().join("\n")).toMatch(/drill path.*"ZZ".*does not exist/));
  });

  it("data from another level over the current geometry: hint to use a selector", () => {
    const stores = [{ id: "S1", v: 1 }];
    mount({ data: stores });
    const text = warnings().join("\n");
    expect(text).toContain("no matching geometry");
    expect(text).toMatch(/Pass `data` as a selector/);
  });

  it("with a selector that hint is not given", () => {
    mount({ data: () => [{ id: "S1", v: 1 }] });
    expect(warnings().join("\n")).not.toMatch(/as a selector/);
  });

  it("a `getFeatureId` that returns nothing: warns that no region has an id", () => {
    mount({ drill: undefined, data: rows, geography: world, getFeatureId: () => undefined });
    expect(warnings().join("\n")).toMatch(/none of the 3 region\(s\).*returned `undefined`/);
  });

  it("with `diagnostics={false}` there is no warning about ids", () => {
    mount({
      drill: undefined,
      data: rows,
      geography: world,
      getFeatureId: () => undefined,
      diagnostics: false,
    });
    expect(warnings()).toEqual([]);
  });
});
