import { interpolateBlues, interpolateRdBu } from "d3-scale-chromatic";
import {
  sampleDivergingColors,
  sampleSequentialColors,
  SEQUENTIAL_PALETTES,
  DIVERGING_PALETTES,
} from "./palettes";

describe("sampleSequentialColors", () => {
  it("returns one color per class, from light to dark", () => {
    const colors = sampleSequentialColors({ interpolate: interpolateBlues, classes: 5 });

    expect(colors).toHaveLength(5);
    expect(colors[0]).toBe(interpolateBlues(0.15));
    expect(colors[4]).toBe(interpolateBlues(1));
  });

  it("does not start at the palette's almost-white extreme", () => {
    const [first] = sampleSequentialColors({ interpolate: interpolateBlues, classes: 3 });
    expect(first).not.toBe(interpolateBlues(0));
  });

  it("with one class it uses a mid tone", () => {
    expect(sampleSequentialColors({ interpolate: interpolateBlues, classes: 1 })).toEqual([
      interpolateBlues(0.6),
    ]);
  });
});

describe("sampleDivergingColors", () => {
  it("with odd classes, the middle one is the neutral color (t = 0.5)", () => {
    const colors = sampleDivergingColors({ interpolate: interpolateRdBu, classes: 5 });

    expect(colors[2]).toBe(interpolateRdBu(0.5));
    expect(colors[0]).toBe(interpolateRdBu(0.1));
  });
});

describe("palette registries", () => {
  it("all palettes return a CSS color", () => {
    for (const interpolate of [
      ...Object.values(SEQUENTIAL_PALETTES),
      ...Object.values(DIVERGING_PALETTES),
    ]) {
      expect(interpolate(0.5)).toMatch(/^(rgb|#)/);
    }
  });
});
