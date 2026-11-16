import {
  createRampInterpolator,
  diagnoseRamp,
  isCustomRamp,
  MIN_LIGHTNESS_SPAN,
  sampleRampColors,
} from "./ramps";
import { createColorScale } from "./scales";

describe("createRampInterpolator", () => {
  it("two colors: t = 0 is the first and t = 1 the second", () => {
    const ramp = createRampInterpolator({ from: "#000000", to: "#ffffff" });

    expect(ramp(0)).toBe("rgb(0, 0, 0)");
    expect(ramp(1)).toBe("rgb(255, 255, 255)");
    expect(ramp(0.5)).toBe("rgb(128, 128, 128)");
  });

  it("an array is a list of stops, evenly spaced: the middle one is hit exactly at t = 0.5", () => {
    const ramp = createRampInterpolator(["#000000", "#ff0000", "#ffffff"]);

    expect(ramp(0)).toBe("rgb(0, 0, 0)");
    expect(ramp(0.5)).toBe("rgb(255, 0, 0)");
    expect(ramp(1)).toBe("rgb(255, 255, 255)");
  });

  it("{ stops } is the same as the array, and accepts a space", () => {
    const plain = createRampInterpolator(["#000000", "#ffffff"]);
    const object = createRampInterpolator({ stops: ["#000000", "#ffffff"] });

    expect(object(0.3)).toBe(plain(0.3));
  });

  it("the interpolation space changes the colors in between, not the ends", () => {
    const rgb = createRampInterpolator({ from: "#000000", to: "#2563eb", space: "rgb" });
    const lab = createRampInterpolator({ from: "#000000", to: "#2563eb", space: "lab" });

    expect(lab(0)).toBe(rgb(0));
    expect(lab(1)).toBe(rgb(1));
    expect(lab(0.5)).not.toBe(rgb(0.5));
  });

  it("accepts any CSS color the browser does: hex, rgb() and names", () => {
    expect(() => createRampInterpolator(["red", "rgb(0, 0, 255)", "#fff"])).not.toThrow();
  });

  it("one color fails, saying that two are needed", () => {
    expect(() => createRampInterpolator(["#000000"])).toThrow(/at least two colors/);
    expect(() => createRampInterpolator([])).toThrow(/at least two colors/);
  });

  it("an unparsable color fails naming it", () => {
    expect(() => createRampInterpolator(["#000000", "azulito"])).toThrow(
      /"azulito" is not a CSS color/,
    );
    expect(() => createRampInterpolator({ from: "nope", to: "#fff" })).toThrow(/"nope"/);
  });

  it("an unknown space fails listing the valid ones", () => {
    expect(() =>
      createRampInterpolator({ from: "#000", to: "#fff", space: "oklab" as never }),
    ).toThrow(/unknown space "oklab".*rgb, lab, hcl/);
  });

  it("an object with neither from/to nor stops fails saying what to pass", () => {
    expect(() => createRampInterpolator({} as never)).toThrow(/\{ from, to \}/);
  });
});

describe("isCustomRamp", () => {
  it("a palette name is not a custom ramp; an array and an object are", () => {
    expect(isCustomRamp("blues")).toBe(false);
    expect(isCustomRamp(undefined)).toBe(false);
    expect(isCustomRamp(["#000", "#fff"])).toBe(true);
    expect(isCustomRamp({ from: "#000", to: "#fff" })).toBe(true);
  });
});

describe("sampleRampColors", () => {
  const ramp = createRampInterpolator({ from: "#000000", to: "#ffffff" });

  it("goes end to end: the first class is the first color and the last class the last one", () => {
    const colors = sampleRampColors({ interpolate: ramp, classes: 3 });

    expect(colors).toEqual(["rgb(0, 0, 0)", "rgb(128, 128, 128)", "rgb(255, 255, 255)"]);
  });

  it("a single class gets the middle of the ramp", () => {
    expect(sampleRampColors({ interpolate: ramp, classes: 1 })).toEqual(["rgb(128, 128, 128)"]);
  });
});

