import { DEFAULT_EMPTY_FILL, createColorScale } from "./scales";

describe("createColorScale · sequential", () => {
  const values = [10, 20, 30, 40, 50];

  it("sin datos (null/undefined/NaN) devuelve emptyFill", () => {
    const scale = createColorScale({ variant: "sequential", values });

    expect(scale.getColor(null)).toBe(DEFAULT_EMPTY_FILL);
    expect(scale.getColor(undefined)).toBe(DEFAULT_EMPTY_FILL);
    expect(scale.getColor(NaN)).toBe(DEFAULT_EMPTY_FILL);
  });

  it("el 0 es un dato: se colorea, no es emptyFill", () => {
    const scale = createColorScale({ variant: "sequential", values: [0, 5, 10] });

    expect(scale.getColor(0)).not.toBe(DEFAULT_EMPTY_FILL);
  });

  it("acepta un emptyFill propio", () => {
    expect(
      createColorScale({ variant: "sequential", values, emptyFill: "#fff" }).getColor(null),
    ).toBe("#fff");
  });

  it("por defecto usa quantile con 5 clases: 4 cortes y 5 colores", () => {
    const scale = createColorScale({ variant: "sequential", values });

    expect(scale.kind).toBe("classed");
    expect(scale.thresholds).toHaveLength(4);
    expect(scale.colors).toHaveLength(5);
  });

  it("valores bajos y altos reciben colores distintos, y la clase más alta es la última", () => {
    const scale = createColorScale({ variant: "sequential", values });

    expect(scale.getColor(10)).toBe(scale.colors[0]);
    expect(scale.getColor(50)).toBe(scale.colors[4]);
  });

  it("un valor justo en un corte pertenece a la clase de arriba", () => {
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

  it("threshold con N cortes produce N+1 colores", () => {
    const scale = createColorScale({
      variant: "sequential",
      values: [],
      classification: { method: "threshold", thresholds: [1, 2, 3] },
    });

    expect(scale.colors).toHaveLength(4);
  });

  it("la paleta elegida cambia los colores", () => {
    const blues = createColorScale({ variant: "sequential", values, palette: "blues" });
    const reds = createColorScale({ variant: "sequential", values, palette: "reds" });

    expect(blues.colors).not.toEqual(reds.colors);
  });

  it("linear es continua y recorta valores fuera del dominio", () => {
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

  it("sin ningún valor no falla: todo es emptyFill salvo lo que se consulte", () => {
    const scale = createColorScale({ variant: "sequential", values: [null, undefined] });

    expect(scale.domain).toEqual([0, 1]);
    expect(scale.getColor(null)).toBe(DEFAULT_EMPTY_FILL);
  });

  it("ignora null y NaN al calcular el dominio", () => {
    const scale = createColorScale({ variant: "sequential", values: [null, 4, NaN, 8] });

    expect(scale.domain).toEqual([4, 8]);
  });
});

describe("createColorScale · diverging", () => {
  it("el dominio es simétrico respecto al punto medio", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 5] });

    expect(scale.domain).toEqual([-20, 20]);
  });

  it("respeta un midpoint distinto de 0", () => {
    const scale = createColorScale({ variant: "diverging", values: [90, 120], midpoint: 100 });

    expect(scale.domain).toEqual([80, 120]);
  });

  it("por defecto: 5 clases simétricas, con el midpoint dentro de la clase central", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 20] });

    expect(scale.thresholds).toEqual([-12, -4, 4, 12]);
    expect(scale.getColor(0)).toBe(scale.colors[2]);
  });

  it("-x y +x reciben colores opuestos, no el mismo", () => {
    const scale = createColorScale({ variant: "diverging", values: [-20, 20] });

    expect(scale.getColor(-20)).toBe(scale.colors[0]);
    expect(scale.getColor(20)).toBe(scale.colors[4]);
  });

  it("si todos los valores son el midpoint, el dominio no degenera", () => {
    const scale = createColorScale({ variant: "diverging", values: [0, 0] });

    expect(scale.domain).toEqual([-1, 1]);
    expect(scale.getColor(0)).toBe(scale.colors[2]);
  });

  it("linear divergente: el midpoint recibe el color neutro de la paleta", () => {
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

  it("acepta una paleta divergente por nombre", () => {
    const rdbu = createColorScale({ variant: "diverging", values: [-1, 1] });
    const piyg = createColorScale({ variant: "diverging", values: [-1, 1], palette: "piyg" });

    expect(rdbu.colors).not.toEqual(piyg.colors);
  });
});

describe("createColorScale · tipos", () => {
  it("rechaza en compilación una paleta divergente en un mapa secuencial", () => {
    // La comprobación real es del compilador (`pnpm typecheck` falla si desaparece el error).
    // La función no se ejecuta: en runtime esa paleta no existe y daría error.
    const compileTimeOnly = () =>
      // @ts-expect-error "rdbu" es divergente: no existe entre las paletas secuenciales.
      createColorScale({ variant: "sequential", values: [1, 2], palette: "rdbu" });

    expect(compileTimeOnly).toBeTypeOf("function");
  });
});
