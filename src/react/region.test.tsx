import type { Feature, FeatureCollection } from "geojson";
import { geoBounds } from "d3-geo";
import { act, renderHook } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { REGION_PRESETS, world110m, worldFallbackPoints } from "../geo";
import { defineDrillLevels } from "./drill-levels";
import { useChoropleth, type JoinReport, type UseChoroplethOptions } from "./use-choropleth";
import { useDrillDown } from "./use-drill-down";

// The `region` prop (FEAT-022): a continent, a subregion or some countries, from the first frame.
// The real `world110m` is used on purpose: what is being tested is how the presets and the overseas
// table behave over the geometry that ships with the library.

type Row = { id: string; v: number };

const base = {
  geography: world110m,
  objectName: "countries",
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 800,
  height: 500,
} as const;

const setup = (overrides: Partial<UseChoroplethOptions<Row>> = {}) =>
  renderHook(
    (props: Partial<UseChoroplethOptions<Row>>) =>
      useChoropleth<Row>({ ...base, data: [], ...props } as UseChoroplethOptions<Row>),
    { initialProps: overrides },
  );

const ids = (result: { current: { regions: { id: string }[] } }) =>
  result.current.regions.map((r) => r.id);

describe("region: which countries stay", () => {
  it('a continent preset: "europe" keeps Europe only', () => {
    const { result } = setup({ region: "europe" });
    const shown = new Set(ids(result));

    for (const id of ["ES", "FR", "DE", "PL", "NO", "IS", "UA", "XK"])
      expect(shown.has(id)).toBe(true);
    for (const id of ["US", "CN", "BR", "MA", "TR", "RU"]) expect(shown.has(id)).toBe(false);
  });

  it("every drawn region belongs to the preset (and the preset's drawable countries are all there)", () => {
    const { result } = setup({ region: "westernEurope" });
    const drawable = REGION_PRESETS.westernEurope.filter((id) => ids(result).includes(id));

    expect(
      ids(result).every((id) => (REGION_PRESETS.westernEurope as readonly string[]).includes(id)),
    ).toBe(true);
    expect(drawable.length).toBe(ids(result).length);
    expect(ids(result)).toEqual(expect.arrayContaining(["FR", "DE", "AT", "CH", "BE", "NL", "LU"]));
  });

  it('a single country by code: region="ES"', () => {
    expect(ids(setup({ region: "ES" }).result)).toEqual(["ES"]);
  });

  it("a list of codes, and a list mixing presets and codes", () => {
    expect(ids(setup({ region: ["ES", "PT", "FR"] }).result).sort()).toEqual(["ES", "FR", "PT"]);

    const mixed = new Set(ids(setup({ region: ["iberia", "MA"] }).result));
    expect([...mixed].sort()).toEqual(["ES", "MA", "PT"]);
  });

  it('Russia lives in no preset: region="RU" alone works', () => {
    expect(ids(setup({ region: "RU" }).result)).toEqual(["RU"]);
    expect(ids(setup({ region: "asia" }).result)).not.toContain("RU");
  });

  it("combines with `filterFeatures` (both must pass)", () => {
    const { result } = setup({ region: "europe", filterFeatures: (f) => f.id !== "FR" });

    expect(ids(result)).toContain("DE");
    expect(ids(result)).not.toContain("FR");
  });

  it("matches `getFeatureId` when the geometry keeps the code elsewhere", () => {
    const squares = (code: string, west: number): Feature => ({
      type: "Feature",
      properties: { iso: code },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, 0],
            [west, 4],
            [west + 4, 4],
            [west + 4, 0],
            [west, 0],
          ],
        ],
      },
    });
    const geography: FeatureCollection = {
      type: "FeatureCollection",
      features: [squares("ES", 0), squares("US", 10)],
    };
    const { result } = setup({
      geography,
      objectName: undefined,
      getFeatureId: (f) => (f.properties as { iso: string }).iso,
      region: "europe",
    });

    expect(ids(result)).toEqual(["ES"]);
  });

  it("an unknown name throws an error that lists the presets", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => setup({ region: "Europa" })).toThrow(/unknown "Europa".*europe/);
    expect(() => setup({ region: [] })).toThrow(/empty/);
    quiet.mockRestore();
  });
});

