import { buildSizeLegend, createRadiusScale } from "./bubbles";

describe("createRadiusScale", () => {
  it("el ÁREA es proporcional al valor: el doble de valor → ×√2 de radio", () => {
    const scale = createRadiusScale({ values: [100, 400], maxRadius: 20 });

    expect(scale.getRadius(400)).toBe(20);
    expect(scale.getRadius(100)).toBeCloseTo(10);
    expect(Math.PI * scale.getRadius(400) ** 2).toBeCloseTo(
      4 * Math.PI * scale.getRadius(100) ** 2,
    );
  });

  it("el dominio empieza en 0: el valor mínimo no desaparece", () => {
    const scale = createRadiusScale({ values: [10, 20], maxRadius: 10 });

    expect(scale.getRadius(10)).toBeGreaterThan(0);
    expect(scale.getRadius(0)).toBe(0);
  });

  it("ignora null/NaN/negativos al buscar el máximo y recorta valores mayores que el máximo", () => {
    const scale = createRadiusScale({ values: [null, undefined, NaN, -5, 9], maxRadius: 6 });

    expect(scale.max).toBe(9);
    expect(scale.getRadius(1000)).toBe(6);
  });

  it("sin valores positivos: radio 0 (no NaN)", () => {
    const scale = createRadiusScale({ values: [null, 0, -1] });

    expect(scale.max).toBe(0);
    expect(scale.getRadius(5)).toBe(0);
  });

  it("maxRadius por defecto", () => {
    expect(createRadiusScale({ values: [1] }).maxRadius).toBe(24);
  });
});

describe("buildSizeLegend", () => {
  it("tres círculos de referencia (¼, ½, máximo) con su etiqueta", () => {
    const items = buildSizeLegend({
      scale: createRadiusScale({ values: [100], maxRadius: 20 }),
      formatValue: (v) => `${v} €`,
    });

    expect(items.map((i) => i.label)).toEqual(["25 €", "50 €", "100 €"]);
    expect(items[2]?.radius).toBe(20);
    expect(items[0]?.radius).toBeLessThan(items[1]?.radius ?? 0);
  });

  it("formato por defecto y vacío sin valores", () => {
    expect(buildSizeLegend({ scale: createRadiusScale({ values: [8] }) })[1]?.label).toBe("4");
    expect(buildSizeLegend({ scale: createRadiusScale({ values: [] }) })).toEqual([]);
  });
});
