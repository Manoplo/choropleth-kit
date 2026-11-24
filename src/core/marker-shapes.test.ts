import {
  defaultMarkerAnchor,
  isMarkerShape,
  MARKER_SHAPE_SPECS,
  MARKER_SHAPES,
  resolveMarkerPreset,
} from "./marker-shapes";

describe("marker shapes", () => {
  it("every shape has a closed path in a positive viewBox", () => {
    for (const shape of MARKER_SHAPES) {
      const spec = MARKER_SHAPE_SPECS[shape];
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.d).toMatch(/^M/);
      expect(spec.d.toLowerCase()).toContain("z");
    }
  });

  it("recognizes only the catalogue's shapes", () => {
    expect(isMarkerShape("pin")).toBe(true);
    expect(isMarkerShape("star")).toBe(false);
    expect(isMarkerShape("toString")).toBe(false);
    expect(isMarkerShape(undefined)).toBe(false);
  });

  it("a pin ends exactly at the bottom-center of its viewBox (its tip is the coordinate)", () => {
    const { width, height, d } = MARKER_SHAPE_SPECS.pin;
    expect(d.startsWith(`M${width / 2} ${height}`)).toBe(true);
  });
});

describe("resolveMarkerPreset", () => {
  it("defaults to a 12 px circle without pulse or glow", () => {
    expect(resolveMarkerPreset()).toMatchObject({
      shape: "circle",
      width: 12,
      height: 12,
      pulse: "none",
      glow: 0,
      strokeWidth: 1.5,
    });
  });

  it("keeps the proportion of the shape (a pin is taller than wide)", () => {
    const pin = resolveMarkerPreset({ shape: "pin", size: 12 });
    expect(pin.width).toBe(12);
    expect(pin.height).toBe(16);
    expect(pin.viewBox).toBe("0 0 24 32");
  });

  it("clamps the size and falls back for nonsense", () => {
    expect(resolveMarkerPreset({ size: 0 }).width).toBe(2);
    expect(resolveMarkerPreset({ size: 9999 }).width).toBe(128);
    expect(resolveMarkerPreset({ size: Number.NaN }).width).toBe(12);
    expect(resolveMarkerPreset({ shape: "star" as never }).shape).toBe("circle");
    expect(resolveMarkerPreset({ pulse: "sometimes" as never }).pulse).toBe("none");
  });

  it("never lets glow or stroke width go negative", () => {
    expect(resolveMarkerPreset({ glow: -4 }).glow).toBe(0);
    expect(resolveMarkerPreset({ strokeWidth: -1 }).strokeWidth).toBe(0);
    expect(resolveMarkerPreset({ glow: 6, pulse: "always" })).toMatchObject({
      glow: 6,
      pulse: "always",
    });
  });
});

describe("defaultMarkerAnchor", () => {
  it("puts the tip of a pin on the coordinate and centers everything else", () => {
    expect(defaultMarkerAnchor("pin")).toBe("bottom");
    expect(defaultMarkerAnchor("circle")).toBe("center");
    expect(defaultMarkerAnchor("diamond")).toBe("center");
  });
});
