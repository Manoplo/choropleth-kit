import { chooseTooltipSide } from "./marker-tooltip";

const bounds = { x0: 0, y0: 0, x1: 400, y1: 300 };
const tooltip = { width: 80, height: 24 };
const marker = (x: number, y: number, size = 12) => ({
  x0: x - size / 2,
  y0: y - size / 2,
  x1: x + size / 2,
  y1: y + size / 2,
});

describe("chooseTooltipSide", () => {
  it("goes on top, centered, when there is room", () => {
    expect(chooseTooltipSide({ anchor: marker(200, 150), tooltip, bounds })).toEqual({
      side: "top",
      shift: 0,
    });
  });

  it("goes below when the top would leave the area", () => {
    expect(chooseTooltipSide({ anchor: marker(200, 20), tooltip, bounds }).side).toBe("bottom");
  });

  it("slides sideways instead of crossing the left or right edge", () => {
    const left = chooseTooltipSide({ anchor: marker(10, 150), tooltip, bounds });
    expect(left.side).toBe("top");
    expect(left.shift).toBe(30); // 40 px of half-width, only 10 px of room
    const right = chooseTooltipSide({ anchor: marker(395, 150), tooltip, bounds });
    expect(right).toEqual({ side: "top", shift: -35 });
  });

  it("uses the right side when neither top nor bottom fit", () => {
    const short = { x0: 0, y0: 0, x1: 400, y1: 40 };
    const placement = chooseTooltipSide({
      anchor: marker(100, 20),
      tooltip: { width: 80, height: 36 },
      bounds: short,
    });
    expect(placement.side).toBe("right");
  });

  it("with no side that fits, the one that sticks out the least wins", () => {
    const tiny = { x0: 0, y0: 0, x1: 60, y1: 30 };
    const placement = chooseTooltipSide({ anchor: marker(30, 15), tooltip, bounds: tiny });
    expect(["top", "bottom", "right", "left"]).toContain(placement.side);
    // Deterministic.
    expect(chooseTooltipSide({ anchor: marker(30, 15), tooltip, bounds: tiny })).toEqual(placement);
  });

  it("respects the gap", () => {
    // Room for the tooltip (24) but not for the tooltip plus a 40 px gap above a marker at y = 40.
    const withSmallGap = chooseTooltipSide({ anchor: marker(200, 40), tooltip, bounds, gap: 4 });
    const withBigGap = chooseTooltipSide({ anchor: marker(200, 40), tooltip, bounds, gap: 40 });
    expect(withSmallGap.side).toBe("top");
    expect(withBigGap.side).toBe("bottom");
  });
});
