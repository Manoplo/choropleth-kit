import { classIndex } from "./legend";
import { resolveVariant, type ResolveVariantOptions, type VariantEntry } from "./variants";

// Class index per region (`classes`): what makes it possible to highlight a legend class without re-rendering.

type Row = { id: string; v: number | null; cat?: string };

const rows: Row[] = [
  { id: "A", v: 1, cat: "x" },
  { id: "B", v: 50, cat: "y" },
  { id: "C", v: 99, cat: "x" },
  { id: "D", v: null, cat: "zzz" },
];
const entries: VariantEntry<Row>[] = [
  ...rows.map((datum) => ({ id: datum.id, datum })),
  { id: "E", datum: undefined },
];
const run = (config: ResolveVariantOptions<Row>["config"], emptyLabel?: string) =>
  resolveVariant<Row>({
    config,
    entries,
    data: rows,
    getId: (r) => r.id,
    centroids: entries.map(() => [0, 0] as const),
    project: ([lon, lat]) => [lon, lat] as const,
    emptyFill: "#ddd",
    formatValue: String,
    emptyLabel,
  });

describe("resolveVariant · classes", () => {
  it("classed: each region's class is that of its color, and matches the legend's counts", () => {
    const r = run(
      {
        variant: "sequential",
        getValue: (d) => d.v,
        classification: { method: "quantile", classes: 3 },
      },
      "No data",
    );

    // D (null) and E (no row) belong to no class.
    expect(r.classes[3]).toBeNull();
    expect(r.classes[4]).toBeNull();
    const counts = r.legend.filter((i) => i.empty !== true).map(() => 0);
    for (const c of r.classes) if (c !== null) counts[c] = (counts[c] ?? 0) + 1;
    expect(counts).toEqual(r.legend.filter((i) => i.empty !== true).map((i) => i.count));
    // And that class's item color is the color the region is painted with.
    const colorOfClass = r.classes.flatMap((c, i) =>
      c === null ? [] : [[r.legend[c]?.color, r.fills[i]]],
    );
    expect(colorOfClass.length).toBeGreaterThan(0);
    for (const [legendColor, fill] of colorOfClass) expect(legendColor).toBe(fill);
  });

  it("the no-data item is marked and is not a class", () => {
    const r = run({ variant: "sequential", getValue: (d) => d.v }, "No data");
    expect(r.legend.at(-1)?.empty).toBe(true);
    expect(r.legend.slice(0, -1).every((i) => i.empty === undefined)).toBe(true);
  });

  it("diverging too", () => {
    const r = run({
      variant: "diverging",
      getValue: (d) => (d.v === null ? null : d.v - 50),
      midpoint: 0,
    });
    expect(r.classes[0]).toBeLessThan(r.classes[2] as number);
  });

  it("continuous scale: no region has a class (there are no classes to highlight)", () => {
    const r = run({
      variant: "sequential",
      getValue: (d) => d.v,
      classification: { method: "linear" },
    });
    expect(r.scale?.kind).toBe("continuous");
    expect(r.classes).toEqual([null, null, null, null, null]);
  });

  it("categorical: the index is the category's in the legend; unknown and no data, null", () => {
    const r = run(
      {
        variant: "categorical",
        getCategory: (d) => d.cat ?? null,
        categories: [{ id: "y" }, { id: "x" }],
      },
      "No data",
    );
    expect(r.classes).toEqual([1, 0, 1, null, null]); // `zzz` is not declared
    expect(r.legend[0]?.label).toBe("y");
  });

  it("bubble: regions carry no class (the color is in the bubbles)", () => {
    const r = run({ variant: "bubble", getValue: (d) => d.v });
    expect(r.classes.every((c) => c === null)).toBe(true);
  });
});

describe("classIndex", () => {
  it("a value exactly on a break falls in the class ABOVE", () => {
    expect(classIndex([10, 20], 9.99)).toBe(0);
    expect(classIndex([10, 20], 10)).toBe(1);
    expect(classIndex([10, 20], 20)).toBe(2);
    expect(classIndex([], 5)).toBe(0);
  });
});
