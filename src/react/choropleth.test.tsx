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

  it("clic en una región llama a onItemClick con el evento tipado", () => {
    const onItemClick = vi.fn<(e: { id: string; datum: Row | undefined }) => void>();
    const { path } = renderMap({ onItemClick });

    fireEvent.click(path("B"));

    expect(onItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "B", datum: { code: "B", v: 9 } }),
    );
  });

  it("clic fuera de una región no hace nada; sin onItemClick no falla", () => {
    const onItemClick = vi.fn<() => void>();
    const { container } = renderMap({ onItemClick });
    fireEvent.click(container.querySelector(".cm-regions") as Element);
    expect(onItemClick).not.toHaveBeenCalled();

    const plain = renderMap();
    fireEvent.click(plain.path("A"));
  });

  it("cursor pointer solo si hay onItemClick", () => {
    const withClick = renderMap({ onItemClick: () => {} });
    expect((withClick.container.querySelector(".cm-regions") as HTMLElement).style.cursor).toBe(
      "pointer",
    );
    withClick.unmount();

    const without = renderMap();
    expect((without.container.querySelector(".cm-regions") as HTMLElement).style.cursor).toBe("");
  });

  describe("hover y Selection", () => {
    it("hover dibuja la región resaltada encima; salir del mapa la quita", () => {
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

    it("pasar a otra región cambia el hover; volver a entrar en la misma no repite el evento", () => {
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

    it("el cursor sobre el océano (dentro del grupo) quita el hover", () => {
      const { path, container } = renderMap();
      fireEvent.pointerOver(path("A"));
      fireEvent.pointerOver(container.querySelector(".cm-regions") as Element);

      expect(container.querySelector('[data-selection="hover"]')).toBeNull();
    });

    it("pointerLeave sin hover previo no falla", () => {
      const { container } = renderMap();
      fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element);
      expect(container.querySelector("[data-selection]")).toBeNull();
    });

    it("selectedId pinta la capa de selección; con hover en la misma, los dos trazos coexisten", () => {
      const { path, container } = renderMap({ selectedId: "B" });
      expect(container.querySelector('[data-selection="selected"]')?.getAttribute("d")).toBe(
        path("B").getAttribute("d"),
      );

      fireEvent.pointerOver(path("B"));
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

  describe("rendimiento: la interacción no re-renderiza Root", () => {
    // `getId` se llama una vez por fila en CADA render de `useChoropleth` (join): contarlas es un
    // contador de renders de `Root` sin tocar el código de producción.
    it("hover entre regiones y movimiento del cursor no recalculan el mapa", () => {
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

    it("sí se re-renderiza cuando cambia algo del consumidor (control del test)", () => {
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
      fireEvent.pointerLeave(container.querySelector(".cm-root") as Element);

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
    fireEvent.pointerOver(path("A"));
    fireEvent.pointerMove(path("A"), { clientX: 5, clientY: 5 });
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
    fireEvent.pointerOver(path("B"));
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

describe("Choropleth (compound) · items: regiones y puntos, Pointer Events", () => {
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

  it("las burbujas con coordenadas propias son items `point` con su hover, clic y tooltip", () => {
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

  it("las burbujas en el centroide de una región siguen sin capturar el ratón", () => {
    const { container } = renderMap({
      variant: "bubble",
      getValue: (r: Row) => r.v,
    } as never);
    expect(container.querySelectorAll("[data-point-id]")).toHaveLength(0);
    expect(container.querySelector("circle.cm-bubble")?.getAttribute("pointer-events")).toBeNull();
  });

  it("un punto no se confunde con una región del mismo id", () => {
    const onItemHover = vi.fn<(item: unknown) => void>();
    const { container, path } = renderShops({
      onItemHover,
      // Una tienda cuyo id coincide con la región «A».
      data: [{ code: "A", sales: 5, at: [0.5, 0.5] }],
    });
    fireEvent.pointerEnter(point(container, "A"));
    expect(onItemHover).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "point" }));
    // Moverse a la región pasa a un item `region`.
    fireEvent.pointerOver(path("A"));
    expect(onItemHover).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "region" }));
  });

  it("un punto con el mismo id que una región enlaza su `feature`", () => {
    const onItemHover = vi.fn<(item: { feature?: { id?: string } }) => void>();
    const { container } = renderShops({
      onItemHover,
      data: [{ code: "B", sales: 5, at: [1.5, 0.5] }],
    });
    fireEvent.pointerEnter(point(container, "B"));
    expect(onItemHover.mock.calls.at(-1)?.[0].feature?.id).toBe("B");
  });

  it("táctil: el primer toque deja la vista previa y `pointerleave` no la quita", () => {
    const { container, path } = renderMap();
    fireEvent.pointerOver(path("A"), { pointerType: "touch" });
    fireEvent.pointerDown(container.querySelector(".cm-root") as Element, {
      pointerType: "touch",
      clientX: 20,
      clientY: 10,
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();

    // El navegador manda «leave» al levantar el dedo.
    fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element, {
      pointerType: "touch",
    });
    fireEvent.pointerLeave(container.querySelector(".cm-root") as Element, {
      pointerType: "touch",
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(container.querySelector('[data-selection="hover"]')).not.toBeNull();

    // Tocar el «océano» (dentro del grupo, fuera de toda región) la quita.
    fireEvent.pointerOver(container.querySelector(".cm-regions") as Element, {
      pointerType: "touch",
    });
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
  });

  it("con ratón, `pointerleave` sí quita el hover", () => {
    const { container, path } = renderMap();
    fireEvent.pointerOver(path("A"), { pointerType: "mouse" });
    fireEvent.pointerLeave(container.querySelector(".cm-regions") as Element, {
      pointerType: "mouse",
    });
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
  });
});
