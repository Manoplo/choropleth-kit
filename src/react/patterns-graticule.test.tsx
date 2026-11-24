import { render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";

// Pattern presets (regions + background) and the graticule. jsdom has no layout: what the library WRITES is tested here.

type Row = { code: string; v: number | null };
const baseProps = {
  geography: twoSquares,
  data: [{ code: "A", v: 1 }] as Row[],
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const preset = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);

describe("region pattern presets", () => {
  it("a catalogue preset on regions without data defines its own <pattern> and fills with it", () => {
    const { container } = preset({ emptyPattern: "diagonal-up" });
    const fill = container.querySelector(".cm-patterns path")?.getAttribute("fill") ?? "";
    const id = /url\(#(.+)\)/.exec(fill)?.[1] ?? "";
    expect(id).toContain("preset-diagonal-up");
    expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull();
  });

  it("works through getRegionStyle, and the built-ins keep their ids", () => {
    const { container } = preset({
      emptyPattern: "none",
      getRegionStyle: (r) => ({ pattern: r.id === "A" ? "checkerboard" : "hatch" }),
    });
    const fills = [...container.querySelectorAll(".cm-patterns path")].map(
      (p) => p.getAttribute("fill") ?? "",
    );
    expect(fills.some((f) => f.includes("preset-checkerboard"))).toBe(true);
    expect(fills.some((f) => f.endsWith("-hatch)"))).toBe(true);
    expect(container.querySelectorAll("pattern[id*='preset-']")).toHaveLength(1);
  });
});

describe("background", () => {
  it("is not drawn by default", () => {
    const { container } = preset();
    expect(container.querySelector(".cm-background")).toBeNull();
  });

  it("is drawn outside the viewport, with the preset and a mask for the fade", () => {
    const { container } = preset({ background: "grid" });
    const layer = container.querySelector(".cm-background");
    expect(layer).not.toBeNull();
    expect(layer?.closest(".cm-viewport")).toBeNull();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.querySelectorAll("mask")).toHaveLength(2);
    expect(layer?.querySelector("pattern")?.getAttribute("width")).toBe("6");
  });

  it("scales the tile and drops the masks when the fade is off", () => {
    const { container } = preset({
      background: { pattern: "dots", scale: 2, fadeHorizontal: false, fadeVertical: false },
    });
    const layer = container.querySelector(".cm-background");
    expect(layer?.querySelector("pattern")?.getAttribute("width")).toBe("12");
    expect(layer?.querySelectorAll("mask")).toHaveLength(0);
  });

  it("`none` draws nothing", () => {
    expect(preset({ background: "none" }).container.querySelector(".cm-background")).toBeNull();
  });
});

describe("graticule", () => {
  it("is not drawn by default", () => {
    expect(preset().container.querySelector(".cm-graticule")).toBeNull();
  });

  it("is a path inside the viewport (it moves with the camera), under the regions by default", () => {
    const { container } = preset({ graticule: 30 });
    const grid = container.querySelector(".cm-viewport .cm-graticule-lines");
    expect(grid?.getAttribute("d")).toMatch(/^M/);
    const viewport = container.querySelector(".cm-viewport") as Element;
    const order = [...viewport.children].map((c) => c.getAttribute("class") ?? "");
    expect(order.findIndex((c) => c.includes("cm-graticule"))).toBeLessThan(
      order.findIndex((c) => c.includes("cm-regions")),
    );
  });

  it("`above` puts it after the regions, and `outline` adds the world outline", () => {
    const { container } = preset({ graticule: { above: true, outline: true } });
    const viewport = container.querySelector(".cm-viewport") as Element;
    const order = [...viewport.children].map((c) => c.getAttribute("class") ?? "");
    expect(order.findIndex((c) => c.includes("cm-graticule"))).toBeGreaterThan(
      order.findIndex((c) => c.includes("cm-regions")),
    );
    expect(container.querySelector(".cm-graticule-outline")).not.toBeNull();
  });

  it("a smaller step draws a longer path", () => {
    const length = (step: number) =>
      preset({ graticule: step }).container.querySelector(".cm-graticule-lines")?.getAttribute("d")
        ?.length ?? 0;
    expect(length(10)).toBeGreaterThan(length(30));
  });
});
