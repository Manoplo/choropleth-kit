import { act, renderHook } from "@testing-library/react";
import type { Feature } from "geojson";
import { buildDrillEvent, defineDrillLevels, isDrillable, type DrillLevel } from "./drill-levels";
import type { MapItem } from "./map-item";
import { ROOT_LEVEL } from "./map-item";
import { DRILL_BRIDGE, isDrillController, useDrillDown } from "./use-drill-down";

// Step 30: the drill-down navigation state. Without a map: the hook draws nothing.

type Row = { id: string };
const levels = defineDrillLevels<Row>([
  { id: "country", label: "Countries", geography: {} as never },
  { id: "region", geography: () => Promise.resolve({} as never) },
  { id: "store", geography: "inherit" },
]);

const region = (id: string): MapItem<Row> => ({
  kind: "region",
  id,
  feature: {
    type: "Feature",
    id,
    properties: {},
    geometry: { type: "Point", coordinates: [0, 0] },
  } as Feature,
  datum: undefined,
  level: ROOT_LEVEL,
  drillable: true,
});

afterEach(() => vi.restoreAllMocks());

describe("defineDrillLevels", () => {
  it("returns the same list (identity with types)", () => {
    const list: DrillLevel<Row>[] = [{ id: "a", geography: {} as never }];

    expect(defineDrillLevels(list)).toBe(list);
  });

  it("fails on definition if malformed", () => {
    expect(() => defineDrillLevels([])).toThrow(/at least one level/);
    expect(() =>
      defineDrillLevels([
        { id: "a", geography: {} as never },
        { id: "a", geography: {} as never },
      ]),
    ).toThrow(/duplicate level id/);
  });
});

describe("useDrillDown · uncontrolled", () => {
  it("starts at the root: level 0, empty context, one crumb, cannot go up", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));

    expect(result.current.path).toEqual([]);
    expect(result.current.level.id).toBe("country");
    expect(result.current.context).toEqual({ path: [], parentId: null, depth: 0 });
    expect(result.current.breadcrumbs).toEqual([{ depth: 0, id: null, label: "Countries" }]);
    expect(result.current.canDrillUp).toBe(false);
    expect(result.current.status).toBe("idle");
  });

  it("defaultPath: mounts already on that route", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES"] }));

    expect(result.current.path).toEqual(["ES"]);
    expect(result.current.level.id).toBe("region");
    expect(result.current.canDrillUp).toBe(true);
  });

  it("drillDown / drillUp / reset change the route and notify with onPathChange", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() => useDrillDown({ levels, onPathChange }));

    act(() => result.current.drillDown("ES"));
    expect(result.current.path).toEqual(["ES"]);
    expect(onPathChange).toHaveBeenLastCalledWith(["ES"]);

    act(() => result.current.drillDown("MD"));
    expect(result.current.level.id).toBe("store");
    expect(result.current.breadcrumbs.map((c) => c.id)).toEqual([null, "ES", "MD"]);

    act(() => result.current.drillUp());
    expect(result.current.path).toEqual(["ES"]);

    act(() => result.current.reset());
    expect(result.current.path).toEqual([]);
    expect(onPathChange).toHaveBeenCalledTimes(4);
  });

  it("drillUp(n) goes up n levels, and too many = to the root", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES", "MD"] }));
    act(() => result.current.drillUp(5));

    expect(result.current.path).toEqual([]);
  });

  it("drillUp(depth + 1) also reaches the root (it does not keep an id because of a negative slice)", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES", "MD"] }));
    act(() => result.current.drillUp(3));

    expect(result.current.path).toEqual([]);
  });

  it("drillUp(0), negative or NaN: does nothing", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES"], onPathChange }),
    );
    act(() => {
      result.current.drillUp(0);
      result.current.drillUp(-3);
      result.current.drillUp(NaN);
    });

    expect(result.current.path).toEqual(["ES"]);
    expect(onPathChange).not.toHaveBeenCalled();
  });

  it("drillTo: lateral and jumps", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES"] }));
    act(() => result.current.drillTo(["FR"]));
    expect(result.current.path).toEqual(["FR"]);

    act(() => result.current.drillTo(["US", "CA"]));
    expect(result.current.path).toEqual(["US", "CA"]);
  });

  it("going to the current route neither notifies nor re-renders", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES"], onPathChange }),
    );
    const before = result.current;
    act(() => result.current.drillTo(["ES"]));

    expect(onPathChange).not.toHaveBeenCalled();
    expect(result.current).toBe(before);
  });

  it("two calls in the same tick compose (the second sees the first)", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));
    act(() => {
      result.current.drillDown("ES");
      result.current.drillDown("MD");
    });

    expect(result.current.path).toEqual(["ES", "MD"]);
  });

  it("does not go deeper than the last level: it is ignored and warns in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES", "MD"], onPathChange }),
    );
    act(() => result.current.drillDown("X"));

    expect(result.current.path).toEqual(["ES", "MD"]);
    expect(onPathChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[choropleth] useDrillDown"));
  });

  it("the functions are stable across renders (they are passed to the map's effects)", () => {
    const { result, rerender } = renderHook(() => useDrillDown({ levels }));
    const first = result.current;
    rerender();
    act(() => first.drillDown("ES"));
    rerender();

    expect(result.current.drillDown).toBe(first.drillDown);
    expect(result.current.drillUp).toBe(first.drillUp);
    expect(result.current.drillTo).toBe(first.drillTo);
    expect(result.current.reset).toBe(first.reset);
  });
});

