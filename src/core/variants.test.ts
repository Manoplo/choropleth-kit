import { resolveVariant, type ResolveVariantOptions, type VariantEntry } from "./variants";

type Row = {
  id: string;
  v: number | null;
  cat?: string;
  cv?: number | null;
  at?: [number, number];
};

const entries: VariantEntry<Row>[] = [
  { id: "A", datum: { id: "A", v: 100, cat: "x", cv: -5 } },
  { id: "B", datum: { id: "B", v: 25, cat: "y", cv: 5 } },
  { id: "C", datum: undefined },
];

const common = {
  entries,
  data: entries.flatMap((e) => (e.datum === undefined ? [] : [e.datum])),
  getId: (r: Row) => r.id,
  centroids: [
    [10, 10],
    [20, 20],
    [30, 30],
  ] as const,
  project: ([lon, lat]: readonly [number, number]) => [lon * 2, lat * 2] as const,
  emptyFill: "#ddd",
  formatValue: (v: number) => `${v}u`,
};

const run = (config: ResolveVariantOptions<Row>["config"], extra = {}) =>
  resolveVariant<Row>({ ...common, config, ...extra });

describe("resolveVariant · sequential / diverging", () => {
  it("colors, formats and builds the legend; no data → emptyFill", () => {
    const r = run({ variant: "sequential", getValue: (d) => d.v });

    expect(r.fills[2]).toBe("#ddd");
    expect(r.fills[0]).not.toBe(r.fills[1]);
    expect(r.labels).toEqual(["100u", "25u", ""]);
    expect(r.values).toEqual([100, 25, null]);
    expect(r.scale?.kind).toBe("classed");
    expect(r.legend.length).toBeGreaterThan(0);
    expect(r.bubbles).toEqual([]);
  });

  it("diverging uses a symmetric domain", () => {
    const r = run({ variant: "diverging", getValue: (d) => d.cv ?? null, midpoint: 0 });

    expect(r.scale?.domain).toEqual([-5, 5]);
  });
});

describe("resolveVariant · categorical", () => {
  it("colors by category, labels and legend with counts", () => {
    const r = run(
      {
        variant: "categorical",
        getCategory: (d) => d.cat ?? null,
        categories: [{ id: "x", label: "Equis" }, { id: "y" }],
      },
      { emptyLabel: "Sin dato" },
    );

    expect(r.fills[0]).not.toBe(r.fills[1]);
    expect(r.fills[2]).toBe("#ddd");
    expect(r.labels).toEqual(["Equis", "y", ""]);
    expect(r.values).toEqual(["x", "y", null]);
    expect(r.scale).toBeNull();
    expect(r.legend.map((i) => [i.label, i.count])).toEqual([
      ["Equis", 1],
      ["y", 1],
      ["Sin dato", 1],
    ]);
  });
});

describe("resolveVariant · bubble", () => {
  const bubble = { variant: "bubble", getValue: (d: Row) => d.v, maxRadius: 20 } as const;

  it("neutral regions and one bubble per region with data, at its centroid", () => {
    const r = run(bubble);

    expect(r.fills).toEqual(["#ddd", "#ddd", "#ddd"]);
    expect(r.bubbles.map((b) => [b.id, b.x, b.y])).toEqual([
      ["A", 10, 10],
      ["B", 20, 20],
    ]);
    expect(r.values).toEqual([100, 25, null]);
    expect(r.labels).toEqual(["100u", "25u", ""]);
  });

  it("area ∝ value and the big ones go first", () => {
    const r = run({ ...bubble, getValue: (d: Row) => (d.id === "A" ? 400 : 100) });

    expect(r.bubbles[0]?.id).toBe("A");
    expect(r.bubbles[0]?.r).toBe(20);
    expect(r.bubbles[1]?.r).toBeCloseTo(10);
  });

  it("single color by default or the given one; no scale or color legend", () => {
    expect(run(bubble).bubbles[0]?.fill).toBe("#2563eb");
    const r = run({ ...bubble, color: "red" });

    expect(r.bubbles[0]?.fill).toBe("red");
    expect(r.scale).toBeNull();
    expect(r.legend).toEqual([]);
    expect(r.sizeLegend).toHaveLength(3);
  });

  it("bivariate: getColorValue colors with a diverging scale and gives a color legend", () => {
    const r = run(
      { ...bubble, getColorValue: (d: Row) => d.cv ?? null },
      { emptyLabel: "Sin dato" },
    );
    const [a, b] = [r.bubbles.find((x) => x.id === "A"), r.bubbles.find((x) => x.id === "B")];

    expect(a?.fill).not.toBe(b?.fill);
    expect(a?.colorValue).toBe(-5);
    expect(r.scale?.kind).toBe("classed");
    expect(r.legend.length).toBeGreaterThan(0);
  });

  it("null, 0 or negative values draw no bubble", () => {
    const r = run({ ...bubble, getValue: (d: Row) => (d.id === "A" ? 0 : -3) });

    expect(r.bubbles).toEqual([]);
    expect(r.sizeLegend).toEqual([]);
  });

  it("getCoordinates: positions by projected [lon, lat], without going through the regions", () => {
    const stores: Row[] = [
      { id: "s1", v: 10, at: [1, 2] },
      { id: "s2", v: 20, at: [3, 4] },
      { id: "s3", v: 30 },
      { id: "s4", v: 40, at: [9, 9] },
    ];
    const r = run(
      { ...bubble, getCoordinates: (d: Row) => d.at ?? null },
      {
        data: stores,
        project: ([lon, lat]: readonly [number, number]) =>
          lon === 9 ? null : ([lon * 2, lat * 2] as const),
      },
    );

    expect(r.bubbles.map((b) => [b.id, b.x, b.y]).sort()).toEqual([
      ["s1", 2, 4],
      ["s2", 6, 8],
    ]);
    // Own coordinates travel with the bubble: that way the UI knows it is a point, not a region.
    expect(r.bubbles.map((b) => b.coordinates).sort()).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("a region without a centroid gets no bubble", () => {
    const r = run(bubble, { centroids: [null, [20, 20], null] });

    expect(r.bubbles.map((b) => b.id)).toEqual(["B"]);
  });

  it("bubble at a region's centroid: `coordinates` is null", () => {
    const r = run(bubble);

    expect(r.bubbles.length).toBeGreaterThan(0);
    expect(r.bubbles.every((b) => b.coordinates === null)).toBe(true);
  });
});
