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
  it("Svg por defecto: una ruta por región con su color, fronteras y capa de selección", () => {
    const { path, container } = renderMap();

    expect(path("A").getAttribute("d")).toMatch(/^M/);
    expect((path("A") as SVGElement).style.fill).not.toBe((path("B") as SVGElement).style.fill);
    expect(container.querySelector(".cm-borders")).not.toBeNull();
    expect(container.querySelector(".cm-selection")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 200 100");
  });

  it("con TopoJSON las regiones no llevan trazo propio; con GeoJSON sí y no hay Borders", () => {
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

  it("permite componer solo las piezas que se quieren, en cualquier orden", () => {
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

  it("clic en una región llama a onRegionClick con el evento tipado", () => {
    const onRegionClick = vi.fn<(e: { id: string; datum: Row | undefined }) => void>();
    const { path } = renderMap({ onRegionClick });

    fireEvent.click(path("B"));

    expect(onRegionClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "B", datum: { code: "B", v: 9 } }),
    );
  });

  it("clic fuera de una región no hace nada; sin onRegionClick no falla", () => {
    const onRegionClick = vi.fn<() => void>();
    const { container } = renderMap({ onRegionClick });
    fireEvent.click(container.querySelector(".cm-regions") as Element);
    expect(onRegionClick).not.toHaveBeenCalled();

    const plain = renderMap();
    fireEvent.click(plain.path("A"));
  });

  it("cursor pointer solo si hay onRegionClick", () => {
    const withClick = renderMap({ onRegionClick: () => {} });
    expect((withClick.container.querySelector(".cm-regions") as HTMLElement).style.cursor).toBe(
      "pointer",
    );
    withClick.unmount();

    const without = renderMap();
    expect((without.container.querySelector(".cm-regions") as HTMLElement).style.cursor).toBe("");
  });

  describe("hover y Selection", () => {
    it("hover dibuja la región resaltada encima; salir del mapa la quita", () => {
      const onRegionHover = vi.fn<(e: { id: string } | null) => void>();
      const { path, container } = renderMap({ onRegionHover });

      fireEvent.mouseOver(path("A"));
      expect(container.querySelector('[data-selection="hover"]')?.getAttribute("d")).toBe(
        path("A").getAttribute("d"),
      );
      expect(onRegionHover).toHaveBeenLastCalledWith(expect.objectContaining({ id: "A" }));

      fireEvent.mouseLeave(container.querySelector(".cm-regions") as Element);
      expect(container.querySelector('[data-selection="hover"]')).toBeNull();
      expect(onRegionHover).toHaveBeenLastCalledWith(null);
    });

    it("pasar a otra región cambia el hover; volver a entrar en la misma no repite el evento", () => {
      const onRegionHover = vi.fn<(e: { id: string } | null) => void>();
      const { path, container } = renderMap({ onRegionHover });

      fireEvent.mouseOver(path("A"));
      fireEvent.mouseOver(path("A"));
      expect(onRegionHover).toHaveBeenCalledTimes(1);

      fireEvent.mouseOver(path("B"));
      expect(container.querySelector('[data-selection="hover"]')?.getAttribute("d")).toBe(
        path("B").getAttribute("d"),
      );
    });

    it("el cursor sobre el océano (dentro del grupo) quita el hover", () => {
      const { path, container } = renderMap();
      fireEvent.mouseOver(path("A"));
      fireEvent.mouseOver(container.querySelector(".cm-regions") as Element);

      expect(container.querySelector('[data-selection="hover"]')).toBeNull();
    });

    it("mouseLeave sin hover previo no falla", () => {
      const { container } = renderMap();
      fireEvent.mouseLeave(container.querySelector(".cm-regions") as Element);
      expect(container.querySelector("[data-selection]")).toBeNull();
    });

    it("selectedId pinta la capa de selección; con hover en la misma, los dos trazos coexisten", () => {
      const { path, container } = renderMap({ selectedId: "B" });
      expect(container.querySelector('[data-selection="selected"]')?.getAttribute("d")).toBe(
        path("B").getAttribute("d"),
      );

      fireEvent.mouseOver(path("B"));
      expect(container.querySelectorAll("[data-selection]")).toHaveLength(2);
    });

    it("un selectedId que no existe no pinta nada", () => {
      const { container } = renderMap({ selectedId: "ZZ" });
      expect(container.querySelector("[data-selection]")).toBeNull();
    });
  });

  describe("Legend", () => {
    it("por defecto muestra un swatch por clase, con título y conteos opcionales", () => {
      renderMap({}, <Choropleth.Legend title="Ventas" showCount />);

      expect(screen.getByText("Ventas")).toBeTruthy();
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
      expect(screen.getAllByText(/^\(\d+\)$/)).toHaveLength(5);
    });

    it("sin showCount no muestra conteos, y acepta className", () => {
      const { container } = renderMap({}, <Choropleth.Legend className="mia" />);

      expect(screen.queryAllByText(/^\(\d+\)$/)).toHaveLength(0);
      expect(container.querySelector(".cm-legend.mia")).not.toBeNull();
    });

    it("render prop: recibe items, escala y formatValue", () => {
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

    it("escala continua: barra de degradado con mínimo y máximo", () => {
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

  describe("Tooltip", () => {
    const hover = (path: Element, x: number, y: number) => {
      fireEvent.mouseOver(path);
      fireEvent.mouseMove(path, { clientX: x, clientY: y });
    };

    it("no se muestra sin hover", () => {
      renderMap();
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("por defecto muestra nombre y valor formateado junto al cursor", () => {
      const { path } = renderMap({ formatValue: (v) => `${v} u.` });
      hover(path("A"), 30, 20);

      const tip = screen.getByRole("tooltip");
      expect(tip.textContent).toContain("Alpha");
      expect(tip.textContent).toContain("1 u.");
      expect(tip.style.left).toBe("42px");
      expect(tip.style.top).toBe("32px");
    });

    it("región sin dato: «Sin dato»; sin name en properties usa el id", () => {
      const { path } = renderMap({ data: [{ code: "B", v: null }] });
      hover(path("A"), 10, 10);
      expect(screen.getByRole("tooltip").textContent).toContain("Sin dato");
    });

    it("sin properties.name cae al id de la región", () => {
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

    it("se voltea en la mitad derecha/inferior para no salirse del contenedor", () => {
      const { path } = renderMap();
      hover(path("A"), 150, 80);

      const tip = screen.getByRole("tooltip");
      expect(tip.style.left).toBe("138px");
      expect(tip.style.top).toBe("68px");
      expect(tip.style.transform).toBe("translate(-100%, -100%)");
    });

    it("render prop con el contexto tipado (datum, value, color)", () => {
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

    it("al salir del contenedor desaparece", () => {
      const { path, container } = renderMap();
      hover(path("A"), 10, 10);
      fireEvent.mouseLeave(container.querySelector(".cm-root") as Element);

      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  describe("estilos (paso 12)", () => {
    it("las regiones sin dato usan la variable --cm-empty-fill con respaldo", () => {
      const { path } = renderMap({ data: [{ code: "A", v: 1 }] });

      expect((path("B") as SVGElement).style.fill).toBe("var(--cm-empty-fill, #d4d4d4)");
    });

    it("un emptyFill explícito tiene prioridad sobre la variable", () => {
      const { path } = renderMap({ data: [{ code: "A", v: 1 }], emptyFill: "#eee" });

      expect((path("B") as SVGElement).style.fill).toBe("#eee");
    });

    it("unstyled marca el Root para que styles.css no se aplique", () => {
      const styled = renderMap();
      expect(styled.container.querySelector(".cm-root")?.hasAttribute("data-unstyled")).toBe(false);
      styled.unmount();

      const bare = renderMap({ unstyled: true });
      expect(bare.container.querySelector(".cm-root")?.hasAttribute("data-unstyled")).toBe(true);
    });

    it("el tooltip por defecto lleva clase de caja; el personalizado no", () => {
      const def = renderMap();
      fireEvent.mouseOver(def.path("A"));
      fireEvent.mouseMove(def.path("A"), { clientX: 5, clientY: 5 });
      expect(screen.getByRole("tooltip").className).toContain("cm-tooltip--default");
      def.unmount();

      const custom = renderMap(
        {},
        <>
          <Choropleth.Svg />
          <Choropleth.Tooltip className="mio">{() => <b>x</b>}</Choropleth.Tooltip>
        </>,
      );
      fireEvent.mouseOver(custom.path("A"));
      fireEvent.mouseMove(custom.path("A"), { clientX: 5, clientY: 5 });
      const tip = screen.getByRole("tooltip");
      expect(tip.className).toContain("mio");
      expect(tip.className).not.toContain("cm-tooltip--default");
    });
  });

  it("Root acepta className y style", () => {
    const { container } = renderMap({ className: "x", style: { height: 50 } });
    const root = container.querySelector(".cm-root.x") as HTMLElement;

    expect(root.style.position).toBe("relative");
    expect(root.style.height).toBe("50px");
  });

  it("una pieza fuera de Root lanza un error claro", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Choropleth.Regions />)).toThrow(/dentro de <Choropleth.Root>/);
    spy.mockRestore();
  });
});

describe("Choropleth (compound) · variants categorical y bubble", () => {
  it("categorical: leyenda de categorías y tooltip con la etiqueta", () => {
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
    fireEvent.mouseOver(path("A"));
    fireEvent.mouseMove(path("A"), { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("Bajo");
  });

  it("bubble: dibuja círculos, no capturan el ratón y la leyenda muestra los tamaños", () => {
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

    // el hover sigue funcionando a través de la región
    fireEvent.mouseOver(path("B"));
    expect(container.querySelector('[data-selection="hover"]')).not.toBeNull();
  });

  it("sin burbujas (variant numérica) no hay capa de burbujas ni tamaños", () => {
    const { container } = renderMap();

    expect(container.querySelector(".cm-bubbles")).toBeNull();
    expect(container.querySelector(".cm-legend__sizes")).toBeNull();
  });

  it("la leyenda headless recibe sizeItems", () => {
    renderMap(
      { variant: "bubble", getValue: (r: Row) => r.v } as never,
      <Choropleth.Legend>
        {({ sizeItems }) => <p>{`tamaños:${sizeItems.length}`}</p>}
      </Choropleth.Legend>,
    );

    expect(screen.getByText("tamaños:3")).toBeTruthy();
  });
});
