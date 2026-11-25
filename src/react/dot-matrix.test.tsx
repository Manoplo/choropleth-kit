import { act, fireEvent, render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";

// The dot-matrix renderer. jsdom has no layout: what the library WRITES is tested here.

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

const element = (props: Partial<ChoroplethMapProps<Row>> = {}) => (
  <ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />
);
const preset = (props: Partial<ChoroplethMapProps<Row>> = {}) => render(element(props));

const groups = (container: HTMLElement) => [
  ...container.querySelectorAll<SVGPathElement>(".cm-dots-base .cm-dot-group"),
];
const countDots = (d: string | null | undefined) => d?.match(/h0/g)?.length ?? 0;
const totalDots = (container: HTMLElement) =>
  groups(container).reduce((sum, g) => sum + countDots(g.getAttribute("d")), 0);

describe("dot matrix", () => {
  it("is off by default", () => {
    const { container } = preset();
    expect(container.querySelector(".cm-dots")).toBeNull();
    expect(container.querySelector(".cm-hit-layer")).toBeNull();
    expect(container.querySelector(".cm-borders")).not.toBeNull();
  });

  it("draws one path per color inside the viewport, hidden from screen readers and from the pointer", () => {
    const { container } = preset({ dots: true });
    const layer = container.querySelector(".cm-dots");
    expect(layer?.closest(".cm-viewport")).not.toBeNull();
    expect(layer?.getAttribute("aria-hidden")).toBe("true");
    expect(layer?.getAttribute("pointer-events")).toBe("none");
    // A has a value and B does not: two colors, two classes.
    expect(groups(container)).toHaveLength(2);
    expect(groups(container).map((g) => g.getAttribute("data-class"))).toContain("empty");
    expect(groups(container).every((g) => countDots(g.getAttribute("d")) > 0)).toBe(true);
  });

  it("keeps the regions as an invisible hit layer and drops borders and patterns", () => {
    const { container } = preset({ dots: true, emptyPattern: "hatch" });
    expect(container.querySelector(".cm-hit-layer")?.getAttribute("opacity")).toBe("0");
    expect(container.querySelectorAll(".cm-hit-layer .cm-region")).toHaveLength(2);
    expect(container.querySelector(".cm-borders")).toBeNull();
    expect(container.querySelector(".cm-patterns")).toBeNull();
  });

  it("`gap` and `size` set the density and the dot diameter", () => {
    const coarse = preset({ dots: { gap: 20, size: 0.5 } }).container;
    const fine = preset({ dots: { gap: 5 } }).container;
    expect(totalDots(fine)).toBeGreaterThan(totalDots(coarse) * 4);
    expect(coarse.querySelector(".cm-dots")?.getAttribute("stroke-width")).toBe("10");
  });

  it("recolors the dots with new data", () => {
    const view = preset({ dots: true });
    const total = totalDots(view.container);
    view.rerender(
      element({
        dots: true,
        data: [
          { code: "A", v: 1 },
          { code: "B", v: 9 },
        ],
      }),
    );
    expect(totalDots(view.container)).toBe(total);
    expect(groups(view.container).map((g) => g.getAttribute("data-class"))).not.toContain("empty");
  });

  it("recomputes the lattice when the canvas changes size", () => {
    const view = preset({ dots: true });
    const total = totalDots(view.container);
    view.rerender(element({ dots: true, width: 400, height: 200 }));
    expect(totalDots(view.container)).toBeGreaterThan(total);
  });

  it("applies getRegionStyle's color, opacity and class to the dots", () => {
    const { container } = preset({
      dots: true,
      getRegionStyle: (r) =>
        r.id === "A" ? { fill: "rgb(1, 2, 3)", opacity: 0.5, className: "mine" } : undefined,
    });
    const mine = container.querySelector<SVGPathElement>(".cm-dot-group.mine");
    expect(mine?.style.stroke).toBe("rgb(1, 2, 3)");
    expect(mine?.style.opacity).toBe("0.5");
  });

  it("hover and click on the hit layer light up that region's dots (no outline)", () => {
    const onItemClick = vi.fn<() => void>();
    const { container } = preset({ dots: true, onItemClick, defaultSelectedId: null });
    const region = container.querySelector('[data-region-id="A"]') as Element;
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
    act(() => {
      fireEvent.pointerOver(region);
    });
    const halo = container.querySelector('.cm-dots [data-selection="hover"] .cm-dots-halo');
    expect(countDots(halo?.getAttribute("d"))).toBeGreaterThan(0);
    act(() => {
      fireEvent.click(region);
    });
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.cm-dots [data-selection="selected"]')).not.toBeNull();
    expect(container.querySelector(".cm-selection path")).toBeNull();
  });

  it("composes by hand: a hit-only Regions under Dots", () => {
    const { container } = render(
      <Choropleth.Root<Row> {...baseProps}>
        <Choropleth.Svg>
          <Choropleth.Viewport>
            <Choropleth.Regions hitOnly />
            <Choropleth.Dots lattice="square" />
          </Choropleth.Viewport>
        </Choropleth.Svg>
      </Choropleth.Root>,
    );
    expect(groups(container).length).toBeGreaterThan(0);
  });
});
