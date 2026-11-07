import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRILL_INTENT_MS,
  checkDrillStep,
  createIntentTimer,
  formatDrillRequestProblem,
  formatNoIdsDiagnostic,
  formatTooDeepRequest,
  formatWrongLevelDataHint,
} from "./drill-intent";

describe("createIntentTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("avisa tras 150 ms sobre la misma región, una sola vez", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(DRILL_INTENT_MS - 1);
    expect(onIntent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIntent).toHaveBeenCalledExactlyOnceWith("ES");
    vi.advanceTimersByTime(1000);
    expect(onIntent).toHaveBeenCalledTimes(1);
  });

  it("repetir la misma clave no reinicia la espera", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(100);
    timer.hover("ES");
    vi.advanceTimersByTime(50);
    expect(onIntent).toHaveBeenCalledTimes(1);
  });

  it("salir antes de tiempo cancela", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(100);
    timer.hover(null);
    vi.advanceTimersByTime(1000);
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("cambiar de región reinicia la espera y solo avisa de la última", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(100);
    timer.hover("FR");
    vi.advanceTimersByTime(100);
    expect(onIntent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(onIntent).toHaveBeenCalledExactlyOnceWith("FR");
  });

  it("volver a entrar tras salir es una permanencia nueva", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(200);
    timer.hover(null);
    timer.hover("ES");
    vi.advanceTimersByTime(200);
    expect(onIntent).toHaveBeenCalledTimes(2);
  });

  it("respeta un retraso propio y dispose cancela", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent, delay: 500 });
    timer.hover("ES");
    vi.advanceTimersByTime(499);
    expect(onIntent).not.toHaveBeenCalled();
    timer.dispose();
    vi.advanceTimersByTime(10);
    expect(onIntent).not.toHaveBeenCalled();
  });
});

describe("checkDrillStep", () => {
  const base = { id: "ES", depth: 0, levelId: "country" };
  it("un id que no está en el nivel cargado es desconocido", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(["FR"]), drillable: true })).toEqual({
      kind: "unknown-id",
      ...base,
    });
  });
  it("sin nivel cargado no se puede juzgar el id", () => {
    expect(checkDrillStep({ ...base, knownIds: undefined, drillable: true })).toBeNull();
  });
  it("canDrill en false avisa", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(["ES"]), drillable: false })?.kind).toBe(
      "cannot-drill",
    );
  });
  it("canDrill sin evaluar (undefined) no avisa", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(["ES"]), drillable: undefined })).toBeNull();
  });
  it("el id desconocido manda sobre canDrill", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(), drillable: false })?.kind).toBe(
      "unknown-id",
    );
  });
});

describe("textos de aviso", () => {
  it("describen id, nivel y qué se hizo", () => {
    const unknown = formatDrillRequestProblem(
      { kind: "unknown-id", id: "XX", depth: 1, levelId: "region" },
      "drillTo()",
    );
    expect(unknown).toContain("[choropleth] drillTo()");
    expect(unknown).toContain('"XX"');
    expect(unknown).toContain('level "region" (depth 1)');
    expect(unknown).toContain("ignored");
    const cannot = formatDrillRequestProblem(
      { kind: "cannot-drill", id: "ES", depth: 0, levelId: "country" },
      "drillDown()",
    );
    expect(cannot).toContain("canDrill");
  });

  it("formatTooDeepRequest: dice la profundidad máxima y que se ignoró", () => {
    const text = formatTooDeepRequest(["A", "B", "C"], 2, "drillTo()");
    expect(text).toContain("drillTo()");
    expect(text).toContain('["A","B","C"]');
    expect(text).toContain("max depth 1");
    expect(text).toContain("ignored");
  });

  it("formatNoIdsDiagnostic: solo si hay regiones y ninguna tiene id", () => {
    const args = { featureCount: 5, idCount: 0, levelId: "country", customGetFeatureId: false };
    expect(formatNoIdsDiagnostic(args)).toContain("none of the 5 region(s)");
    expect(formatNoIdsDiagnostic(args)).toContain("feature.id");
    expect(formatNoIdsDiagnostic({ ...args, customGetFeatureId: true })).toContain(
      "returned `undefined`",
    );
    expect(formatNoIdsDiagnostic({ ...args, idCount: 1 })).toBeNull();
    expect(formatNoIdsDiagnostic({ ...args, featureCount: 0 })).toBeNull();
    expect(formatNoIdsDiagnostic({ ...args, levelId: null })).not.toContain("in level");
  });

  it("formatWrongLevelDataHint: solo con drill, lista fija y NADA cruzado", () => {
    const args = {
      drillActive: true,
      dataIsSelector: false,
      dataCount: 3,
      unmatchedCount: 3,
      levelId: "region",
    };
    expect(formatWrongLevelDataHint(args)).toContain("selector");
    expect(formatWrongLevelDataHint({ ...args, drillActive: false })).toBeNull();
    expect(formatWrongLevelDataHint({ ...args, dataIsSelector: true })).toBeNull();
    expect(formatWrongLevelDataHint({ ...args, unmatchedCount: 2 })).toBeNull();
    expect(formatWrongLevelDataHint({ ...args, dataCount: 0, unmatchedCount: 0 })).toBeNull();
  });
});
