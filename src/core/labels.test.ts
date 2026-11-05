import { en, es, resolveLabels } from "./labels";

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
