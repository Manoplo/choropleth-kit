import { en, es, resolveLabels } from "./labels";

describe("labels · zoom", () => {
  it("todas las claves están en inglés y en español, y ninguna vacía", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(es)]) expect(value).not.toBe("");
  });

  it("el aviso de rueda tiene variante para Mac (⌘) y Windows/Linux (Ctrl)", () => {
    expect(en.gestureHintWheel).toContain("Ctrl");
    expect(en.gestureHintWheelMac).toContain("⌘");
    expect(es.gestureHintWheel).toContain("Ctrl");
    expect(es.gestureHintWheelMac).toContain("⌘");
  });
});

describe("labels", () => {
  it("inglés por defecto", () => {
    expect(resolveLabels()).toEqual(en);
    expect(en.noData).toBe("No data");
  });

  it("completa lo que falte con inglés y respeta lo que se pasa", () => {
    expect(resolveLabels(es).noData).toBe("Sin dato");
    expect(resolveLabels({}).noData).toBe("No data");
    expect(resolveLabels({ noData: "—" }).noData).toBe("—");
    expect(resolveLabels({ noData: "—" }).geographyError).toBe(en.geographyError);
  });
});
