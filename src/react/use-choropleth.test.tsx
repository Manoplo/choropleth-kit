import type { FeatureCollection } from "geojson";
import { act, renderHook } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { useChoropleth, type UseChoroplethOptions } from "./use-choropleth";

type Row = { code: string; v: number | null };

const base = {
  geography: twoSquares,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  width: 200,
  height: 100,
} as const;

const setup = (overrides: Partial<UseChoroplethOptions<Row>> = {}) =>
  renderHook(
    (props: Partial<UseChoroplethOptions<Row>>) =>
      useChoropleth<Row>({
        ...base,
        data: [
          { code: "A", v: 1 },
          { code: "B", v: 9 },
        ],
        variant: "sequential",
        ...props,
      } as UseChoroplethOptions<Row>),
    { initialProps: overrides },
  );

describe("useChoropleth", () => {
  it("returns one region per feature with id, path, fill, datum and value", () => {
    const { result } = setup();

    expect(result.current.regions.map((r) => r.id)).toEqual(["A", "B"]);
    expect(result.current.regions[0]?.path).toMatch(/^M/);
    expect(result.current.regions[0]?.datum).toEqual({ code: "A", v: 1 });
    expect(result.current.regions[1]?.value).toBe(9);
    expect(result.current.regions[0]?.fill).not.toBe(result.current.regions[1]?.fill);
  });

  it("region without data or with value null → emptyFill (and 0 is colored)", () => {
    const { result } = setup({
      data: [
        { code: "A", v: null },
        { code: "B", v: 0 },
      ],
      emptyFill: "#eee",
    });

    expect(result.current.regions[0]?.fill).toBe("#eee");
    expect(result.current.regions[1]?.fill).not.toBe("#eee");

    const { result: r2 } = setup({ data: [{ code: "A", v: 1 }], emptyFill: "#eee" });
    expect(r2.current.regions[1]?.datum).toBeUndefined();
    expect(r2.current.regions[1]?.fill).toBe("#eee");
  });

  it("borders: a string with TopoJSON, null with GeoJSON", () => {
    expect(setup().result.current.borders).toMatch(/^M/);

    const geojson: FeatureCollection = { type: "FeatureCollection", features: [] };
    expect(setup({ geography: geojson }).result.current.borders).toBeNull();
  });

  it("paths and borders are stable when only the data changes, and the color changes", () => {
    const { result, rerender } = setup();
    const before = result.current;

    rerender({
      data: [
        { code: "A", v: 9 },
        { code: "B", v: 1 },
      ],
    });

    expect(result.current.regions.map((r) => r.path)).toEqual(before.regions.map((r) => r.path));
    expect(result.current.borders).toBe(before.borders);
    expect(result.current.regions[0]?.fill).not.toBe(before.regions[0]?.fill);
  });

  it("changing the size recomputes the paths", () => {
    const { result, rerender } = setup();
    const before = result.current.regions[0]?.path;

    rerender({ width: 400, height: 200 });

    expect(result.current.regions[0]?.path).not.toBe(before);
  });

  it("diverging uses a symmetric domain with the midpoint", () => {
    const { result } = setup({ variant: "diverging", midpoint: 5 } as never);

    expect(result.current.scale?.domain).toEqual([1, 9]);
  });

  it("joinReport reports orphan data and regions without data", () => {
    const { result } = setup({
      data: [
        { code: "ES", v: 1 },
        { code: "A", v: 2 },
      ],
    });

    expect(result.current.joinReport.unmatchedData).toEqual(["ES"]);
    expect(result.current.joinReport.featuresWithoutData).toEqual(["B"]);
  });

  it("orphan data does not influence the scale", () => {
    const { result } = setup({
      data: [
        { code: "A", v: 1 },
        { code: "ZZ", v: 1000 },
      ],
    });

    expect(result.current.scale?.domain[1]).toBe(1);
  });

  it("getFeatureId lets you join by a property", () => {
    const { result } = setup({
      getFeatureId: (f) => (f.properties as { name: string }).name,
      data: [{ code: "Alpha", v: 3 }],
    });

    expect(result.current.regions.map((r) => r.id)).toEqual(["Alpha", "Beta"]);
    expect(result.current.regions[0]?.datum).toEqual({ code: "Alpha", v: 3 });
  });

  it("the legend counts regions, with an optional no-data item", () => {
    const { result } = setup({ data: [{ code: "A", v: 1 }], emptyLabel: "Sin dato" });
    const total = result.current.legend.reduce((n, i) => n + i.count, 0);

    expect(total).toBe(2);
    expect(result.current.legend.at(-1)).toMatchObject({ label: "Sin dato", count: 1 });
  });

  it("getRegionProps: click, hover and selection", () => {
    const onItemClick = vi.fn<(event: unknown) => void>();
    const onItemHover = vi.fn<(event: unknown) => void>();
    const { result } = setup({ onItemClick, onItemHover, selectedId: "B" });
    const [a, b] = result.current.regions;
    if (a === undefined || b === undefined) throw new Error("faltan regiones");

    expect(result.current.getRegionProps(a)["data-selected"]).toBeUndefined();
    expect(result.current.getRegionProps(b)["data-selected"]).toBe(true);
    expect(result.current.getRegionProps(a)["data-region-id"]).toBe("A");

    act(() => result.current.getRegionProps(a).onClick({} as never));
    expect(onItemClick).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "region",
        id: "A",
        feature: a.feature,
        datum: a.datum,
        level: { id: "root", depth: 0 },
        drillable: false,
        label: "Alpha",
      }),
    );

    act(() => result.current.getRegionProps(a).onPointerEnter({} as never));
    expect(result.current.store.getState().hovered).toEqual({ kind: "region", id: "A" });
    expect(onItemHover).toHaveBeenLastCalledWith(expect.objectContaining({ id: "A" }));

    act(() => result.current.getRegionProps(a).onPointerLeave({} as never));
    expect(result.current.store.getState().hovered).toBeNull();
    expect(onItemHover).toHaveBeenLastCalledWith(null);
  });

  it("without handlers, click and hover do not fail", () => {
    const { result } = setup();
    const a = result.current.regions[0];
    if (a === undefined) throw new Error("missing region");

    act(() => {
      result.current.getRegionProps(a).onClick({} as never);
      result.current.getRegionProps(a).onPointerEnter({} as never);
    });
    expect(result.current.store.getState().hovered).toEqual({ kind: "region", id: "A" });
  });

  it("omits regions without an id", () => {
    const geo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
      ],
    };

    expect(setup({ geography: geo, data: [] }).result.current.regions).toEqual([]);
  });
});

