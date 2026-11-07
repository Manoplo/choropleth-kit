import { classIndex } from "./legend";
import { resolveVariant, type ResolveVariantOptions, type VariantEntry } from "./variants";

// Índice de clase por región (`classes`): lo que permite resaltar una clase de la leyenda sin re-renderizar.

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
  it("clasificada: la clase de cada región es la de su color, y coincide con los conteos de la leyenda", () => {
    const r = run(
      {
        variant: "sequential",
        getValue: (d) => d.v,
        classification: { method: "quantile", classes: 3 },
      },
      "No data",
    );

    // D (nulo) y E (sin fila) no pertenecen a ninguna clase.
    expect(r.classes[3]).toBeNull();
    expect(r.classes[4]).toBeNull();
    const counts = r.legend.filter((i) => i.empty !== true).map(() => 0);
    for (const c of r.classes) if (c !== null) counts[c] = (counts[c] ?? 0) + 1;
    expect(counts).toEqual(r.legend.filter((i) => i.empty !== true).map((i) => i.count));
    // Y el color del item de esa clase es el color con el que se pinta la región.
    const colorOfClass = r.classes.flatMap((c, i) =>
      c === null ? [] : [[r.legend[c]?.color, r.fills[i]]],
    );
    expect(colorOfClass.length).toBeGreaterThan(0);
    for (const [legendColor, fill] of colorOfClass) expect(legendColor).toBe(fill);
  });

  it("el item de «sin dato» está marcado y no es una clase", () => {
    const r = run({ variant: "sequential", getValue: (d) => d.v }, "No data");
    expect(r.legend.at(-1)?.empty).toBe(true);
    expect(r.legend.slice(0, -1).every((i) => i.empty === undefined)).toBe(true);
  });

  it("diverging también", () => {
    const r = run({
      variant: "diverging",
      getValue: (d) => (d.v === null ? null : d.v - 50),
      midpoint: 0,
    });
    expect(r.classes[0]).toBeLessThan(r.classes[2] as number);
  });

  it("escala continua: ninguna región tiene clase (no hay clases que resaltar)", () => {
    const r = run({
      variant: "sequential",
      getValue: (d) => d.v,
      classification: { method: "linear" },
    });
    expect(r.scale?.kind).toBe("continuous");
    expect(r.classes).toEqual([null, null, null, null, null]);
  });

  it("categórica: el índice es el de la categoría en la leyenda; las desconocidas y sin dato, null", () => {
    const r = run(
      {
        variant: "categorical",
        getCategory: (d) => d.cat ?? null,
        categories: [{ id: "y" }, { id: "x" }],
      },
      "No data",
    );
    expect(r.classes).toEqual([1, 0, 1, null, null]); // `zzz` no está declarada
    expect(r.legend[0]?.label).toBe("y");
  });

  it("bubble: las regiones no llevan clase (el color va en las burbujas)", () => {
    const r = run({ variant: "bubble", getValue: (d) => d.v });
    expect(r.classes.every((c) => c === null)).toBe(true);
  });
});

describe("classIndex", () => {
  it("un valor justo en un corte cae en la clase de ARRIBA", () => {
    expect(classIndex([10, 20], 9.99)).toBe(0);
    expect(classIndex([10, 20], 10)).toBe(1);
    expect(classIndex([10, 20], 20)).toBe(2);
    expect(classIndex([], 5)).toBe(0);
  });
});
