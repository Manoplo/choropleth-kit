import { computeThresholds, finiteValues } from "./classify";

describe("finiteValues", () => {
  it("descarta null, undefined, NaN e Infinity pero conserva el 0", () => {
    expect(finiteValues([1, null, undefined, NaN, Infinity, -Infinity, 0])).toEqual([1, 0]);
  });
});

describe("computeThresholds", () => {
  const domain = [0, 100] as const;

  it("linear no tiene cortes", () => {
    expect(
      computeThresholds({ values: [1, 2, 3], classification: { method: "linear" }, domain }),
    ).toEqual([]);
  });

  it("quantize reparte el rango en tramos iguales", () => {
    expect(
      computeThresholds({ values: [], classification: { method: "quantize", classes: 4 }, domain }),
    ).toEqual([25, 50, 75]);
  });

  it("quantize usa 5 clases por defecto", () => {
    expect(
      computeThresholds({ values: [], classification: { method: "quantize" }, domain }),
    ).toEqual([20, 40, 60, 80]);
  });

  it("quantile reparte los datos, no el rango (datos sesgados)", () => {
    // Un valor extremo (1000) no desplaza los cortes de los demás, a diferencia de quantize.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000];
    const quantile = computeThresholds({
      values,
      classification: { method: "quantile", classes: 2 },
      domain: [1, 1000],
    });
    const quantize = computeThresholds({
      values,
      classification: { method: "quantize", classes: 2 },
      domain: [1, 1000],
    });

    expect(quantile).toEqual([5.5]);
    expect(quantize).toEqual([500.5]);
  });

  it("quantile sin valores devuelve sin cortes", () => {
    expect(
      computeThresholds({ values: [], classification: { method: "quantile" }, domain }),
    ).toEqual([]);
  });

  it("quantile con una clase no tiene cortes", () => {
    expect(
      computeThresholds({
        values: [1, 2, 3],
        classification: { method: "quantile", classes: 1 },
        domain,
      }),
    ).toEqual([]);
  });

  it("threshold devuelve una copia de los cortes dados", () => {
    const given = [0, 5, 10];
    const result = computeThresholds({
      values: [],
      classification: { method: "threshold", thresholds: given },
      domain,
    });

    expect(result).toEqual([0, 5, 10]);
    expect(result).not.toBe(given);
  });

  it.each([
    ["desordenados", [5, 0]],
    ["repetidos", [1, 1]],
    ["con NaN", [0, NaN]],
  ])("threshold lanza error con cortes %s", (_label, thresholds) => {
    expect(() =>
      computeThresholds({
        values: [],
        classification: { method: "threshold", thresholds },
        domain,
      }),
    ).toThrow(/ascendente/);
  });

  it.each([0, -1, 2.5, NaN])("lanza error con classes = %s", (classes) => {
    expect(() =>
      computeThresholds({ values: [1], classification: { method: "quantize", classes }, domain }),
    ).toThrow(/entero/);
    expect(() =>
      computeThresholds({ values: [1], classification: { method: "quantile", classes }, domain }),
    ).toThrow(/entero/);
  });
});