describe("useChoropleth · diagnostics", () => {
  const warn = () => vi.mocked(console.warn);

  it("warns once on the console with the hints when there are ids that did not join", () => {
    setup({ data: [{ code: "ES", v: 1 }] });

    expect(warn()).toHaveBeenCalledTimes(1);
    expect(String(warn().mock.calls[0]?.[0])).toContain("1 datum(s) have no matching geometry");
  });

  it("does not warn again on renders that do not change the result (hover included)", () => {
    const { result, rerender } = setup({ data: [{ code: "ES", v: 1 }] });
    rerender({ data: [{ code: "ES", v: 2 }] }); // another value, same join
    const a = result.current.regions[0];
    if (a === undefined) throw new Error("missing region");
    act(() => result.current.getRegionProps(a).onPointerEnter({} as never));

    expect(warn()).toHaveBeenCalledTimes(1);
  });

  it("warns again when the join result changes", () => {
    const { rerender } = setup({ data: [{ code: "ES", v: 1 }] });
    rerender({ data: [{ code: "FR", v: 1 }] });

    expect(warn()).toHaveBeenCalledTimes(2);
  });

  it("does not warn if everything joins, if there is no data yet, or with diagnostics={false}", () => {
    setup({
      data: [
        { code: "A", v: 1 },
        { code: "B", v: 2 },
      ],
    });
    setup({ data: [] });
    setup({ data: [{ code: "ES", v: 1 }], diagnostics: false });

    expect(warn()).not.toHaveBeenCalled();
  });

  it("does not write to the console in production, but onJoinReport is still called", () => {
    vi.stubEnv("NODE_ENV", "production");
    const onJoinReport = vi.fn<(report: unknown) => void>();
    setup({ data: [{ code: "ES", v: 1 }], onJoinReport });
    vi.unstubAllEnvs();

    expect(warn()).not.toHaveBeenCalled();
    expect(onJoinReport).toHaveBeenCalledWith(
      expect.objectContaining({ unmatchedData: ["ES"], featuresWithoutData: ["A", "B"] }),
    );
  });

  it("onJoinReport is called on mount and when the join changes, not on every render", () => {
    const onJoinReport = vi.fn<(report: unknown) => void>();
    const { rerender } = setup({ data: [{ code: "A", v: 1 }], onJoinReport });
    rerender({ data: [{ code: "A", v: 5 }], onJoinReport: () => onJoinReport(1) });
    expect(onJoinReport).toHaveBeenCalledTimes(1);

    rerender({ data: [{ code: "B", v: 5 }], onJoinReport });
    expect(onJoinReport).toHaveBeenCalledTimes(2);
  });
});

