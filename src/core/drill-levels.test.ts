import {
  buildBreadcrumbs,
  clampPath,
  contextOf,
  createLruCache,
  drillDirectionBetween,
  geographyKeyFor,
  resolveDrillData,
  validateLevels,
  type DrillContext,
  type LevelShape,
} from "./drill-levels";

const levels: LevelShape[] = [
  { id: "country", label: "Countries", geography: {} },
  { id: "region", geography: () => Promise.resolve({}) },
  { id: "store", geography: "inherit" },
];

describe("contextOf", () => {
  it("the root: no parent and depth 0", () => {
    expect(contextOf([])).toEqual({ path: [], parentId: null, depth: 0 });
  });

  it("the parent is the last id", () => {
    expect(contextOf(["ES", "MD"])).toEqual({ path: ["ES", "MD"], parentId: "MD", depth: 2 });
  });
});

describe("validateLevels", () => {
  it("accepts a correct list", () => {
    expect(() => validateLevels(levels)).not.toThrow();
  });

  it("an empty list throws a clear error", () => {
    expect(() => validateLevels([])).toThrow(/\[choropleth\] drill: at least one level/);
  });

  it("repeated ids: says which one", () => {
    expect(() =>
      validateLevels([
        { id: "a", geography: {} },
        { id: "a", geography: {} },
      ]),
    ).toThrow(/duplicate level id "a"/);
  });

  it('the first level cannot be "inherit"', () => {
    expect(() => validateLevels([{ id: "a", geography: "inherit" }])).toThrow(
      /cannot use geography: "inherit"/,
    );
  });
});

describe("clampPath", () => {
  it("with N levels the longest path has N − 1 ids", () => {
    expect(clampPath(["ES", "MD"], 3)).toEqual({ path: ["ES", "MD"], clamped: false });
    expect(clampPath(["ES", "MD", "X"], 3)).toEqual({ path: ["ES", "MD"], clamped: true });
  });

  it("a single level cannot be drilled into", () => {
    expect(clampPath(["ES"], 1)).toEqual({ path: [], clamped: true });
    expect(clampPath([], 1)).toEqual({ path: [], clamped: false });
  });

  it("does not create a new array if nothing is trimmed (same reference)", () => {
    const path = ["ES"];

    expect(clampPath(path, 3).path).toBe(path);
  });
});

describe("buildBreadcrumbs", () => {
  it("root + one step per id, with depths 0, 1, 2…", () => {
    expect(buildBreadcrumbs({ path: ["ES", "MD"], rootLabel: "World" })).toEqual([
      { depth: 0, id: null, label: "World" },
      { depth: 1, id: "ES", label: "ES" },
      { depth: 2, id: "MD", label: "MD" },
    ]);
  });

  it("getLabel names each step and receives the depth", () => {
    const crumbs = buildBreadcrumbs({
      path: ["ES"],
      rootLabel: "World",
      getLabel: ({ id, depth }) => `${id}@${depth}`,
    });

    expect(crumbs[1]).toEqual({ depth: 1, id: "ES", label: "ES@1" });
  });

  it("at the root there is only one crumb", () => {
    expect(buildBreadcrumbs({ path: [], rootLabel: "World" })).toHaveLength(1);
  });
});

describe("geographyKeyFor", () => {
  it("fixed geometry: the level's id", () => {
    expect(geographyKeyFor(levels, [])).toBe("country");
  });

  it("geometry that depends on the parent: `${id}:${parentId}` (Spain and France do not share a cache)", () => {
    expect(geographyKeyFor(levels, ["ES"])).toBe("region:ES");
    expect(geographyKeyFor(levels, ["FR"])).toBe("region:FR");
  });

  it('"inherit" uses the key of its parent (stores share the geometry of their region)', () => {
    expect(geographyKeyFor(levels, ["ES", "MD"])).toBe("region:ES");
  });

  it("the consumer's `geographyKey` wins, and receives the context", () => {
    const custom: LevelShape[] = [
      { id: "a", geography: {} },
      { id: "b", geography: () => 1, geographyKey: (ctx) => `custom-${ctx.parentId}-${ctx.depth}` },
    ];

    expect(geographyKeyFor(custom, ["X"])).toBe("custom-X-1");
  });

  it("a route longer than the levels does not break (uses the last one)", () => {
    expect(geographyKeyFor(levels, ["ES", "MD", "extra"])).toBe("region:ES");
  });
});

describe("resolveDrillData", () => {
  it("a list passes as is", () => {
    const rows = [1, 2];

    expect(resolveDrillData(rows, contextOf([]))).toBe(rows);
  });

  it("`undefined` (loading) is respected", () => {
    expect(resolveDrillData(undefined, contextOf([]))).toBeUndefined();
  });

  it("a selector receives the current level's context", () => {
    const selector = vi.fn<(ctx: DrillContext) => readonly (string | null)[]>((ctx) => [
      ctx.parentId,
    ]);

    expect(resolveDrillData(selector, contextOf(["ES"]))).toEqual(["ES"]);
    expect(selector).toHaveBeenCalledOnce();
  });

  it("a selector can return `undefined` (loading)", () => {
    expect(resolveDrillData(() => undefined, contextOf([]))).toBeUndefined();
  });
});

describe("drillDirectionBetween", () => {
  it("the direction, or `null` if it does not change", () => {
    expect(drillDirectionBetween([], ["ES"])).toBe("down");
    expect(drillDirectionBetween(["ES"], [])).toBe("up");
    expect(drillDirectionBetween(["ES"], ["FR"])).toBe("lateral");
    expect(drillDirectionBetween([], ["ES", "MD"])).toBe("jump");
    expect(drillDirectionBetween(["ES"], ["ES"])).toBeNull();
  });
});

describe("createLruCache", () => {
  it("stores and returns; what is not there is `undefined`", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("zz")).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it("evicts the LEAST recent when capacity is exceeded", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("`get` marks as recent: what was queried survives", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("`has` does NOT alter the order", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.has("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(false);
  });

  it("rewriting a key updates it and makes it recent, without growing", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(10);
    expect(cache.has("b")).toBe(false);
    expect(cache.size).toBe(2);
  });

  it("delete and clear", () => {
    const cache = createLruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.size).toBe(1);
    cache.clear();

    expect(cache.size).toBe(0);
  });

  it("the default capacity is 8", () => {
    const cache = createLruCache<number>();
    for (let i = 0; i < 9; i++) cache.set(String(i), i);

    expect(cache.size).toBe(8);
    expect(cache.has("0")).toBe(false);
  });

  it("an invalid capacity throws a clear error", () => {
    expect(() => createLruCache(0)).toThrow(/capacity must be an integer ≥ 1/);
    expect(() => createLruCache(1.5)).toThrow(/createLruCache/);
  });
});
