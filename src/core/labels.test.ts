import { en, es, resolveLabels } from "./labels";

describe("labels · zoom", () => {
  it("every key is in English and in Spanish, and none is empty", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(es)]) expect(value).not.toBe("");
  });

  it("the wheel hint has a variant for Mac (⌘) and Windows/Linux (Ctrl)", () => {
    expect(en.gestureHintWheel).toContain("Ctrl");
    expect(en.gestureHintWheelMac).toContain("⌘");
    expect(es.gestureHintWheel).toContain("Ctrl");
    expect(es.gestureHintWheelMac).toContain("⌘");
  });
});

describe("labels", () => {
  it("English by default", () => {
    expect(resolveLabels()).toEqual(en);
    expect(en.noData).toBe("No data");
  });

  it("fills in whatever is missing with English and respects what is passed", () => {
    expect(resolveLabels(es).noData).toBe("Sin dato");
    expect(resolveLabels({}).noData).toBe("No data");
    expect(resolveLabels({ noData: "—" }).noData).toBe("—");
    expect(resolveLabels({ noData: "—" }).geographyError).toBe(en.geographyError);
  });
});