describe("createColorScale · custom ramp", () => {
  const palette = { from: "#000000", to: "#ffffff" };

  it("linear: the domain ends get the ramp's ends exactly", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [10, 20, 30],
      palette,
      classification: { method: "linear" },
    });

    expect(scale.getColor(10)).toBe("rgb(0, 0, 0)");
    expect(scale.getColor(30)).toBe("rgb(255, 255, 255)");
  });

  it("quantize: N classes use the ramp from its first color to its last", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [0, 100],
      palette,
      classification: { method: "quantize", classes: 3 },
    });

    expect(scale.colors).toEqual(["rgb(0, 0, 0)", "rgb(128, 128, 128)", "rgb(255, 255, 255)"]);
  });

  it("a named palette is untouched: it still starts at 0.15", () => {
    const named = createColorScale({ variant: "sequential", values: [0, 100], palette: "blues" });
    const other = createColorScale({ variant: "sequential", values: [0, 100] });

    expect(named.colors).toEqual(other.colors);
  });

  it("an invalid ramp fails when the scale is created, not when it paints", () => {
    expect(() =>
      createColorScale({ variant: "sequential", values: [1, 2], palette: ["#000"] }),
    ).toThrow(/at least two colors/);
  });
});

describe("createColorScale · fixed domain", () => {
  const palette = { from: "#000000", to: "#ffffff" };
  // A share whose real values only go from 31 % to 74 %.
  const values = [31, 45, 60, 74];

  it("linear: 0 is the first color and 100 the last, whatever the data are", () => {
    const scale = createColorScale({
      variant: "sequential",
      values,
      palette,
      domain: [0, 100],
      classification: { method: "linear" },
    });

    expect(scale.domain).toEqual([0, 100]);
    expect(scale.getColor(0)).toBe("rgb(0, 0, 0)");
    expect(scale.getColor(100)).toBe("rgb(255, 255, 255)");
    // The data's range would have stretched the colors; with the fixed domain 31 is NOT black.
    expect(scale.getColor(31)).not.toBe("rgb(0, 0, 0)");
  });

  it("values outside the domain are clamped to the end colors, not extrapolated", () => {
    const scale = createColorScale({
      variant: "sequential",
      values,
      palette,
      domain: [0, 100],
      classification: { method: "linear" },
    });

    expect(scale.getColor(-50)).toBe("rgb(0, 0, 0)");
    expect(scale.getColor(250)).toBe("rgb(255, 255, 255)");
  });

  it("quantize splits the FIXED range, so two maps with different data share their breaks", () => {
    const options = {
      variant: "sequential",
      palette,
      domain: [0, 100],
      classification: { method: "quantize", classes: 4 },
    } as const;
    const a = createColorScale({ ...options, values: [31, 74] });
    const b = createColorScale({ ...options, values: [5, 95] });

    expect(a.thresholds).toEqual([25, 50, 75]);
    expect(b.thresholds).toEqual(a.thresholds);
    expect(a.colors).toEqual(b.colors);
  });

  it("quantize: a value beyond the domain falls in the first or the last class", () => {
    const scale = createColorScale({
      variant: "sequential",
      values,
      palette,
      domain: [0, 100],
      classification: { method: "quantize", classes: 4 },
    });

    expect(scale.getColor(-10)).toBe(scale.colors[0]);
    expect(scale.getColor(500)).toBe(scale.colors[3]);
  });

  it("threshold ignores the domain for the breaks but the legend ends still follow it", () => {
    const scale = createColorScale({
      variant: "sequential",
      values,
      palette,
      domain: [0, 100],
      classification: { method: "threshold", thresholds: [25, 50, 75] },
    });

    expect(scale.thresholds).toEqual([25, 50, 75]);
    expect(scale.domain).toEqual([0, 100]);
  });

  it("works with a named palette too", () => {
    const scale = createColorScale({
      variant: "sequential",
      values,
      domain: [0, 100],
      classification: { method: "linear" },
    });

    expect(scale.domain).toEqual([0, 100]);
  });

  it.each([
    [[5, 5], "[5, 5]"],
    [[10, 0], "[10, 0]"],
    [[0, Infinity], "[0, Infinity]"],
    [[NaN, 1], "[NaN, 1]"],
  ] as const)("an invalid domain %j fails showing what was received", (domain, shown) => {
    expect(() =>
      createColorScale({ variant: "sequential", values, domain: [...domain] as [number, number] }),
    ).toThrow(`min < max (received: ${shown})`);
  });
});

