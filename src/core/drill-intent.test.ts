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

  it("notifies after 150 ms over the same region, only once", () => {
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

  it("repeating the same key does not restart the wait", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(100);
    timer.hover("ES");
    vi.advanceTimersByTime(50);
    expect(onIntent).toHaveBeenCalledTimes(1);
  });

  it("leaving early cancels", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(100);
    timer.hover(null);
    vi.advanceTimersByTime(1000);
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("changing region restarts the wait and only notifies about the last one", () => {
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

  it("re-entering after leaving is a new dwell", () => {
    const onIntent = vi.fn<(key: string) => void>();
    const timer = createIntentTimer({ onIntent });
    timer.hover("ES");
    vi.advanceTimersByTime(200);
    timer.hover(null);
    timer.hover("ES");
    vi.advanceTimersByTime(200);
    expect(onIntent).toHaveBeenCalledTimes(2);
  });

  it("respects a custom delay and dispose cancels", () => {
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
  it("an id that is not in the loaded level is unknown", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(["FR"]), drillable: true })).toEqual({
      kind: "unknown-id",
      ...base,
    });
  });
  it("without a loaded level the id cannot be judged", () => {
    expect(checkDrillStep({ ...base, knownIds: undefined, drillable: true })).toBeNull();
  });
  it("canDrill set to false warns", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(["ES"]), drillable: false })?.kind).toBe(
      "cannot-drill",
    );
  });
  it("canDrill not evaluated (undefined) does not warn", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(["ES"]), drillable: undefined })).toBeNull();
  });
  it("the unknown id wins over canDrill", () => {
    expect(checkDrillStep({ ...base, knownIds: new Set(), drillable: false })?.kind).toBe(
      "unknown-id",
    );
  });
});

describe("warning texts", () => {
  it("describe the id, the level and what was done", () => {
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

  it("formatTooDeepRequest: states the maximum depth and that it was ignored", () => {
    const text = formatTooDeepRequest(["A", "B", "C"], 2, "drillTo()");
    expect(text).toContain("drillTo()");
    expect(text).toContain('["A","B","C"]');
    expect(text).toContain("max depth 1");
    expect(text).toContain("ignored");
  });

  it("formatNoIdsDiagnostic: only if there are regions and none has an id", () => {
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

  it("formatWrongLevelDataHint: only with drill, a fixed list and NOTHING joined", () => {
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
