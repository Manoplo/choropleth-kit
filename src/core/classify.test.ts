import { computeThresholds, finiteValues } from "./classify";

describe("finiteValues", () => {
  it("discards null, undefined, NaN and Infinity but keeps 0", () => {
    expect(finiteValues([1, null, undefined, NaN, Infinity, -Infinity, 0])).toEqual([1, 0]);
  });
});

describe("computeThresholds", () => {
  const domain = [0, 100] as const;

  it("linear has no breaks", () => {
    expect(
      computeThresholds({ values: [1, 2, 3], classification: { method: "linear" }, domain }),
    ).toEqual([]);
  });

  it("quantize splits the range into equal bands", () => {
    expect(
      computeThresholds({ values: [], classification: { method: "quantize", classes: 4 }, domain }),
    ).toEqual([25, 50, 75]);
  });

  it("quantize uses 5 classes by default", () => {
    expect(
      computeThresholds({ values: [], classification: { method: "quantize" }, domain }),
    ).toEqual([20, 40, 60, 80]);
  });

  it("quantile splits the data, not the range (skewed data)", () => {
    // An extreme value (1000) does not shift the others' breaks, unlike quantize.
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

  it("quantile without values returns no breaks", () => {
    expect(
      computeThresholds({ values: [], classification: { method: "quantile" }, domain }),
    ).toEqual([]);
  });

  it("quantile with one class has no breaks", () => {
    expect(
      computeThresholds({
        values: [1, 2, 3],
        classification: { method: "quantile", classes: 1 },
        domain,
      }),
    ).toEqual([]);
  });

  it("threshold returns a copy of the given breaks", () => {
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
    ).toThrow(/ascending/);
  });

  it.each([0, -1, 2.5, NaN])("lanza error con classes = %s", (classes) => {
    expect(() =>
      computeThresholds({ values: [1], classification: { method: "quantize", classes }, domain }),
    ).toThrow(/integer/);
    expect(() =>
      computeThresholds({ values: [1], classification: { method: "quantile", classes }, domain }),
    ).toThrow(/integer/);
  });
});