describe("region: overseas territories and framing", () => {
  const north = (
    result: { current: { regions: { id: string; feature: Feature }[] } },
    id: string,
  ) => geoBounds(result.current.regions.find((r) => r.id === id)?.feature as Feature)[1][1];

  it("Norway comes without Svalbard and France without Guiana", () => {
    const { result } = setup({ region: "europe" });

    expect(north(result, "NO")).toBeLessThan(72);
    const [[west]] = geoBounds(
      result.current.regions.find((r) => r.id === "FR")?.feature as Feature,
    );
    expect(west).toBeGreaterThan(-6);
  });

  it("without `region` nothing is dropped", () => {
    const { result } = setup();

    expect(north(result, "NO")).toBeGreaterThan(79);
    expect(ids(result)).toContain("US");
  });

  it("the region fills the container: its countries project inside the canvas, and fill most of it", () => {
    const { result } = setup({ region: "europe" });
    const { project } = result.current;
    const madrid = project([-3.7, 40.4]);
    const warsaw = project([21, 52.2]);
    const reykjavik = project([-21.9, 64.1]);

    for (const point of [madrid, warsaw, reykjavik]) {
      expect(point).not.toBeNull();
      expect(point?.[0]).toBeGreaterThan(0);
      expect(point?.[0]).toBeLessThan(800);
      expect(point?.[1]).toBeGreaterThan(0);
      expect(point?.[1]).toBeLessThan(500);
    }
    // Madrid and Warsaw are ~2,300 km apart: on the world they are ~60 px apart at 800 px wide.
    expect(Math.abs((warsaw?.[0] ?? 0) - (madrid?.[0] ?? 0))).toBeGreaterThan(250);
  });

  it("the same content in a new array does not recompute anything (paths keep their identity)", () => {
    const { result, rerender } = setup({ region: ["ES", "PT"] });
    const before = result.current.regions[0]?.feature;

    rerender({ region: ["ES", "PT"] });

    expect(result.current.regions[0]?.feature).toBe(before);
  });

  it("changing `region` re-fits the map", () => {
    const { result, rerender } = setup({ region: "ES" });
    const spainOnly = result.current.regions[0]?.path;

    rerender({ region: ["ES", "FR", "DE"] });

    expect(ids(result).length).toBe(3);
    expect(result.current.regions.find((r) => r.id === "ES")?.path).not.toBe(spainOnly);
  });

  it("`zoomTo`-style targets outside the region resolve to nothing instead of throwing", () => {
    const { result } = setup({ region: "europe" });

    expect(result.current.resolveCamera("US")).toBeNull();
    expect(result.current.resolveCamera("ES")).not.toBeNull();
  });
});

describe("region: Oceania, Russia and North America straddle the antimeridian", () => {
  it("Oceania: Australia, New Zealand and Fiji sit side by side, filling the canvas", () => {
    const { result } = setup({ region: "oceania" });
    const { project } = result.current;
    const sydney = project([151.2, -33.9]);
    const auckland = project([174.8, -36.8]);
    const suva = project([178.4, -18.1]);

    for (const point of [sydney, auckland, suva]) {
      expect(point).not.toBeNull();
      expect(point?.[0]).toBeGreaterThan(0);
      expect(point?.[0]).toBeLessThan(800);
    }
    // Without the rotation Fiji ends up on the far edge from Sydney; with it, they are neighbours.
    expect(Math.abs((suva?.[0] ?? 0) - (sydney?.[0] ?? 0))).toBeLessThan(400);
  });

  it("Pacific microstates (dots) land on the same side as the rest of the region", () => {
    const { result } = setup({
      region: "oceania",
      fallbackPoints: worldFallbackPoints,
      data: [{ id: "WS", v: 3 }],
    });
    const samoa = result.current.fallbackPoints.find((f) => f.id === "WS");
    const sydney = result.current.project([151.2, -33.9]);

    expect(samoa).toBeDefined();
    expect(Math.abs((samoa?.x ?? 0) - (sydney?.[0] ?? 0))).toBeLessThan(900);
  });

  it("Russia alone is centered, not torn", () => {
    const { result } = setup({ region: "RU" });
    const { project } = result.current;
    const moscow = project([37.6, 55.8]);
    const chukotka = project([-175, 66]); // across the antimeridian

    expect(moscow?.[0]).toBeGreaterThan(0);
    expect(chukotka?.[0]).toBeLessThan(800);
    expect(chukotka?.[0]).toBeGreaterThan(moscow?.[0] ?? 0);
  });

  it("Europe keeps the world's orientation (no rotation)", () => {
    const rotated = setup({ region: "europe" }).result.current.project([10, 50]);
    const plain = setup({ region: ["europe"] }).result.current.project([10, 50]);

    expect(rotated).toEqual(plain);
  });
});