describe("useDrillDown · controlado", () => {
  it("`path` rules: requesting a change notifies but does NOT change the route until the parent changes it", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result, rerender } = renderHook(
      ({ path }: { path: readonly string[] }) => useDrillDown({ levels, path, onPathChange }),
      { initialProps: { path: [] as readonly string[] } },
    );
    act(() => result.current.drillDown("ES"));

    expect(onPathChange).toHaveBeenCalledWith(["ES"]);
    expect(result.current.path).toEqual([]);

    rerender({ path: ["ES"] });
    expect(result.current.path).toEqual(["ES"]);
    expect(result.current.level.id).toBe("region");
  });

  it("the parent can reject the change: the route does not move", () => {
    const { result } = renderHook(() =>
      useDrillDown({ levels, path: ["ES"], onPathChange: () => {} }),
    );
    act(() => result.current.drillUp());

    expect(result.current.path).toEqual(["ES"]);
  });

  it("an external change (the browser's back button) updates level and crumbs", () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: readonly string[] }) => useDrillDown({ levels, path }),
      { initialProps: { path: ["ES", "MD"] as readonly string[] } },
    );
    rerender({ path: [] });

    expect(result.current.level.id).toBe("country");
    expect(result.current.breadcrumbs).toHaveLength(1);
  });

  it("`path` manda sobre `defaultPath`", () => {
    const { result } = renderHook(() =>
      useDrillDown({ levels, path: ["FR"], defaultPath: ["ES"] }),
    );

    expect(result.current.path).toEqual(["FR"]);
  });
});

describe("route deeper than the levels (old URL)", () => {
  it("is trimmed and a warning is given once in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result, rerender } = renderHook(() =>
      useDrillDown({ levels, path: ["ES", "MD", "X", "Y"] }),
    );
    rerender();

    expect(result.current.path).toEqual(["ES", "MD"]);
    expect(result.current.level.id).toBe("store");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/truncated/);
  });
});

describe("migas", () => {
  it("getLabel names the steps; the root uses the first level's label", () => {
    const { result } = renderHook(() =>
      useDrillDown({
        levels,
        defaultPath: ["ES", "MD"],
        getLabel: ({ id, depth }) => `${id.toLowerCase()}#${depth}`,
      }),
    );

    expect(result.current.breadcrumbs.map((c) => c.label)).toEqual(["Countries", "es#1", "md#2"]);
  });

  it("without a label on the first level, the root uses its id", () => {
    const bare = defineDrillLevels<Row>([{ id: "world", geography: {} as never }]);
    const { result } = renderHook(() => useDrillDown({ levels: bare }));

    expect(result.current.breadcrumbs[0]?.label).toBe("world");
  });

  it("an inline `getLabel` does not recompute the crumbs on every render", () => {
    const { result, rerender } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES"], getLabel: ({ id }) => id }),
    );
    const first = result.current.breadcrumbs;
    rerender();

    expect(result.current.breadcrumbs).toBe(first);
  });
});

describe("status (written by the map)", () => {
  it("the hook reads it from the channel; it only re-renders if it changes", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));
    const bridge = result.current[DRILL_BRIDGE];
    act(() => bridge.setStatus("flying"));
    expect(result.current.status).toBe("flying");

    const same = result.current;
    act(() => bridge.setStatus("flying"));
    expect(result.current).toBe(same);

    act(() => bridge.setStatus("idle"));
    expect(result.current.status).toBe("idle");
  });

  it("the channel survives renders (it is the same one)", () => {
    const { result, rerender } = renderHook(() => useDrillDown({ levels }));
    const bridge = result.current[DRILL_BRIDGE];
    rerender();

    expect(result.current[DRILL_BRIDGE]).toBe(bridge);
  });
});

describe("isDrillController", () => {
  it("tells a list of levels from a controller", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));

    expect(isDrillController(levels)).toBe(false);
    expect(isDrillController(result.current)).toBe(true);
  });
});

describe("isDrillable", () => {
  it("with a level below and no `canDrill`: yes", () => {
    expect(isDrillable(levels, 0, region("ES"))).toBe(true);
    expect(isDrillable(levels, 1, region("MD"))).toBe(true);
  });

  it("at the last level: never", () => {
    expect(isDrillable(levels, 2, region("x"))).toBe(false);
  });

  it("out of range: no", () => {
    expect(isDrillable(levels, 9, region("x"))).toBe(false);
  });

  it("`canDrill` boolean or function decides (with the item)", () => {
    const custom = defineDrillLevels<Row>([
      { id: "a", geography: {} as never, canDrill: (item) => item.id !== "AD" },
      { id: "b", geography: {} as never, canDrill: false },
      { id: "c", geography: {} as never },
    ]);

    expect(isDrillable(custom, 0, region("ES"))).toBe(true);
    expect(isDrillable(custom, 0, region("AD"))).toBe(false);
    expect(isDrillable(custom, 1, region("ES"))).toBe(false);
  });
});

describe("buildDrillEvent", () => {
  it("direction, origin and target contexts, and the item if there was one", () => {
    const item = region("ES");
    const event = buildDrillEvent<Row>({ from: [], to: ["ES"], item });

    expect(event).toEqual({
      direction: "down",
      from: { path: [], parentId: null, depth: 0 },
      to: { path: ["ES"], parentId: "ES", depth: 1 },
      item,
    });
  });

  it("without an item (breadcrumb, keyboard, URL) the key does not exist", () => {
    const event = buildDrillEvent<Row>({ from: ["ES"], to: [] });

    expect(event?.direction).toBe("up");
    expect(event).not.toHaveProperty("item");
  });

  it("if the route does not change there is no event", () => {
    expect(buildDrillEvent<Row>({ from: ["ES"], to: ["ES"] })).toBeNull();
  });
});
