import { fireEvent, render, screen } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { ChoroplethMap } from "./choropleth-map";

type Row = { code: string; v: number | null };

const data: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const common = {
  geography: twoSquares,
  data,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  width: 200,
  height: 100,
} as const;

describe("ChoroplethMap (preset)", () => {
  it("with minimal props it draws the map, a legend with No data (English by default) and a tooltip", () => {
    const { container } = render(
      <ChoroplethMap {...common} data={[{ code: "A", v: 1 }]} variant="sequential" />,
    );

    expect(container.querySelectorAll("[data-region-id]")).toHaveLength(2);
    expect(screen.getByText("No data")).toBeTruthy();

    fireEvent.pointerOver(container.querySelector('[data-region-id="A"]') as Element);
    fireEvent.pointerMove(container.querySelector("svg") as Element, { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("Alpha");
  });

  it("diverging variant with midpoint", () => {
    render(<ChoroplethMap {...common} variant="diverging" midpoint={5} palette="rdbu" />);

    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("legend={false} hides it", () => {
    const { container } = render(<ChoroplethMap {...common} variant="sequential" legend={false} />);

    expect(container.querySelector(".cm-legend")).toBeNull();
  });

  it("legend: title, counts and corner", () => {
    const { container } = render(
      <ChoroplethMap
        {...common}
        variant="sequential"
        legend={{ title: "Ventas", position: "top-right", showCount: true }}
      />,
    );

    expect(screen.getByText("Ventas")).toBeTruthy();
    const box = container.querySelector(".cm-legend")?.parentElement as HTMLElement;
    expect(box.style.top).toBe("12px");
    expect(box.style.right).toBe("12px");
    expect(screen.getAllByText(/^\(\d+\)$/).length).toBeGreaterThan(0);
  });

  it("the default corner is bottom left", () => {
    const { container } = render(<ChoroplethMap {...common} variant="sequential" />);
    const box = container.querySelector(".cm-legend")?.parentElement as HTMLElement;

    expect(box.style.bottom).toBe("12px");
    expect(box.style.left).toBe("12px");
  });

  it("a custom emptyLabel replaces No data", () => {
    render(<ChoroplethMap {...common} data={[]} variant="sequential" emptyLabel="Sin cobertura" />);

    expect(screen.getByText("Sin cobertura")).toBeTruthy();
    expect(screen.queryByText("No data")).toBeNull();
  });

  it("renderTooltip receives the typed datum; onItemClick and selectedId work", () => {
    const onItemClick = vi.fn<(e: { id: string }) => void>();
    const { container } = render(
      <ChoroplethMap
        {...common}
        variant="sequential"
        selectedId="B"
        onItemClick={onItemClick}
        renderTooltip={({ datum }) => <span>{`code:${datum?.code}`}</span>}
      />,
    );
    const b = container.querySelector('[data-region-id="B"]') as Element;

    fireEvent.click(b);
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ id: "B" }));
    expect(container.querySelector('[data-selection="selected"]')).not.toBeNull();

    fireEvent.pointerOver(b);
    fireEvent.pointerMove(b, { clientX: 5, clientY: 5 });
    expect(screen.getByText("code:B")).toBeTruthy();
  });

  it("unstyled reaches Root", () => {
    const { container } = render(<ChoroplethMap {...common} variant="sequential" unstyled />);

    expect(container.querySelector(".cm-root")?.hasAttribute("data-unstyled")).toBe(true);
  });

  it("className, style and ariaLabel reach the DOM", () => {
    const { container } = render(
      <ChoroplethMap
        {...common}
        variant="sequential"
        className="mi-mapa"
        style={{ height: 40 }}
        ariaLabel="Sales by country"
      />,
    );

    expect(container.querySelector(".cm-root.mi-mapa")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Sales by country" })).toBeTruthy();
  });

  it("categorical and bubble from the preset", () => {
    const { container } = render(
      <>
        <ChoroplethMap {...common} variant="categorical" getCategory={(r) => (r.v ? "a" : null)} />
        <ChoroplethMap {...common} variant="bubble" />
      </>,
    );

    expect(container.querySelectorAll("circle.cm-bubble")).toHaveLength(2);
    expect(screen.getAllByText("a").length).toBeGreaterThan(0);
  });

  // These lines are only CHECKED by `pnpm typecheck`: the @ts-expect-error fails if they compile.
  it("usage errors are compile errors", () => {
    const { getValue: _omit, ...withoutGetValue } = common;
    const render_ = () => (
      <>
        {/* @ts-expect-error: falta getValue */}
        <ChoroplethMap {...withoutGetValue} variant="sequential" />
        {/* @ts-expect-error: rdbu es divergente, no vale en sequential */}
        <ChoroplethMap {...common} variant="sequential" palette="rdbu" />
        {/* @ts-expect-error: midpoint solo existe en diverging */}
        <ChoroplethMap {...common} variant="sequential" midpoint={0} />
        {/* @ts-expect-error: categorical exige getCategory, no getValue */}
        <ChoroplethMap {...withoutGetValue} variant="categorical" />
        {/* @ts-expect-error: getCoordinates solo existe en bubble */}
        <ChoroplethMap {...common} variant="sequential" getCoordinates={() => null} />
        {/* @ts-expect-error: falta variant */}
        <ChoroplethMap {...common} />
      </>
    );
    expect(render_).toBeTypeOf("function");
  });
});
