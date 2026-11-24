import { geoEqualEarth, geoPath } from "d3-geo";
import { graticuleGeometry, resolveGraticule } from "./graticule";

describe("resolveGraticule", () => {
  it("is off for false and undefined", () => {
    expect(resolveGraticule(undefined)).toBeNull();
    expect(resolveGraticule(false)).toBeNull();
  });

  it("true means 10°, a number applies to both axes, a pair is [lon, lat]", () => {
    expect(resolveGraticule(true)?.step).toEqual([10, 10]);
    expect(resolveGraticule(15)?.step).toEqual([15, 15]);
    expect(resolveGraticule({ step: [30, 15] })?.step).toEqual([30, 15]);
  });

  it("replaces an invalid step with the default", () => {
    expect(resolveGraticule({ step: 0 })?.step).toEqual([10, 10]);
    expect(resolveGraticule({ step: [Number.NaN, 500] })?.step).toEqual([10, 10]);
  });

  it("carries the layer options, defaulting to under the regions and no outline", () => {
    expect(resolveGraticule(true)).toMatchObject({ outline: false, above: false });
    expect(resolveGraticule({ outline: true, above: true, stroke: "red", strokeWidth: 2 })).toEqual(
      {
        step: [10, 10],
        outline: true,
        above: true,
        stroke: "red",
        strokeWidth: 2,
      },
    );
  });
});

describe("graticuleGeometry", () => {
  it("produces more lines with a smaller step", () => {
    const coarse = graticuleGeometry([30, 30]).coordinates.length;
    const fine = graticuleGeometry([10, 10]).coordinates.length;
    expect(fine).toBeGreaterThan(coarse);
  });

  it("projects to a path with a real projection", () => {
    const d = geoPath(geoEqualEarth().fitSize([800, 400], { type: "Sphere" }))(
      graticuleGeometry([10, 10]),
    );
    expect(d).toMatch(/^M/);
    expect(d).not.toContain("NaN");
  });
});
