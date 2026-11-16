import { render } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { twoSquares } from "../../tests/fixtures";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";

// FEAT-024: your own colors and a fixed domain. What is tested here is that the LEGEND follows the scale (colors
// and ends); the colors themselves are tested in src/core/ramps.test.ts. That it LOOKS right: the stories.

type Row = { code: string; v: number };
// A share that only goes from 31 % to 74 %: the data's range would NOT be 0 … 100.
const data: Row[] = [
  { code: "A", v: 31 },
  { code: "B", v: 74 },
];
const mount = (props: Partial<ChoroplethMapProps<Row>>) =>
  render(
    <ChoroplethMap<Row>
      {...({
        geography: twoSquares,
        data,
        getId: (r: Row) => r.code,
        getValue: (r: Row) => r.v,
        variant: "sequential",
        palette: { from: "#000000", to: "#ffffff" },
        domain: [0, 100],
        formatValue: (v: number) => `${v} %`,
        width: 200,
        height: 100,
        ...props,
      } as ChoroplethMapProps<Row>)}
    />,
  );

describe("legend with a custom ramp and a fixed domain", () => {
  it("gradient bar: the ends are the FIXED ones, formatted with formatValue, not the data's", () => {
    const { container, getByText, queryByText } = mount({ classification: { method: "linear" } });

    expect(container.querySelector("[data-legend-gradient]")).not.toBeNull();
    expect(getByText("0 %")).toBeTruthy();
    expect(getByText("100 %")).toBeTruthy();
    expect(queryByText("31 %")).toBeNull();
    expect(queryByText("74 %")).toBeNull();
  });

  it("gradient bar: it starts with the ramp's first color and ends with its last one", () => {
    const { container } = mount({ classification: { method: "linear" } });
    const style = container.querySelector("[data-legend-gradient]")?.getAttribute("style") ?? "";

    expect(style).toMatch(/linear-gradient\(to right, rgb\(0, 0, 0\),/);
    expect(style).toMatch(/rgb\(255, 255, 255\)\)/);
  });

  it("the regions are painted with the same scale: 31 % is not the first color of the ramp", () => {
    const { container } = mount({ classification: { method: "linear" } });
    const fill = (id: string) =>
      (container.querySelector(`.cm-regions [data-region-id="${id}"]`) as SVGElement).style.fill;

    expect(fill("A")).not.toBe("rgb(0, 0, 0)");
    expect(fill("B")).not.toBe("rgb(255, 255, 255)");
    expect(fill("A")).not.toBe(fill("B"));
  });

  it("classes in a bar: the first segment is the ramp's first color and the ticks run over the fixed domain", () => {
    const { container } = mount({
      classification: { method: "quantize", classes: 4 },
      legend: { variant: "bar" },
    });
    const segments = [...container.querySelectorAll<HTMLElement>(".cm-legend__segment")];
    const ticks = [...container.querySelectorAll(".cm-legend__tick")].map((t) => t.textContent);

    expect(segments).toHaveLength(4);
    expect(segments[0]?.style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(segments[3]?.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(ticks).toEqual(["0 %", "25 %", "50 %", "75 %", "100 %"]);
  });

  it("classes as swatches: the ranges are the fixed ones", () => {
    const { getByText } = mount({ classification: { method: "quantize", classes: 2 } });

    expect(getByText("0 % – 50 %")).toBeTruthy();
    expect(getByText("50 % – 100 %")).toBeTruthy();
  });
});

describe("development warning for a ramp that reads badly", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());
  const palette = (text: string) =>
    warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes(text));

  it("black → blue warns, once, and the map still renders", () => {
    const { container, rerender } = mount({ palette: { from: "#0a0a0a", to: "#2563eb" } });
    expect(palette("points of lightness")).toHaveLength(1);
    expect(container.querySelectorAll(".cm-regions [data-region-id]")).toHaveLength(2);

    // An inline object has a new identity on every render: the same content must not warn again.
    rerender(
      <ChoroplethMap<Row>
        {...({
          geography: twoSquares,
          data,
          getId: (r: Row) => r.code,
          getValue: (r: Row) => r.v,
          variant: "sequential",
          palette: { from: "#0a0a0a", to: "#2563eb" },
          width: 200,
          height: 100,
        } as ChoroplethMapProps<Row>)}
      />,
    );
    expect(palette("points of lightness")).toHaveLength(1);
  });

  it("a light → dark ramp does not warn", () => {
    mount({ palette: { from: "#ffffff", to: "#2563eb" } });
    expect(palette("[choropleth] palette")).toHaveLength(0);
  });

  it("a named palette is never checked", () => {
    mount({ palette: "blues" });
    expect(palette("[choropleth] palette")).toHaveLength(0);
  });

  it("diagnostics={false} silences it", () => {
    mount({ palette: { from: "#0a0a0a", to: "#2563eb" }, diagnostics: false });
    expect(palette("[choropleth] palette")).toHaveLength(0);
  });
});
