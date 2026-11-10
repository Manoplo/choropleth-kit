import { formatJoinDiagnostics } from "./diagnostics";

const clean = { unmatchedData: [], featuresWithoutData: [], duplicateDataIds: [], dataCount: 5 };

describe("formatJoinDiagnostics", () => {
  it("todo cruzado → null", () => {
    expect(formatJoinDiagnostics(clean)).toBeNull();
  });

  it("no data yet (loading) → null even if every region has no data", () => {
    expect(
      formatJoinDiagnostics({ ...clean, dataCount: 0, featuresWithoutData: ["724", "250"] }),
    ).toBeNull();
  });

  it("orphan data: counts and lists the ids", () => {
    const msg = formatJoinDiagnostics({ ...clean, unmatchedData: ["XK", "GI"] });

    expect(msg).toContain('[choropleth] 2 datum(s) have no matching geometry: "XK", "GI".');
  });

  it("regions without data: warns that they will use emptyFill", () => {
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
    it("alpha-2 in the data versus numeric in the geometry", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["ES", "FR"],
        featuresWithoutData: ["724", "250"],
      });

      expect(msg).toContain("alpha-2");
      expect(msg).toContain("numeric");
      expect(msg).toContain("getFeatureId");
    });

    it("alpha-3 in the data versus alpha-2 in the geometry", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["ESP"],
        featuresWithoutData: ["ES"],
      });

      expect(msg).toContain("alpha-3");
    });

    it("lost leading zeros", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["4"],
        featuresWithoutData: ["004"],
      });

      expect(msg).toContain("Leading zeros");
      expect(msg).toContain('"004"');
    });

    it("upper and lower case", () => {
      const msg = formatJoinDiagnostics({
        ...clean,
        unmatchedData: ["es"],
        featuresWithoutData: ["ES"],
      });

      expect(msg).toContain("case-sensitive");
    });

    it("no hint if the styles are the same, mixed or unrecognizable", () => {
      const noHint = (unmatchedData: string[], featuresWithoutData: string[]) =>
        formatJoinDiagnostics({ ...clean, unmatchedData, featuresWithoutData })?.includes("Hint");

      expect(noHint(["ZZ"], ["QQ"])).toBe(false); // mismo estilo: es un id desconocido, no un formato
      expect(noHint(["ES", "724"], ["250", "FR"])).toBe(false); // mixed
      expect(noHint(["Madrid"], ["724"])).toBe(false); // unrecognizable
      expect(noHint(["ES"], [])).toBe(false); // nothing to compare with
    });
  });

  it("several issues go in a single message", () => {
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