describe("diagnoseRamp", () => {
  it("a light → dark ramp has nothing to say", () => {
    expect(diagnoseRamp({ from: "#ffffff", to: "#2563eb" })).toBeNull();
  });

  it("black → blue: both ends are dark, so it says how far apart they are and what to do", () => {
    const message = diagnoseRamp({ from: "#0a0a0a", to: "#2563eb" });

    expect(message).toContain("#0a0a0a and #2563eb");
    expect(message).toContain("42 points of lightness");
    expect(message).toContain(`under ${MIN_LIGHTNESS_SPAN}`);
    expect(message).toContain("[choropleth] palette:");
    expect(message).toContain("diagnostics={false}");
  });

  it("the order of the ends does not matter", () => {
    expect(diagnoseRamp({ from: "#2563eb", to: "#1e3a8a" })).not.toBeNull();
  });

  it("only the ends are compared: a list of stops is judged by its first and last color", () => {
    expect(diagnoseRamp(["#ffffff", "#000000", "#fefefe"])).not.toBeNull();
    expect(diagnoseRamp(["#ffffff", "#000000", "#0000ff"])).toBeNull();
  });

  it("an invalid ramp still fails with its own message, not with a diagnosis", () => {
    expect(() => diagnoseRamp(["#000"])).toThrow(/at least two colors/);
  });
});

describe("createColorScale · custom diverging ramp", () => {
  const palette = { negative: "#dc2626", neutral: "#f5f5f5", positive: "#2563eb" } as const;

  it("negative, neutral and positive are the ends and the middle: the midpoint gets the neutral color", () => {
    const scale = createColorScale({
      variant: "diverging",
      values: [-10, 10],
      palette,
      midpoint: 0,
      classification: { method: "linear" },
    });

    expect(scale.getColor(-10)).toBe("rgb(220, 38, 38)");
    expect(scale.getColor(0)).toBe("rgb(245, 245, 245)");
    expect(scale.getColor(10)).toBe("rgb(37, 99, 235)");
  });

  it("a fixed domain is used as given, even if it is not symmetric around the midpoint", () => {
    const scale = createColorScale({
      variant: "diverging",
      values: [1, 2],
      palette,
      midpoint: 0,
      domain: [-10, 40],
      classification: { method: "linear" },
    });

    expect(scale.domain).toEqual([-10, 40]);
    expect(scale.getColor(-10)).toBe("rgb(220, 38, 38)");
    expect(scale.getColor(40)).toBe("rgb(37, 99, 235)");
    expect(scale.getColor(500)).toBe("rgb(37, 99, 235)"); // clamped
  });

  it("a share around 50 %: domain [0, 100] with midpoint 50 puts the neutral color at 50", () => {
    const scale = createColorScale({
      variant: "diverging",
      values: [40, 60],
      palette,
      midpoint: 50,
      domain: [0, 100],
      classification: { method: "linear" },
    });

    expect(scale.getColor(50)).toBe("rgb(245, 245, 245)");
    expect(scale.getColor(0)).toBe("rgb(220, 38, 38)");
  });

  it("classes over a fixed domain use the custom colors", () => {
    const scale = createColorScale({
      variant: "diverging",
      values: [10, 90],
      palette,
      midpoint: 50,
      domain: [0, 100],
      classification: { method: "quantize", classes: 5 },
    });

    expect(scale.thresholds).toEqual([20, 40, 60, 80]);
    expect(scale.colors).toHaveLength(5);
    expect(scale.getColor(50)).toBe(scale.colors[2]);
  });

  it("without a domain it stays symmetric around the midpoint", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 5], palette });

    expect(scale.domain).toEqual([-20, 20]);
  });

  it("a midpoint outside the fixed domain fails, saying why", () => {
    expect(() =>
      createColorScale({
        variant: "diverging",
        values: [1],
        palette,
        midpoint: 0,
        domain: [1, 10],
      }),
    ).toThrow(/midpoint: 0 is outside domain \[1, 10\]/);
  });

  it("an invalid fixed domain fails like in sequential", () => {
    expect(() =>
      createColorScale({ variant: "diverging", values: [1], palette, domain: [5, 5] }),
    ).toThrow(/domain: expected/);
  });

  it("an invalid color fails with the usual message", () => {
    expect(() =>
      createColorScale({
        variant: "diverging",
        values: [1],
        palette: { ...palette, neutral: "not-a-color" },
      }),
    ).toThrow(/"not-a-color" is not a CSS color/);
  });
});
