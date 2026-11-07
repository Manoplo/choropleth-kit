import { DEFAULT_EMPTY_FILL, createColorScale } from "./scales";

describe("createColorScale · sequential", () => {
  const values = [10, 20, 30, 40, 50];

  it("without data (null/undefined/NaN) it returns emptyFill", () => {
    const scale = createColorScale({ variant: "sequential", values });

    expect(scale.getColor(null)).toBe(DEFAULT_EMPTY_FILL);
    expect(scale.getColor(undefined)).toBe(DEFAULT_EMPTY_FILL);
    expect(scale.getColor(NaN)).toBe(DEFAULT_EMPTY_FILL);
  });

  it("0 is a datum: it is colored, it is not emptyFill", () => {
    const scale = createColorScale({ variant: "sequential", values: [0, 5, 10] });

    expect(scale.getColor(0)).not.toBe(DEFAULT_EMPTY_FILL);
  });

  it("accepts a custom emptyFill", () => {
    expect(
      createColorScale({ variant: "sequential", values, emptyFill: "#fff" }).getColor(null),
    ).toBe("#fff");
  });

  it("by default uses quantile with 5 classes: 4 breaks and 5 colors", () => {
    const scale = createColorScale({ variant: "sequential", values });

    expect(scale.kind).toBe("classed");
    expect(scale.thresholds).toHaveLength(4);
    expect(scale.colors).toHaveLength(5);
  });

  it("low and high values get different colors, and the highest class is the last", () => {
    const scale = createColorScale({ variant: "sequential", values });

    expect(scale.getColor(10)).toBe(scale.colors[0]);
    expect(scale.getColor(50)).toBe(scale.colors[4]);
  });

  it("a value exactly on a break belongs to the class above", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [],
      classification: { method: "threshold", thresholds: [0, 10] },
    });

    expect(scale.getColor(-1)).toBe(scale.colors[0]);
    expect(scale.getColor(0)).toBe(scale.colors[1]);
    expect(scale.getColor(9.99)).toBe(scale.colors[1]);
    expect(scale.getColor(10)).toBe(scale.colors[2]);
  });

  it("threshold with N breaks produces N+1 colors", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [],
      classification: { method: "threshold", thresholds: [1, 2, 3] },
    });

    expect(scale.colors).toHaveLength(4);
  });

  it("the chosen palette changes the colors", () => {
    const blues = createColorScale({ variant: "sequential", values, palette: "blues" });
    const reds = createColorScale({ variant: "sequential", values, palette: "reds" });

    expect(blues.colors).not.toEqual(reds.colors);
  });

  it("linear is continuous and clamps values outside the domain", () => {
    const scale = createColorScale({
      variant: "sequential",
      values,
      classification: { method: "linear" },
    });

    expect(scale.kind).toBe("continuous");
    expect(scale.thresholds).toEqual([]);
    expect(scale.getColor(10)).not.toBe(scale.getColor(50));
    expect(scale.getColor(1000)).toBe(scale.getColor(50));
    expect(scale.getColor(null)).toBe(DEFAULT_EMPTY_FILL);
  });

  it("without any value it does not fail: everything is emptyFill except what is queried", () => {
    const scale = createColorScale({ variant: "sequential", values: [null, undefined] });

    expect(scale.domain).toEqual([0, 1]);
    expect(scale.getColor(null)).toBe(DEFAULT_EMPTY_FILL);
  });

  it("ignores null and NaN when computing the domain", () => {
    const scale = createColorScale({ variant: "sequential", values: [null, 4, NaN, 8] });

    expect(scale.domain).toEqual([4, 8]);
  });
});

describe("createColorScale · diverging", () => {
  it("the domain is symmetric around the midpoint", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 5] });

    expect(scale.domain).toEqual([-20, 20]);
  });

  it("respects a midpoint other than 0", () => {
    const scale = createColorScale({ variant: "diverging", values: [90, 120], midpoint: 100 });

    expect(scale.domain).toEqual([80, 120]);
  });

  it("by default: 5 symmetric classes, with the midpoint inside the middle class", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 20] });

    expect(scale.thresholds).toEqual([-12, -4, 4, 12]);
    expect(scale.getColor(0)).toBe(scale.colors[2]);
  });

  it("-x and +x get opposite colors, not the same one", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 20] });

    expect(scale.getColor(-20)).toBe(scale.colors[0]);
    expect(scale.getColor(20)).toBe(scale.colors[4]);
  });

  it("if all values are the midpoint, the domain does not degenerate", () => {
    const scale = createColorScale({ variant: "diverging", values: [0, 0] });

    expect(scale.domain).toEqual([-1, 1]);
    expect(scale.getColor(0)).toBe(scale.colors[2]);
  });

  it("diverging linear: the midpoint gets the palette's neutral color", () => {
    const scale = createColorScale({
      variant: "diverging",
      values: [-10, 10],
      classification: { method: "linear" },
    });

    expect(scale.kind).toBe("continuous");
    expect(scale.getColor(0)).not.toBe(scale.getColor(-10));
    expect(scale.getColor(-10)).not.toBe(scale.getColor(10));
    expect(scale.getColor(null)).toBe(DEFAULT_EMPTY_FILL);
  });

  it("accepts a diverging palette by name", () => {
    const rdbu = createColorScale({ variant: "diverging", values: [-1, 1] });
    const piyg = createColorScale({ variant: "diverging", values: [-1, 1], palette: "piyg" });

    expect(rdbu.colors).not.toEqual(piyg.colors);
  });
});

describe("createColorScale · tipos", () => {
  it("rejects at compile time a diverging palette on a sequential map", () => {
    // The real check belongs to the compiler (`pnpm typecheck` fails if the error disappears).
    // The function is not run: at runtime that palette does not exist and would throw.
    const compileTimeOnly = () =>
      // @ts-expect-error "rdbu" is diverging: it does not exist among the sequential palettes.
      createColorScale({ variant: "sequential", values: [1, 2], palette: "rdbu" });

    expect(compileTimeOnly).toBeTypeOf("function");
  });
});
