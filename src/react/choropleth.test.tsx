import { fireEvent, render, screen } from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import { twoSquares } from "../../tests/fixtures";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";

type Row = { code: string; v: number | null };

const data: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const baseProps = {
  geography: twoSquares,
  data,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const renderMap = (
  props: Partial<RootProps<Row>> = {},
  children: React.ReactNode = (
    <>
      <Choropleth.Svg />
      <Choropleth.Legend />
      <Choropleth.Tooltip />
    </>
  ),
) => {
  const utils = render(
    <Choropleth.Root {...({ ...baseProps, ...props } as RootProps<Row>)}>
      {children}
    </Choropleth.Root>,
  );
  const path = (id: string) => utils.container.querySelector(`[data-region-id="${id}"]`) as Element;
  return { ...utils, path };
};

describe("Choropleth (compound)", () => {
  it("default Svg: one path per region with its color, borders and selection layer", () => {
    const { path, container } = renderMap();

    expect(path("A").getAttribute("d")).toMatch(/^M/);
    expect((path("A") as SVGElement).style.fill).not.toBe((path("B") as SVGElement).style.fill);
    expect(container.querySelector(".cm-borders")).not.toBeNull();
    expect(container.querySelector(".cm-selection")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 200 100");
  });

  it("with TopoJSON the regions carry no stroke of their own; with GeoJSON they do and there is no Borders", () => {
    const topo = renderMap();
    expect(topo.container.querySelector(".cm-regions")?.hasAttribute("data-outlined")).toBe(false);
    topo.unmount();

    const geo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "A",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    const flat = renderMap({ geography: geo });
    expect(flat.container.querySelector(".cm-regions")?.hasAttribute("data-outlined")).toBe(true);
    expect(flat.container.querySelector(".cm-borders")).toBeNull();
  });

  it("lets you compose only the pieces you want, in any order", () => {
    const { container } = renderMap(
      {},
      <Choropleth.Svg>
        <Choropleth.Regions />
      </Choropleth.Svg>,
    );

    expect(container.querySelector(".cm-regions")).not.toBeNull();
    expect(container.querySelector(".cm-borders")).toBeNull();
    expect(container.querySelector(".cm-legend")).toBeNull();
  });

  it("a click on a region calls onItemClick with the typed event", () => {
    const onItemClick = vi.fn<(e: { id: string; datum: Row | undefined }) => void>();
    const { path } = renderMap({ onItemClick });

    fireEvent.click(path("B"));

    expect(onItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "B", datum: { code: "B", v: 9 } }),
    );
  });

  it("a click outside a region does nothing; without onItemClick it does not fail", () => {
    const onItemClick = vi.fn<() => void>();
    const { container } = renderMap({ onItemClick });
    fireEvent.click(container.querySelector(".cm-regions") as Element);
    expect(onItemClick).not.toHaveBeenCalled();

    const plain = renderMap();
    fireEvent.click(plain.path("A"));
  });

  it("pointer cursor only if there is onItemClick", () => {
    const withClick = renderMap({ onItemClick: () => {} });
    expect((withClick.container.querySelector(".cm-regions") as HTMLElement).style.cursor).toBe(
      "pointer",
    );
    withClick.unmount();

    const without = renderMap();
    expect((without.container.querySelector(".cm-regions") as HTMLElement).style.cursor).toBe("");
  });

  describe("hover and Selection", () => {
    it("hover draws the highlighted region on top; leaving the map removes it", () => {
      const onItemHover = vi.fn<(e: { id: string } | null) => void>();
      const { path, container } = renderMap({ onItemHover });

      fireEvent.pointerOver(path("A"));
      expect(container.querySelector('[data-selection="hover"]')?.getAttribute("d")).toBe(
        path("A").getAttribute("d"),
      );
      expect(onItemHover).toHaveBeenLastCalledWith(expect.objectContaining({ id: "A" }));

      fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element);
      expect(container.querySelector('[data-selection="hover"]')).toBeNull();
      expect(onItemHover).toHaveBeenLastCalledWith(null);
    });

    it("moving to another region changes the hover; re-entering the same one does not repeat the event", () => {
      const onItemHover = vi.fn<(e: { id: string } | null) => void>();
      const { path, container } = renderMap({ onItemHover });

      fireEvent.pointerOver(path("A"));
      fireEvent.pointerOver(path("A"));
      expect(onItemHover).toHaveBeenCalledTimes(1);

      fireEvent.pointerOver(path("B"));
      expect(container.querySelector('[data-selection="hover"]')?.getAttribute("d")).toBe(
        path("B").getAttribute("d"),
      );
    });

    it("the cursor over the ocean (inside the group) removes the hover", () => {
      const { path, container } = renderMap();
      fireEvent.pointerOver(path("A"));
      fireEvent.pointerOver(container.querySelector(".cm-regions") as Element);

      expect(container.querySelector('[data-selection="hover"]')).toBeNull();
    });

    it("pointerLeave without a previous hover does not fail", () => {
      const { container } = renderMap();
      fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element);
      expect(container.querySelector("[data-selection]")).toBeNull();
    });

    it("selectedId draws the selection layer; with hover on the same one, both strokes coexist", () => {
      const { path, container } = renderMap({ selectedId: "B" });
      expect(container.querySelector('[data-selection="selected"]')?.getAttribute("d")).toBe(
        path("B").getAttribute("d"),
      );

      fireEvent.pointerOver(path("B"));
      expect(container.querySelectorAll("[data-selection]")).toHaveLength(2);
    });

    it("a selectedId that does not exist draws nothing", () => {
      const { container } = renderMap({ selectedId: "ZZ" });
      expect(container.querySelector("[data-selection]")).toBeNull();
    });
  });

  describe("Legend", () => {
    it("by default shows one swatch per class, with optional title and counts", () => {
      renderMap({}, <Choropleth.Legend title="Ventas" showCount />);

      expect(screen.getByText("Ventas")).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
      expect(screen.getAllByText(/^\(\d+\)$/)).toHaveLength(5);
    });

    it("without showCount it shows no counts, and accepts className", () => {
      const { container } = renderMap({}, <Choropleth.Legend className="mia" />);

      expect(screen.queryAllByText(/^\(\d+\)$/)).toHaveLength(0);
      expect(container.querySelector(".cm-legend.mia")).not.toBeNull();
    });

    it("render prop: receives items, scale and formatValue", () => {
      renderMap(
        { formatValue: (v) => `${v}%` },
        <Choropleth.Legend>
          {({ items, scale, formatValue }) => (
            <p>{`${items.length}|${scale?.kind}|${formatValue(7)}`}</p>
          )}
        </Choropleth.Legend>,
      );

      expect(screen.getByText("5|classed|7%")).toBeTruthy();
    });

    it("continuous scale: gradient bar with minimum and maximum", () => {
      const { container } = renderMap(
        { classification: { method: "linear" } },
        <Choropleth.Legend />,
      );

      expect(container.querySelector("[data-legend-gradient]")).not.toBeNull();
      expect(screen.getByText("1")).toBeTruthy();
      expect(screen.getByText("9")).toBeTruthy();
      expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });
  });

  describe("performance: interaction does not re-render Root", () => {
    // `getId` is called once per row on EVERY render of `useChoropleth` (join): counting them is a
    // render counter for `Root` without touching production code.
    it("hover between regions and cursor movement do not recompute the map", () => {
      const getId = vi.fn<(r: Row) => string>((r) => r.code);
      const { path } = renderMap({ getId });
      const before = getId.mock.calls.length;

      fireEvent.pointerOver(path("A"));
      fireEvent.pointerMove(path("A"), { clientX: 10, clientY: 10 });
      fireEvent.pointerOver(path("B"));
      fireEvent.pointerMove(path("B"), { clientX: 120, clientY: 40 });
      fireEvent.pointerLeave(path("B").parentElement as Element);

      expect(getId.mock.calls.length).toBe(before);
    });

    it("does re-render when something from the consumer changes (test control)", () => {
      const getId = vi.fn<(r: Row) => string>((r) => r.code);
      const { rerender } = renderMap({ getId });
      const before = getId.mock.calls.length;
      rerender(
        <Choropleth.Root {...({ ...baseProps, getId, width: 300 } as RootProps<Row>)}>
          <Choropleth.Svg />
        </Choropleth.Root>,
      );
      expect(getId.mock.calls.length).toBeGreaterThan(before);
    });
  });

  describe("Tooltip", () => {
    const hover = (path: Element, x: number, y: number) => {
      fireEvent.pointerOver(path);
      fireEvent.pointerMove(path, { clientX: x, clientY: y });
    };

    it("is not shown without hover", () => {
      renderMap();
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("by default shows name and formatted value next to the cursor", () => {
      const { path } = renderMap({ formatValue: (v) => `${v} u.` });
      hover(path("A"), 30, 20);

      const tip = screen.getByRole("tooltip");
      expect(tip.textContent).toContain("Alpha");
      expect(tip.textContent).toContain("1 u.");
      expect(tip.style.left).toBe("42px");
      expect(tip.style.top).toBe("32px");
    });

    it("region without data: No data; without a name in properties it uses the id", () => {
      const { path } = renderMap({ data: [{ code: "B", v: null }] });
      hover(path("A"), 10, 10);
      expect(screen.getByRole("tooltip").textContent).toContain("No data");
    });

    it("without properties.name it falls back to the region's id", () => {
      const geo: FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "Z",
            properties: null,
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      };
      const { path } = renderMap({ geography: geo, data: [] });
      hover(path("Z"), 10, 10);
      expect(screen.getByRole("tooltip").textContent).toContain("Z");
    });

    it("flips in the right/bottom half so as not to overflow the container", () => {
      const { path } = renderMap();
      hover(path("A"), 150, 80);

      const tip = screen.getByRole("tooltip");
      expect(tip.style.left).toBe("138px");
      expect(tip.style.top).toBe("68px");
      expect(tip.style.transform).toBe("translate(-100%, -100%)");
    });

    it("render prop with the typed context (datum, value, color)", () => {
      const { path } = renderMap(
        {},
        <>
          <Choropleth.Svg />
          <Choropleth.Tooltip<Row>>
            {({ datum, value, formattedValue, color }) => (
              <span>{`${datum?.code}|${value}|${formattedValue}|${color.startsWith("rgb")}`}</span>
            )}
          </Choropleth.Tooltip>
        </>,
      );
      hover(path("B"), 10, 10);

      expect(screen.getByText("B|9|9|true")).toBeTruthy();
    });

    it("disappears on leaving the container", () => {
      const { path, container } = renderMap();
      hover(path("A"), 10, 10);
      fireEvent.pointerLeave(container.querySelector(".cm-root") as Element);

      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  describe("estilos (paso 12)", () => {
    it("regions without data use the --cm-empty-fill variable with a fallback", () => {
      const { path } = renderMap({ data: [{ code: "A", v: 1 }] });

      expect((path("B") as SVGElement).style.fill).toBe("var(--cm-empty-fill, #d4d4d4)");
    });

    it("an explicit emptyFill takes priority over the variable", () => {
      const { path } = renderMap({ data: [{ code: "A", v: 1 }], emptyFill: "#eee" });

      expect((path("B") as SVGElement).style.fill).toBe("#eee");
    });

    it("unstyled marks the Root so styles.css does not apply", () => {
      const styled = renderMap();
      expect(styled.container.querySelector(".cm-root")?.hasAttribute("data-unstyled")).toBe(false);
      styled.unmount();

      const bare = renderMap({ unstyled: true });
      expect(bare.container.querySelector(".cm-root")?.hasAttribute("data-unstyled")).toBe(true);
    });

    it("the default tooltip carries a box class; the custom one does not", () => {
      const def = renderMap();
      fireEvent.pointerOver(def.path("A"));
      fireEvent.pointerMove(def.path("A"), { clientX: 5, clientY: 5 });
      expect(screen.getByRole("tooltip").className).toContain("cm-tooltip--default");
      def.unmount();

      const custom = renderMap(
        {},
        <>
          <Choropleth.Svg />
          <Choropleth.Tooltip className="mio">{() => <b>x</b>}</Choropleth.Tooltip>
        </>,
      );
      fireEvent.pointerOver(custom.path("A"));
      fireEvent.pointerMove(custom.path("A"), { clientX: 5, clientY: 5 });
      const tip = screen.getByRole("tooltip");
      expect(tip.className).toContain("mio");
      expect(tip.className).not.toContain("cm-tooltip--default");
    });
  });

  it("Root accepts className and style", () => {
    const { container } = renderMap({ className: "x", style: { height: 50 } });
    const root = container.querySelector(".cm-root.x") as HTMLElement;

    expect(root.style.position).toBe("relative");
    expect(root.style.height).toBe("50px");
  });

  it("a piece outside Root throws a clear error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Choropleth.Regions />)).toThrow(/inside <Choropleth.Root>/);
    spy.mockRestore();
  });
});

describe("Choropleth (compound) · categorical and bubble variants", () => {
  it("categorical: category legend and tooltip with the label", () => {
    const { path } = renderMap(
      {
        variant: "categorical",
        getCategory: (r: Row) => (r.v === 1 ? "bajo" : "alto"),
        categories: [
          { id: "bajo", label: "Bajo" },
          { id: "alto", label: "Alto" },
        ],
      } as never,
      <>
        <Choropleth.Svg />
        <Choropleth.Legend showCount />
        <Choropleth.Tooltip />
      </>,
    );

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Bajo(1)",
      "Alto(1)",
    ]);
    fireEvent.pointerOver(path("A"));
    fireEvent.pointerMove(path("A"), { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("Bajo");
  });

  it("bubble: draws circles, they do not capture the mouse and the legend shows the sizes", () => {
    const { container, path } = renderMap({
      variant: "bubble",
      getValue: (r: Row) => r.v,
      formatValue: (v: number) => `${v} €`,
    } as never);

    const circles = container.querySelectorAll("circle.cm-bubble");
    expect(circles).toHaveLength(2);
    expect(container.querySelector(".cm-bubbles")?.getAttribute("pointer-events")).toBe("none");
    expect(container.querySelectorAll(".cm-legend__size")).toHaveLength(3);
    expect(screen.getByText("9 €")).toBeTruthy();

    // the hover keeps working through the region
    fireEvent.pointerOver(path("B"));
    expect(container.querySelector('[data-selection="hover"]')).not.toBeNull();
  });

  it("without bubbles (numeric variant) there is no bubble layer or sizes", () => {
    const { container } = renderMap();

    expect(container.querySelector(".cm-bubbles")).toBeNull();
    expect(container.querySelector(".cm-legend__sizes")).toBeNull();
  });

  it("the headless legend receives sizeItems", () => {
    renderMap(
      { variant: "bubble", getValue: (r: Row) => r.v } as never,
      <Choropleth.Legend>
        {({ sizeItems }) => <p>{`sizes:${sizeItems.length}`}</p>}
      </Choropleth.Legend>,
    );

    expect(screen.getByText("sizes:3")).toBeTruthy();
  });
});

describe("Choropleth (compound) · items: regions and points, Pointer Events", () => {
  type Shop = { code: string; sales: number; at: [number, number] };
  const shops: Shop[] = [
    { code: "S1", sales: 10, at: [0.5, 0.5] },
    { code: "S2", sales: 40, at: [1.5, 0.5] },
  ];
  const pointsProps = {
    variant: "bubble",
    data: shops,
    getId: (s: Shop) => s.code,
    getValue: (s: Shop) => s.sales,
    getCoordinates: (s: Shop) => s.at,
  };
  const renderShops = (extra: Record<string, unknown> = {}) =>
    renderMap({ ...pointsProps, ...extra } as never);
  const point = (container: Element, id: string) =>
    container.querySelector(`[data-point-id="${id}"]`) as Element;

  it("bubbles with their own coordinates are `point` items with their hover, click and tooltip", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const onItemHover = vi.fn<(item: unknown) => void>();
    const { container } = renderShops({ onItemClick, onItemHover });

    fireEvent.pointerOver(point(container, "S2"));
    fireEvent.pointerEnter(point(container, "S2"));
    fireEvent.pointerMove(point(container, "S2"), { clientX: 5, clientY: 5 });
    expect(onItemHover).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "point", id: "S2", coordinates: [1.5, 0.5] }),
    );
    expect(container.querySelector('circle[data-selection="hover"]')).not.toBeNull();
    expect(screen.getByRole("tooltip").textContent).toContain("S2");
    expect(screen.getByRole("tooltip").textContent).toContain("40");

    fireEvent.click(point(container, "S2"));
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ kind: "point", id: "S2" }));

    fireEvent.pointerLeave(point(container, "S2"));
    expect(onItemHover).toHaveBeenLastCalledWith(null);
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
  });

  it("bubbles at a region's centroid still do not capture the mouse", () => {
    const { container } = renderMap({
      variant: "bubble",
      getValue: (r: Row) => r.v,
    } as never);
    expect(container.querySelectorAll("[data-point-id]")).toHaveLength(0);
    expect(container.querySelector("circle.cm-bubble")?.getAttribute("pointer-events")).toBeNull();
  });

  it("a point is not confused with a region of the same id", () => {
    const onItemHover = vi.fn<(item: unknown) => void>();
    const { container, path } = renderShops({
      onItemHover,
      // A store whose id matches region A.
      data: [{ code: "A", sales: 5, at: [0.5, 0.5] }],
    });
    fireEvent.pointerEnter(point(container, "A"));
    expect(onItemHover).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "point" }));
    // Moving to the region becomes a `region` item.
    fireEvent.pointerOver(path("A"));
    expect(onItemHover).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "region" }));
  });

  it("a point with the same id as a region links its `feature`", () => {
    const onItemHover = vi.fn<(item: { feature?: { id?: string } }) => void>();
    const { container } = renderShops({
      onItemHover,
      data: [{ code: "B", sales: 5, at: [1.5, 0.5] }],
    });
    fireEvent.pointerEnter(point(container, "B"));
    expect(onItemHover.mock.calls.at(-1)?.[0].feature?.id).toBe("B");
  });

  it("touch: the first tap leaves the preview and `pointerleave` does not remove it", () => {
    const { container, path } = renderMap();
    fireEvent.pointerOver(path("A"), { pointerType: "touch" });
    fireEvent.pointerDown(container.querySelector(".cm-root") as Element, {
      pointerType: "touch",
      clientX: 20,
      clientY: 10,
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();

    // The browser sends "leave" when the finger lifts.
    fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element, {
      pointerType: "touch",
    });
    fireEvent.pointerLeave(container.querySelector(".cm-root") as Element, {
      pointerType: "touch",
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(container.querySelector('[data-selection="hover"]')).not.toBeNull();

    // Tapping the "ocean" (inside the group, outside every region) removes it.
    fireEvent.pointerOver(container.querySelector(".cm-regions") as Element, {
      pointerType: "touch",
    });
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
  });

  it("with a mouse, `pointerleave` does remove the hover", () => {
    const { container, path } = renderMap();
    fireEvent.pointerOver(path("A"), { pointerType: "mouse" });
    fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element, {
      pointerType: "mouse",
    });
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
  });
});
