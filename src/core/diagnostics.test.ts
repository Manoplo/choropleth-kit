import { formatJoinDiagnostics } from "./diagnostics";

const clean = { unmatchedData: [], featuresWithoutData: [], duplicateDataIds: [], dataCount: 5 };

describe("formatJoinDiagnostics", () => {
  it("todo cruzado → null", () => {
    expect(formatJoinDiagnostics(clean)).toBeNull();
  });

  it("sin datos aún (cargando) → null aunque todas las regiones estén sin dato", () => {
    expect(
      formatJoinDiagnostics({ ...clean, dataCount: 0, featuresWithoutData: ["724", "250"] }),
    ).toBeNull();
  });

  it("datos huérfanos: cuenta y lista los ids", () => {
    const msg = formatJoinDiagnostics({ ...clean, unmatchedData: ["XK", "GI"] });

    expect(msg).toContain('[choropleth] 2 datum(s) have no matching geometry: "XK", "GI".');
  });

  it("regiones sin dato: avisa de que usarán emptyFill", () => {
    const msg = formatJoinDiagnostics({ ...clean, featuresWithoutData: ["A", "B", "C"] });

    expect(msg).toContain("3 region(s) have no data and will use `emptyFill`.");
  });

  it("duplicados", () => {
    const msg = formatJoinDiagnostics({ ...clean, duplicateDataIds: ["724"] });

    expect(msg).toContain("1 id(s) appear more than once");
    expect(msg).toContain('"724"');
  });

  it("recorta listas largas", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `X${i}`);
    const msg = formatJoinDiagnostics({ ...clean, unmatchedData: ids });

    expect(msg).toContain("and 4 more");
    expect(msg).not.toContain("X11");
  });

  describe("pistas", () => {
    it("alpha-2 en los datos frente a numérico en la geometría", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["ES", "FR"],
        featuresWithoutData: ["724", "250"],
      });

      expect(msg).toContain("alpha-2");
      expect(msg).toContain("numeric");
      expect(msg).toContain("getFeatureId");
    });

    it("alpha-3 en los datos frente a alpha-2 en la geometría", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["ESP"],
        featuresWithoutData: ["ES"],
      });

      expect(msg).toContain("alpha-3");
    });

    it("ceros a la izquierda perdidos", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["4"],
        featuresWithoutData: ["004"],
      });

      expect(msg).toContain("Leading zeros");
      expect(msg).toContain('"004"');
    });

    it("mayúsculas y minúsculas", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["es"],
        featuresWithoutData: ["ES"],
      });

      expect(msg).toContain("case-sensitive");
    });

    it("sin pista si los estilos son iguales, mezclados o irreconocibles", () => {
      const noHint = (unmatchedData: string[], featuresWithoutData: string[]) =>
        formatJoinDiagnostics({ ...clean, unmatchedData, featuresWithoutData })?.includes("Hint");

      expect(noHint(["ZZ"], ["QQ"])).toBe(false); // mismo estilo: es un id desconocido, no un formato
      expect(noHint(["ES", "724"], ["250", "FR"])).toBe(false); // mezclados
      expect(noHint(["Madrid"], ["724"])).toBe(false); // irreconocible
      expect(noHint(["ES"], [])).toBe(false); // nada con qué comparar
    });
  });

  it("varias incidencias van en un único mensaje", () => {
    const msg = formatJoinDiagnostics({
      unmatchedData: ["ES"],
      featuresWithoutData: ["724"],
      duplicateDataIds: ["FR"],
      dataCount: 3,
    });

    expect(msg?.split("[choropleth]")).toHaveLength(2);
    expect(msg?.split("\n").length).toBeGreaterThanOrEqual(4);
  });
});
