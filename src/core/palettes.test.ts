import { interpolateBlues, interpolateRdBu } from "d3-scale-chromatic";
import {
  sampleDivergingColors,
  sampleSequentialColors,
  SEQUENTIAL_PALETTES,
  DIVERGING_PALETTES,
} from "./palettes";

describe("sampleSequentialColors", () => {
  it("devuelve un color por clase, de claro a oscuro", () => {
    const colors = sampleSequentialColors({ interpolate: interpolateBlues, classes: 5 });

    expect(colors).toHaveLength(5);
    expect(colors[0]).toBe(interpolateBlues(0.15));
    expect(colors[4]).toBe(interpolateBlues(1));
  });

  it("no empieza en el extremo casi blanco de la paleta", () => {
    const [first] = sampleSequentialColors({ interpolate: interpolateBlues, classes: 3 });
    expect(first).not.toBe(interpolateBlues(0));
  });

  it("con una clase usa un tono medio", () => {
    expect(sampleSequentialColors({ interpolate: interpolateBlues, classes: 1 })).toEqual([
      interpolateBlues(0.6),
    ]);
  });
});

describe("sampleDivergingColors", () => {
  it("con clases impares, la central es el color neutro (t = 0.5)", () => {
    const colors = sampleDivergingColors({ interpolate: interpolateRdBu, classes: 5 });

    expect(colors[2]).toBe(interpolateRdBu(0.5));
    expect(colors[0]).toBe(interpolateRdBu(0.1));
  });
});

describe("registros de paletas", () => {
  it("todas las paletas devuelven un color CSS", () => {
    for (const interpolate of [
      ...Object.values(SEQUENTIAL_PALETTES),
      ...Object.values(DIVERGING_PALETTES),
    ]) {
      expect(interpolate(0.5)).toMatch(/^(rgb|#)/);
    }
  });
});