describe("region: data outside it", () => {
  const data: Row[] = [
    { id: "ES", v: 1 },
    { id: "US", v: 5 }, // in the world, not in Europe
    { id: "BR", v: 7 }, // idem
    { id: "UK", v: 3 }, // a typo for "GB": exists nowhere
  ];

  it("is reported as `outOfRegion`, not as unmatched; typos keep being unmatched", () => {
    const reports: JoinReport[] = [];
    setup({ region: "europe", data, onJoinReport: (r) => reports.push(r) });

    const report = reports.at(-1);
    expect(report?.outOfRegion.sort()).toEqual(["BR", "US"]);
    expect(report?.unmatchedData).toEqual(["UK"]);
  });

  it("does not warn about the worldwide rows, and still warns about the typo", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setup({ region: "europe", data });
    const text = warn.mock.calls.map((call) => String(call[0])).join("\n");
    warn.mockRestore();

    expect(text).toContain("UK");
    expect(text).not.toMatch(/\bUS\b/);
    expect(text).not.toMatch(/\bBR\b/);
  });

  it("without `region`, `outOfRegion` is empty", () => {
    const reports: JoinReport[] = [];
    setup({ data, onJoinReport: (r) => reports.push(r) });

    expect(reports.at(-1)?.outOfRegion).toEqual([]);
    expect(reports.at(-1)?.unmatchedData).toEqual(["UK"]);
  });

  it("the legend and scale only see the region's data", () => {
    const { result } = setup({ region: "europe", data });

    expect(result.current.regions.find((r) => r.id === "ES")?.value).toBe(1);
    expect(result.current.regions.every((r) => r.value === null || r.id === "ES")).toBe(true);
  });

  it("microstates: Andorra (in Europe) is drawn as a dot, Singapore (not) is out of the region", () => {
    const reports: JoinReport[] = [];
    const { result } = setup({
      region: "europe",
      fallbackPoints: worldFallbackPoints,
      data: [
        { id: "AD", v: 4 },
        { id: "SG", v: 6 },
      ],
      onJoinReport: (r) => reports.push(r),
    });

    expect(result.current.fallbackPoints.map((f) => f.id)).toEqual(["AD"]);
    expect(reports.at(-1)?.outOfRegion).toEqual(["SG"]);
    expect(reports.at(-1)?.unmatchedData).toEqual([]);
  });

  it("a region that selects nothing warns, with the way out", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = setup({ geography: twoSquares, objectName: "squares", region: "ES" });
    const text = warn.mock.calls.map((call) => String(call[0])).join("\n");
    warn.mockRestore();

    expect(result.current.regions).toEqual([]);
    expect(text).toMatch(/region "ES" matches no region.*getFeatureId/);
  });
});

describe("region with drill-down", () => {
  const square = (id: string, west: number, south: number, size: number): Feature => ({
    type: "Feature",
    id,
    properties: { name: id },
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
  // The root is the real world; Spain's children are two squares over the peninsula.
  const provinces: FeatureCollection = {
    type: "FeatureCollection",
    features: [square("ES-N", -8, 40, 4), square("ES-S", -8, 36, 4)],
  };
  const levels = defineDrillLevels<Row>([
    { id: "country", geography: world110m, objectName: "countries" },
    { id: "province", geography: () => Promise.resolve(provinces) },
  ]);

  const mount = (region: UseChoroplethOptions<Row>["region"]) =>
    renderHook(() => {
      const controller = useDrillDown<Row>({ levels });
      const map = useChoropleth<Row>({
        getId: (r: Row) => r.id,
        getValue: (r: Row) => r.v,
        variant: "sequential",
        width: 800,
        height: 500,
        data: [],
        region,
        drill: controller,
      } as UseChoroplethOptions<Row>);
      return { controller, map };
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList,
    );
  });
  afterEach(() => {
    if (vi.isFakeTimers()) act(() => void vi.runOnlyPendingTimers());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    for (let step = 0; step < 30; step++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
  };

  it("the root level is the region, a level below brings its own geometry, and going up returns to the region", async () => {
    const { result } = mount("europe");
    const rootIds = ids({ current: result.current.map });
    expect(rootIds).toContain("ES");
    expect(rootIds).not.toContain("US");

    act(() => void result.current.controller.drillTo(["ES"]));
    await settle();
    expect(ids({ current: result.current.map }).sort()).toEqual(["ES-N", "ES-S"]);

    act(() => void result.current.controller.drillUp());
    await settle();
    expect(ids({ current: result.current.map })).toEqual(rootIds);
  });

  it("the root's overseas territories are dropped there too", () => {
    const { result } = mount("europe");
    const norway = result.current.map.regions.find((r) => r.id === "NO")?.feature as Feature;

    expect(geoBounds(norway)[1][1]).toBeLessThan(72);
  });
});