describe("useChoropleth · categorical and bubble variants", () => {
  type Shop = {
    code: string;
    kind: string;
    sales: number | null;
    growth?: number;
    at?: [number, number];
  };
  const shops: Shop[] = [
    { code: "A", kind: "outlet", sales: 100, growth: -5 },
    { code: "B", kind: "flagship", sales: 25, growth: 5 },
  ];
  const run = (extra: Record<string, unknown>) =>
    renderHook(() =>
      useChoropleth<Shop>({
        geography: twoSquares,
        data: shops,
        getId: (s: Shop) => s.code,
        width: 200,
        height: 100,
        ...extra,
      } as unknown as UseChoroplethOptions<Shop>),
    ).result.current;

  it("categorical: color per category, value = category, label = label, no numeric scale", () => {
    const r = run({
      variant: "categorical",
      getCategory: (s: Shop) => s.kind,
      categories: [{ id: "flagship", label: "Insignia" }, { id: "outlet" }],
    });

    expect(r.regions[0]?.value).toBe("outlet");
    expect(r.regions[1]?.formattedValue).toBe("Insignia");
    expect(r.regions[0]?.fill).not.toBe(r.regions[1]?.fill);
    expect(r.scale).toBeNull();
    expect(r.legend.map((i) => i.label)).toEqual(["Insignia", "outlet"]);
  });

  it("bubble over regions: one bubble per region with data, at its centroid, neutral regions", () => {
    const r = run({
      variant: "bubble",
      getValue: (s: Shop) => s.sales,
      maxRadius: 20,
      emptyFill: "#ddd",
    });

    expect(r.bubbles.map((b) => b.id)).toEqual(["A", "B"]); // grande primero
    expect(r.bubbles[0]?.r).toBe(20);
    expect(r.bubbles.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y))).toBe(true);
    expect(r.regions.map((x) => x.fill)).toEqual(["#ddd", "#ddd"]);
    expect(r.regions[0]?.formattedValue).toBe("100");
    expect(r.sizeLegend).toHaveLength(3);
  });

  it("bivariate bubble: color by getColorValue and a color legend", () => {
    const r = run({
      variant: "bubble",
      getValue: (s: Shop) => s.sales,
      getColorValue: (s: Shop) => s.growth ?? null,
    });

    expect(r.bubbles[0]?.fill).not.toBe(r.bubbles[1]?.fill);
    expect(r.scale?.kind).toBe("classed");
    expect(r.legend.length).toBeGreaterThan(0);
  });

  it("bubble with getCoordinates: positioned with the projection and does not warn about ids without a region", () => {
    const stores: Shop[] = [
      { code: "tienda-1", kind: "x", sales: 10, at: [0.5, 0.5] },
      { code: "tienda-2", kind: "x", sales: 20, at: [1.5, 0.5] },
      { code: "tienda-3", kind: "x", sales: 30 },
    ];
    const r = run({
      variant: "bubble",
      data: stores,
      getValue: (s: Shop) => s.sales,
      getCoordinates: (s: Shop) => s.at ?? null,
    });

    expect(r.bubbles.map((b) => b.id).sort()).toEqual(["tienda-1", "tienda-2"]);
    expect(r.bubbles[0]?.x).not.toBe(r.bubbles[1]?.x);
    expect(r.joinReport.unmatchedData).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
