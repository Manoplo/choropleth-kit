import { buildSizeLegend, createRadiusScale } from "./bubbles";

describe("createRadiusScale", () => {
  it("the AREA is proportional to the value: double the value → ×√2 the radius", () => {
    const scale = createRadiusScale({ values: [100, 400], maxRadius: 20 });

    expect(scale.getRadius(400)).toBe(20);
    expect(scale.getRadius(100)).toBeCloseTo(10);
    expect(Math.PI * scale.getRadius(400) ** 2).toBeCloseTo(
      4 * Math.PI * scale.getRadius(100) ** 2,
    );
  });

  it("the domain starts at 0: the minimum value does not disappear", () => {
    const scale = createRadiusScale({ values: [10, 20], maxRadius: 10 });

    expect(scale.getRadius(10)).toBeGreaterThan(0);
    expect(scale.getRadius(0)).toBe(0);
  });

  it("ignores null/NaN/negatives when looking for the maximum and clamps values above the maximum", () => {
    const scale = createRadiusScale({ values: [null, undefined, NaN, -5, 9], maxRadius: 6 });

    expect(scale.max).toBe(9);
    expect(scale.getRadius(1000)).toBe(6);
  });

  it("without positive values: radius 0 (not NaN)", () => {
    const scale = createRadiusScale({ values: [null, 0, -1] });

    expect(scale.max).toBe(0);
    expect(scale.getRadius(5)).toBe(0);
  });

  it("default maxRadius", () => {
    expect(createRadiusScale({ values: [1] }).maxRadius).toBe(24);
  });
});

describe("buildSizeLegend", () => {
  it("three reference circles (¼, ½, maximum) with their label", () => {
    const items = buildSizeLegend({
      scale: createRadiusScale({ values: [100], maxRadius: 20 }),
      formatValue: (v) => `${v} €`,
    });

    expect(items.map((i) => i.label)).toEqual(["25 €", "50 €", "100 €"]);
    expect(items[2]?.radius).toBe(20);
    expect(items[0]?.radius).toBeLessThan(items[1]?.radius ?? 0);
  });

  it("default format and empty without values", () => {
    expect(buildSizeLegend({ scale: createRadiusScale({ values: [8] }) })[1]?.label).toBe("4");
    expect(buildSizeLegend({ scale: createRadiusScale({ values: [] }) })).toEqual([]);
  });
});
