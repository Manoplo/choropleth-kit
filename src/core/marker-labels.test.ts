import {
  createLabelPlacer,
  hideCollidingLabels,
  labelPositionCandidates,
  orderByPriority,
  type MarkerLabelItem,
} from "./marker-labels";

const label = (id: string, x0: number, y0: number, x1: number, y1: number, priority = 0) =>
  ({ id, box: { x0, y0, x1, y1 }, priority }) satisfies MarkerLabelItem;

describe("hideCollidingLabels", () => {
  it("hides nothing when labels do not touch", () => {
    const hidden = hideCollidingLabels({
      labels: [label("a", 0, 0, 40, 12), label("b", 100, 0, 140, 12)],
    });
    expect(hidden.size).toBe(0);
  });

  it("hides the lower priority of two overlapping labels", () => {
    const hidden = hideCollidingLabels({
      labels: [label("low", 0, 0, 40, 12, 1), label("high", 20, 0, 60, 12, 5)],
    });
    expect([...hidden]).toEqual(["low"]);
  });

  it("breaks ties by order: the first one listed wins", () => {
    const hidden = hideCollidingLabels({
      labels: [label("first", 0, 0, 40, 12), label("second", 10, 0, 50, 12)],
    });
    expect([...hidden]).toEqual(["second"]);
  });

  it("keeps the padding between labels that nearly touch", () => {
    const labels = [label("a", 0, 0, 40, 12), label("b", 41, 0, 80, 12)];
    expect(hideCollidingLabels({ labels, padding: 4 }).has("b")).toBe(true);
    expect(hideCollidingLabels({ labels, padding: 0 }).size).toBe(0);
  });

  it("a hidden label does not hide the ones it overlapped", () => {
    const hidden = hideCollidingLabels({
      labels: [
        label("a", 0, 0, 40, 12, 3),
        label("b", 30, 0, 70, 12, 2),
        label("c", 60, 0, 100, 12, 1),
      ],
    });
    // b loses to a; c would only have overlapped b, which is not drawn, so c stays.
    expect([...hidden]).toEqual(["b"]);
  });

  it("hides a label that does not fit entirely inside the bounds", () => {
    const hidden = hideCollidingLabels({
      labels: [label("in", 10, 10, 50, 22), label("out", 180, 10, 230, 22)],
      bounds: { x0: 0, y0: 0, x1: 200, y1: 100 },
    });
    expect([...hidden]).toEqual(["out"]);
  });

  it("hides a label that covers ANOTHER marker, but not next to its own", () => {
    const hidden = hideCollidingLabels({
      labels: [label("a", 10, 0, 50, 12), label("b", 100, 0, 140, 12)],
      obstacles: [
        { ownerId: "a", box: { x0: 4, y0: 0, x1: 10, y1: 12 } },
        { ownerId: "c", box: { x0: 120, y0: 0, x1: 130, y1: 12 } },
      ],
    });
    expect([...hidden]).toEqual(["b"]);
  });

  it("keeps labels with no measurable box (nothing laid out)", () => {
    const hidden = hideCollidingLabels({
      labels: [label("a", 0, 0, 0, 0), label("b", 0, 0, 0, 0)],
      bounds: { x0: 0, y0: 0, x1: 0, y1: 0 },
    });
    expect(hidden.size).toBe(0);
  });
});

describe("orderByPriority", () => {
  it("puts the highest priority first, keeps ties in order, and does not mutate", () => {
    const items = [
      { id: "a", priority: 0 },
      { id: "b", priority: 2 },
      { id: "c", priority: 0 },
      { id: "d", priority: 2 },
    ];
    expect(orderByPriority(items).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("labelPositionCandidates", () => {
  it("tries the preferred side first, then the others, when automatic", () => {
    expect(labelPositionCandidates("right", true)).toEqual(["right", "left", "top", "bottom"]);
    expect(labelPositionCandidates("top", true)).toEqual(["top", "right", "left", "bottom"]);
  });

  it("only the chosen side when the consumer fixed it", () => {
    expect(labelPositionCandidates("left", false)).toEqual(["left"]);
  });
});

describe("createLabelPlacer", () => {
  it("lets a second label take another spot once the first is placed", () => {
    const placer = createLabelPlacer();
    const first = { x0: 0, y0: 0, x1: 40, y1: 12 };
    expect(placer.fits("a", first)).toBe(true);
    placer.place(first);
    expect(placer.fits("b", { x0: 10, y0: 0, x1: 50, y1: 12 })).toBe(false);
    expect(placer.fits("b", { x0: 10, y0: 20, x1: 50, y1: 32 })).toBe(true);
  });

  it("an empty box always fits and reserves nothing", () => {
    const placer = createLabelPlacer({ bounds: { x0: 0, y0: 0, x1: 10, y1: 10 } });
    const empty = { x0: 50, y0: 50, x1: 50, y1: 50 };
    expect(placer.fits("a", empty)).toBe(true);
    placer.place(empty);
    expect(placer.fits("b", empty)).toBe(true);
  });
});
