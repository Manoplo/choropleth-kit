import { buildCategoricalLegend, createCategoricalScale } from "./categories";
import { CATEGORICAL_PALETTES } from "./palettes";

const make = (values: (string | null)[], extra = {}) =>
  createCategoricalScale({ values, emptyFill: "#ddd", ...extra });

describe("createCategoricalScale", () => {
  it("automatic categories in ALPHABETICAL order, not order of appearance", () => {
    const a = make(["b", "a", "c"]);
    const b = make(["c", "b", "a"]);

    expect(a.categories.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(a.getColor("a")).toBe(b.getColor("a")); // the color does not depend on the order of the data
  });

  it("uses the palette by position and it can be changed", () => {
    expect(make(["x"]).getColor("x")).toBe(CATEGORICAL_PALETTES.tableau10[0]);
    expect(make(["x"], { palette: "set2" }).getColor("x")).toBe(CATEGORICAL_PALETTES.set2[0]);
  });

  it("categories fixes order, labels and colors; without a color it uses the palette by position", () => {
    const scale = make(["x"], {
      categories: [{ id: "eu", label: "Europa", color: "#123456" }, { id: "as" }],
    });

    expect(scale.getColor("eu")).toBe("#123456");
    expect(scale.getLabel("eu")).toBe("Europa");
    expect(scale.getColor("as")).toBe(CATEGORICAL_PALETTES.tableau10[1]);
    expect(scale.getLabel("as")).toBe("as");
  });

  it("null, undefined and unknown categories → emptyFill", () => {
    const scale = make(["a"], { categories: [{ id: "a" }] });

    expect(scale.getColor(null)).toBe("#ddd");
    expect(scale.getColor(undefined)).toBe("#ddd");
    expect(scale.getColor("zzz")).toBe("#ddd");
    expect(scale.getLabel(null)).toBe("");
    expect(scale.getLabel("zzz")).toBe("zzz");
  });

  it("with more categories than colors, the colors repeat", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${String(i).padStart(2, "0")}`);
    const scale = make(ids);

    expect(scale.getColor("c10")).toBe(scale.getColor("c00"));
  });
});

describe("buildCategoricalLegend", () => {
  it("one item per category with its count, and an optional no data item", () => {
    const values = ["a", "a", "b", null, "zzz"];
    const scale = make(values, { categories: [{ id: "a", label: "Alfa" }, { id: "b" }] });
    const items = buildCategoricalLegend({ scale, values, emptyLabel: "Sin dato" });

    expect(items.map((i) => [i.label, i.count])).toEqual([
      ["Alfa", 2],
      ["b", 1],
      ["Sin dato", 2],
    ]);
    expect(buildCategoricalLegend({ scale, values })).toHaveLength(2);
  });
});
