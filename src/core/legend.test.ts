import { buildLegend } from "./legend";
import { createColorScale } from "./scales";

const threshold = (thresholds: number[], values: (number | null)[] = []) =>
  createColorScale({
    variant: "sequential",
    values,
    classification: { method: "threshold", thresholds },
  });

describe("buildLegend", () => {
  it("un item por clase, con los colores y límites de la escala", () => {
    const scale = threshold([0, 10]);
    const items = buildLegend({ scale, values: [] });

    expect(items.map((i) => i.color)).toEqual([...scale.colors]);
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ from: 0, to: 10 });
    expect(items[0]?.to).toBe(0);
    expect(items[2]?.from).toBe(10);
  });

  it("cuenta las regiones por clase y un valor en un corte va a la clase de arriba", () => {
    const scale = threshold([0, 10]);
    const items = buildLegend({ scale, values: [-5, 0, 5, 10, 99] });

    expect(items.map((i) => i.count)).toEqual([1, 2, 2]);
  });

  it("el conteo coincide con el color que pinta el mapa", () => {
    const values = [3, 8, 1, 9, 4, 7, 2, 6, 5, 10];
    const scale = createColorScale({ variant: "sequential", values });
    const items = buildLegend({ scale, values });

    for (const item of items) {
      expect(values.filter((v) => scale.getColor(v) === item.color)).toHaveLength(item.count);
    }
  });

  it("emptyLabel añade un item de sin dato que cuenta null/undefined/NaN pero no el 0", () => {
    const scale = threshold([5]);
    const items = buildLegend({
      scale,
      values: [0, null, undefined, NaN, 9],
      emptyLabel: "Sin dato",
    });

    expect(items.at(-1)).toEqual({ color: scale.emptyFill, label: "Sin dato", count: 3 });
    expect(items[0]?.count).toBe(1);
  });

  it("sin emptyLabel no hay item de sin dato", () => {
    expect(buildLegend({ scale: threshold([5]), values: [null] })).toHaveLength(2);
  });

  it("formatValue da forma a las etiquetas", () => {
    const items = buildLegend({ scale: threshold([5]), values: [], formatValue: (v) => `${v} %` });

    expect(items[1]?.label).toBe(`5 % – ${items[1]?.to} %`);
    expect(items[0]?.label.endsWith("5 %")).toBe(true);
  });

  it("formato por defecto: enteros sin decimales y máximo 2 decimales", () => {
    const items = buildLegend({ scale: threshold([1.23456]), values: [] });

    expect(items[0]?.label.endsWith("1.23")).toBe(true);
  });

  it("escala continua: sin clases, sin items", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [1, 2],
      classification: { method: "linear" },
    });

    expect(buildLegend({ scale, values: [1, 2] })).toEqual([]);
  });
});
