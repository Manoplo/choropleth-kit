import { buildLegend } from "./legend";
import { createColorScale } from "./scales";

const threshold = (thresholds: number[], values: (number | null)[] = []) =>
  createColorScale({
    variant: "sequential",
    values,
    classification: { method: "threshold", thresholds },
  });

describe("buildLegend", () => {
  it("one item per class, with the scale's colors and limits", () => {
    const scale = threshold([0, 10]);
    const items = buildLegend({ scale, values: [] });

    expect(items.map((i) => i.color)).toEqual([...scale.colors]);
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ from: 0, to: 10 });
    expect(items[0]?.to).toBe(0);
    expect(items[2]?.from).toBe(10);
  });

  it("counts regions per class and a value on a break goes to the class above", () => {
    const scale = threshold([0, 10]);
    const items = buildLegend({ scale, values: [-5, 0, 5, 10, 99] });

    expect(items.map((i) => i.count)).toEqual([1, 2, 2]);
  });

  it("the count matches the color the map paints", () => {
    const values = [3, 8, 1, 9, 4, 7, 2, 6, 5, 10];
    const scale = createColorScale({ variant: "sequential", values });
    const items = buildLegend({ scale, values });

    for (const item of items) {
      expect(values.filter((v) => scale.getColor(v) === item.color)).toHaveLength(item.count);
    }
  });

  it("emptyLabel adds a no-data item that counts null/undefined/NaN but not 0", () => {
    const scale = threshold([5]);
    const items = buildLegend({
      scale,
      values: [0, null, undefined, NaN, 9],
      emptyLabel: "Sin dato",
    });

    expect(items.at(-1)).toEqual({
      color: scale.emptyFill,
      label: "Sin dato",
      count: 3,
      empty: true,
    });
    expect(items[0]?.count).toBe(1);
  });

  it("without emptyLabel there is no no-data item", () => {
    expect(buildLegend({ scale: threshold([5]), values: [null] })).toHaveLength(2);
  });

  it("formatValue shapes the labels", () => {
    const items = buildLegend({ scale: threshold([5]), values: [], formatValue: (v) => `${v} %` });

    expect(items[1]?.label).toBe(`5 % – ${items[1]?.to} %`);
    expect(items[0]?.label.endsWith("5 %")).toBe(true);
  });

  it("default format: integers without decimals and at most 2 decimals", () => {
    const items = buildLegend({ scale: threshold([1.23456]), values: [] });

    expect(items[0]?.label.endsWith("1.23")).toBe(true);
  });

  it("continuous scale: no classes, no items", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [1, 2],
      classification: { method: "linear" },
    });

    expect(buildLegend({ scale, values: [1, 2] })).toEqual([]);
  });
});
