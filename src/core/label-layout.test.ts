import { describe, expect, it } from "vitest";
import { placeLabels, zoomBucket, type LabelCandidate } from "./label-layout";

const FIT = { k: 1, x: 0, y: 0 };
const VIEW = { width: 400, height: 200 };

const label = (id: string, x: number, y: number, priority: number, text = id): LabelCandidate => ({
  id,
  text,
  x,
  y,
  priority,
});

describe("placeLabels", () => {
  it("places labels that do not touch", () => {
    const visible = placeLabels({
      candidates: [label("AA", 100, 100, 1), label("BB", 300, 100, 1)],
      camera: FIT,
      view: VIEW,
    });
    expect(visible).toEqual(["AA", "BB"]);
  });

  it("hides the lower-priority label of an overlapping pair", () => {
    const visible = placeLabels({
      candidates: [label("LOW", 100, 100, 1), label("HIGH", 104, 102, 9)],
      camera: FIT,
      view: VIEW,
    });
    expect(visible).toEqual(["HIGH"]);
  });

  it("returns the visible ids in priority order, whatever the input order", () => {
    const visible = placeLabels({
      candidates: [label("A", 50, 50, 1), label("B", 200, 100, 5), label("C", 350, 150, 3)],
      camera: FIT,
      view: VIEW,
    });
    expect(visible).toEqual(["B", "C", "A"]);
  });

  it("breaks priority ties by id (deterministic)", () => {
    const params = {
      camera: FIT,
      view: VIEW,
    };
    const a = placeLabels({ ...params, candidates: [label("B", 100, 100, 1), label("A", 102, 100, 1)] });
    const b = placeLabels({ ...params, candidates: [label("A", 102, 100, 1), label("B", 100, 100, 1)] });
    expect(a).toEqual(["A"]);
    expect(b).toEqual(["A"]);
  });

  it("zooming in reveals the labels that collided at the fit", () => {
    const candidates = [label("BIG", 100, 100, 9), label("SMALL", 110, 100, 1)];
    expect(placeLabels({ candidates, camera: FIT, view: VIEW })).toEqual(["BIG"]);
    // k = 3 shifted into the view: the anchors are 30 px apart, wider than a 3-letter label.
    const zoomed = placeLabels({ candidates, camera: { k: 3, x: -200, y: -200 }, view: VIEW });
    expect(zoomed).toEqual(["BIG", "SMALL"]);
  });

  it("applies the camera: a label panned out of the view is hidden", () => {
    const candidates = [label("AA", 100, 100, 1)];
    expect(placeLabels({ candidates, camera: { k: 1, x: 1000, y: 0 }, view: VIEW })).toEqual([]);
  });

  it("hides a label that would be clipped by the edge of the view", () => {
    const candidates = [label("EDGE", 2, 100, 1), label("OK", 200, 100, 1)];
    expect(placeLabels({ candidates, camera: FIT, view: VIEW })).toEqual(["OK"]);
  });

  it("a longer text takes more room", () => {
    const near = [label("a", 100, 100, 2, "Spain"), label("b", 140, 100, 1, "Portugal")];
    expect(placeLabels({ candidates: near, camera: FIT, view: VIEW })).toEqual(["a"]);
    const short = [label("a", 100, 100, 2, "ES"), label("b", 140, 100, 1, "PT")];
    expect(placeLabels({ candidates: short, camera: FIT, view: VIEW })).toEqual(["a", "b"]);
  });

  it("skips empty texts and non-finite positions", () => {
    const visible = placeLabels({
      candidates: [
        label("EMPTY", 100, 100, 9, ""),
        label("NAN", Number.NaN, 100, 9),
        label("OK", 200, 100, 1),
      ],
      camera: FIT,
      view: VIEW,
    });
    expect(visible).toEqual(["OK"]);
  });

  it("padding keeps labels apart", () => {
    const candidates = [label("AA", 100, 100, 2), label("BB", 118, 100, 1)];
    expect(placeLabels({ candidates, camera: FIT, view: VIEW, padding: 0 })).toEqual(["AA", "BB"]);
    expect(placeLabels({ candidates, camera: FIT, view: VIEW, padding: 8 })).toEqual(["AA"]);
  });

  it("a bigger font size makes the boxes collide sooner", () => {
    const candidates = [label("AA", 100, 100, 2), label("BB", 100, 112, 1)];
    expect(placeLabels({ candidates, camera: FIT, view: VIEW, fontSize: 8, padding: 0 })).toEqual([
      "AA",
      "BB",
    ]);
    expect(placeLabels({ candidates, camera: FIT, view: VIEW, fontSize: 14, padding: 0 })).toEqual([
      "AA",
    ]);
  });

  it("returns nothing without candidates", () => {
    expect(placeLabels({ candidates: [], camera: FIT, view: VIEW })).toEqual([]);
  });
});

describe("zoomBucket", () => {
  it("is the whole-number zoom level", () => {
    expect(zoomBucket(1)).toBe(0);
    expect(zoomBucket(1.9)).toBe(0);
    expect(zoomBucket(2)).toBe(1);
    expect(zoomBucket(4)).toBe(2);
    expect(zoomBucket(7.9)).toBe(2);
  });

  it("never goes below 0 and tolerates garbage", () => {
    expect(zoomBucket(0.5)).toBe(0);
    expect(zoomBucket(0)).toBe(0);
    expect(zoomBucket(Number.NaN)).toBe(0);
  });
});
