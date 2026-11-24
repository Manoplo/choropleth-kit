import {
  buildPatternTile,
  DEFAULT_BACKGROUND_COLOR,
  isPatternPresetId,
  PATTERN_PRESET_IDS,
  PATTERN_PRESETS,
  resolveBackground,
  resolvePatternPreset,
} from "./patterns";

describe("pattern presets", () => {
  it("every preset is a square tile with a non-empty path", () => {
    for (const id of PATTERN_PRESET_IDS) {
      const spec = PATTERN_PRESETS[id];
      expect(spec.size).toBeGreaterThan(0);
      expect(spec.d.length).toBeGreaterThan(0);
      expect(["stroke", "fill"]).toContain(spec.kind);
    }
  });

  it("has the main families", () => {
    expect(PATTERN_PRESET_IDS).toEqual(
      expect.arrayContaining([
        "dots",
        "grid",
        "diagonal-up",
        "diagonal-down",
        "checkerboard",
        "waves",
      ]),
    );
    expect(PATTERN_PRESET_IDS.length).toBeGreaterThanOrEqual(30);
  });

  it("recognizes ids, and rejects custom names, none and non-strings", () => {
    expect(isPatternPresetId("dots")).toBe(true);
    expect(isPatternPresetId("none")).toBe(false);
    expect(isPatternPresetId("my-stripes")).toBe(false);
    expect(isPatternPresetId(undefined)).toBe(false);
    expect(isPatternPresetId("toString")).toBe(false);
    expect(resolvePatternPreset("nope")).toBeNull();
    expect(resolvePatternPreset(null)).toBeNull();
    expect(resolvePatternPreset("grid")?.size).toBe(6);
  });
});

describe("buildPatternTile", () => {
  it("scales the element but not the viewBox", () => {
    const tile = buildPatternTile("dots", 2);
    expect(tile?.size).toBe(12);
    expect(tile?.viewBox).toBe("0 0 6 6");
  });

  it("defaults the stroke width and carries the dash", () => {
    expect(buildPatternTile("grid")?.strokeWidth).toBe(1);
    expect(buildPatternTile("rings")?.strokeWidth).toBe(0.8);
    expect(buildPatternTile("vertical-dashed")?.dash).toBe("3 3");
    expect(buildPatternTile("grid")?.dash).toBeUndefined();
  });

  it("falls back to scale 1 for a nonsensical scale, and returns null for unknown ids", () => {
    expect(buildPatternTile("dots", 0)?.size).toBe(6);
    expect(buildPatternTile("dots", Number.NaN)?.size).toBe(6);
    expect(buildPatternTile("custom")).toBeNull();
  });
});

describe("resolveBackground", () => {
  it("draws nothing for false, undefined, none and unknown ids", () => {
    expect(resolveBackground(undefined)).toBeNull();
    expect(resolveBackground(false)).toBeNull();
    expect(resolveBackground("none")).toBeNull();
    expect(resolveBackground({ pattern: "none" })).toBeNull();
    expect(resolveBackground({ pattern: "nope" as never })).toBeNull();
  });

  it("true means dots with the defaults; a string is the preset", () => {
    expect(resolveBackground(true)).toEqual({
      pattern: "dots",
      color: DEFAULT_BACKGROUND_COLOR,
      opacity: 1,
      scale: 1,
      fadeX: 10,
      fadeY: 10,
    });
    expect(resolveBackground("grid")?.pattern).toBe("grid");
  });

  it("turns a fade off per axis and clamps lengths, opacity and scale", () => {
    const bg = resolveBackground({
      fadeHorizontal: false,
      fadeVerticalLength: 99,
      opacity: 5,
      scale: -3,
    });
    expect(bg).toMatchObject({ fadeX: 0, fadeY: 45, opacity: 1, scale: 0.1 });
  });
});
