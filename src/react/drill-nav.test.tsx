import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import { es, type DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import { ChoroplethMap } from "./choropleth-map";
import type { RootProps } from "./components/root";
import { defineDrillLevels } from "./drill-levels";
import { useDrillDown } from "./use-drill-down";

// Paso 33: breadcrumb, teclado del drill (Escape / Retroceso) y pista del tooltip. «Reducir movimiento»
// simulado: el vuelo es un salto y el revelado dura 0, así los tests no esperan vuelos de d3.

const square = (id: string, west: number, south: number, size: number): Feature => ({
  type: "Feature",
  id,
  properties: { name: `Name ${id}` },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [west, south + size],
        [west + size, south + size],
        [west + size, south],
        [west, south],
      ],
    ],
  },
});
const collection = (...features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});
const world = collection(square("A", 0, 0, 4), square("B", 6, 0, 4), square("C", 60, 40, 4));
const children: Record<string, FeatureCollection> = {
  A: collection(square("A1", 0, 0, 2), square("A2", 2, 0, 2)),
  B: collection(square("B1", 6, 0, 2), square("B2", 8, 0, 2)),
};

type Row = { id: string; v: number; parent?: string };
const rows: Row[] = [
  { id: "A", v: 1 },
  { id: "B", v: 9 },
  { id: "C", v: 5 },
  { id: "A1", v: 2, parent: "A" },
  { id: "A2", v: 8, parent: "A" },
  { id: "B1", v: 3, parent: "B" },
  { id: "B2", v: 7, parent: "B" },
];
const select = (ctx: DrillContext) =>
  rows.filter((r) => r.parent === (ctx.depth === 0 ? undefined : (ctx.path.at(-1) ?? undefined)));

const regionLevel = {
  id: "region",
  geography: ({ parentId }: DrillContext) => Promise.resolve(children[parentId ?? ""] as never),
};
const levels = defineDrillLevels<Row>([{ id: "country", geography: world }, { ...regionLevel }]);
// Tres niveles: el último hereda la geometría de las regiones (tiendas).
const threeLevels = defineDrillLevels<Row>([
  { id: "country", label: "World", geography: world },
  { ...regionLevel },
  { id: "store", geography: "inherit" },
]);

const baseProps = {
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
  data: select,
} as const;

const mount = (props: Partial<RootProps<Row>> = {}, extra?: React.ReactNode) => {
  const utils = render(
    <Choropleth.Root {...({ ...baseProps, drill: levels, ...props } as RootProps<Row>)}>
      <Choropleth.Svg />
      <Choropleth.Breadcrumb />
      <Choropleth.Tooltip />
      {extra}
    </Choropleth.Root>,
  );
  const ids = () =>
    Array.from(utils.container.querySelectorAll(".cm-regions [data-region-id]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
  const path = (id: string) =>
    utils.container.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;
  const svg = () => utils.container.querySelector("svg") as SVGSVGElement;
  const crumbs = () =>
    Array.from(utils.container.querySelectorAll(".cm-breadcrumb__item")).map((li) =>
      li.textContent?.trim(),
    );
  return { ...utils, ids, path, svg, crumbs };
};

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Breadcrumb", () => {
  it("en la raíz: un <nav> con la raíz como página actual y sin botón «←»", () => {
    const { container, crumbs } = mount();
    const nav = container.querySelector("nav.cm-breadcrumb");

    expect(nav?.getAttribute("aria-label")).toBe("Breadcrumb");
    expect(crumbs()).toEqual(["All"]); // sin `label` en el primer nivel: `labels.breadcrumbRoot`
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe("All");
    expect(container.querySelector(".cm-breadcrumb__back")).toBeNull();
  });

  it("la raíz usa la `label` del primer nivel si la hay", () => {
    const { crumbs } = mount({ drill: threeLevels });

    expect(crumbs()).toEqual(["World"]);
  });

  it("al bajar, la miga nueva lleva el NOMBRE de la región (properties.name) y es la actual", async () => {
    const { path, ids, crumbs, container } = mount();
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(crumbs()).toEqual(["All", "Name A"]);
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe("Name A");
    expect(container.querySelector(".cm-breadcrumb__back")).not.toBeNull();
  });

  it("la miga aparece en cuanto se hace clic (ruta optimista), no al terminar el vuelo", () => {
    const { path, crumbs } = mount();
    fireEvent.click(path("B"));

    expect(crumbs()).toEqual(["All", "Name B"]);
  });

  it("una miga anterior sube hasta ese nivel", async () => {
    const { path, ids, crumbs, container } = mount({ drill: threeLevels });
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    fireEvent.click(path("A1"));
    await waitFor(() => expect(crumbs()).toEqual(["World", "Name A", "Name A1"]));

    fireEvent.click(within(container).getByRole("button", { name: "Name A" }));
    await waitFor(() => expect(crumbs()).toEqual(["World", "Name A"]));
    fireEvent.click(within(container).getByRole("button", { name: "World" }));
    await waitFor(() => expect(ids()).toEqual(["A", "B", "C"]));
    expect(crumbs()).toEqual(["World"]);
  });

  it("«←» sube un nivel", async () => {
    const { path, ids, container } = mount();
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    fireEvent.click(within(container).getByRole("button", { name: "Up one level" }));

    await waitFor(() => expect(ids()).toEqual(["A", "B", "C"]));
  });

  it("el `getLabel` del consumidor manda sobre el nombre de la región", async () => {
    const Harness = () => {
      const drill = useDrillDown<Row>({ levels, getLabel: ({ id }) => `#${id}` });
      return (
        <Choropleth.Root {...({ ...baseProps, drill } as RootProps<Row>)}>
          <Choropleth.Svg />
          <Choropleth.Breadcrumb />
        </Choropleth.Root>
      );
    };
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector('[data-region-id="A"]') as Element);

    await waitFor(() =>
      expect(container.querySelector(".cm-breadcrumb__current")?.textContent).toBe("#A"),
    );
  });

  it("los textos salen de `labels` (i18n)", () => {
    const { container } = mount({ labels: es });

    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Ruta de navegación");
    expect(container.querySelector(".cm-breadcrumb__item")?.textContent).toBe("Todo");
  });

  it("render prop: el aspecto es tuyo y recibe items, drillTo y drillUp", async () => {
    const { path, container, ids } = (() => {
      const utils = render(
        <Choropleth.Root {...({ ...baseProps, drill: levels } as RootProps<Row>)}>
          <Choropleth.Svg />
          <Choropleth.Breadcrumb>
            {({ items, drillUp, canDrillUp }) => (
              <div data-testid="custom">
                {items.map((i) => `${i.depth}:${i.label}${i.current ? "*" : ""}`).join(" | ")}
                <button disabled={!canDrillUp} onClick={() => drillUp()}>
                  back
                </button>
              </div>
            )}
          </Choropleth.Breadcrumb>
        </Choropleth.Root>,
      );
      return {
        ...utils,
        path: (id: string) => utils.container.querySelector(`[data-region-id="${id}"]`) as Element,
        ids: () =>
          Array.from(utils.container.querySelectorAll(".cm-regions [data-region-id]")).map((e) =>
            e.getAttribute("data-region-id"),
          ),
      };
    })();
    expect(screen.getByTestId("custom").textContent).toBe("0:All*back");
    expect(container.querySelector("nav")).toBeNull();
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(screen.getByTestId("custom").textContent).toBe("0:All | 1:Name A*back");
    fireEvent.click(screen.getByText("back"));
    await waitFor(() => expect(ids()).toEqual(["A", "B", "C"]));
  });

  it("sin `drill` no pinta nada", () => {
    const { container } = render(
      <Choropleth.Root
        {...({ ...baseProps, geography: world, data: rows.slice(0, 3) } as RootProps<Row>)}
      >
        <Choropleth.Svg />
        <Choropleth.Breadcrumb />
      </Choropleth.Root>,
    );

    expect(container.querySelector("nav")).toBeNull();
  });

  it("`position` lo coloca sobre el mapa; sin ella no se posiciona", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...baseProps, drill: levels } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Breadcrumb position="top-right" />
      </Choropleth.Root>,
    );
    const nav = container.querySelector("nav") as HTMLElement;

    expect(nav.style.position).toBe("absolute");
    expect(nav.style.top).toBe("12px");
    expect(nav.style.right).toBe("12px");
  });
});

describe("el preset", () => {
  const preset = (props: Record<string, unknown> = {}) =>
    render(
      <ChoroplethMap<Row>
        getId={baseProps.getId}
        getValue={baseProps.getValue}
        variant="sequential"
        width={200}
        height={100}
        data={select}
        drill={levels}
        {...(props as object)}
      />,
    );

  it("con `drill` incluye las migas arriba a la izquierda", () => {
    const { container } = preset();
    const nav = container.querySelector("nav.cm-breadcrumb") as HTMLElement;

    expect(nav).not.toBeNull();
    expect(nav.style.top).toBe("12px");
    expect(nav.style.left).toBe("12px");
  });

  it("`breadcrumb={false}` las oculta; `{ position }` las mueve", () => {
    expect(preset({ breadcrumb: false }).container.querySelector("nav")).toBeNull();
    const moved = preset({ breadcrumb: { position: "bottom-right" } }).container;

    expect((moved.querySelector("nav") as HTMLElement).style.bottom).toBe("12px");
  });

  it("sin `drill` no hay migas", () => {
    const { container } = render(
      <ChoroplethMap<Row>
        getId={baseProps.getId}
        getValue={baseProps.getValue}
        variant="sequential"
        width={200}
        height={100}
        geography={world}
        data={rows.slice(0, 3)}
      />,
    );

    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("teclado del drill", () => {
  const down = async (utils: ReturnType<typeof mount>) => {
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]));
  };

  it("Escape sube un nivel", async () => {
    const utils = mount();
    await down(utils);
    fireEvent.keyDown(utils.svg(), { key: "Escape" });

    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]));
  });

  it("Retroceso también sube (y no deja que el navegador vuelva atrás)", async () => {
    const utils = mount();
    await down(utils);
    const notPrevented = fireEvent.keyDown(utils.svg(), { key: "Backspace" });

    expect(notPrevented).toBe(false); // preventDefault
    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]));
  });

  it("en la raíz no hace nada y NO cancela la tecla (Escape sigue siendo de la página)", () => {
    const utils = mount();
    const notPrevented = fireEvent.keyDown(utils.svg(), { key: "Escape" });

    expect(notPrevented).toBe(true);
    expect(utils.ids()).toEqual(["A", "B", "C"]);
  });

  it("con Ctrl, ⌘ o Alt no se interpreta", async () => {
    const utils = mount();
    await down(utils);
    fireEvent.keyDown(utils.svg(), { key: "Escape", ctrlKey: true });
    fireEvent.keyDown(utils.svg(), { key: "Backspace", metaKey: true });
    fireEvent.keyDown(utils.svg(), { key: "Escape", altKey: true });
    await act(async () => {});

    expect(utils.ids()).toEqual(["A1", "A2"]);
  });

  it("funciona aunque el teclado de zoom esté desactivado, y con `zoom={false}`", async () => {
    for (const zoom of [{ keyboard: false }, false] as const) {
      const utils = mount({ zoom });
      expect(utils.svg().getAttribute("tabindex")).toBe("0"); // enfocable para recibir la tecla
      await down(utils);
      fireEvent.keyDown(utils.svg(), { key: "Escape" });
      await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]));
      utils.unmount();
    }
  });

  it("no rompe el teclado de zoom: `+` sigue acercando con `drill`", () => {
    const utils = mount({ zoom: { max: 6 } });
    const viewport = utils.container.querySelector(".cm-viewport") as SVGGElement;
    const before = viewport.getAttribute("transform");
    fireEvent.keyDown(utils.svg(), { key: "+" });

    expect(before).toBe("translate(0,0) scale(1)");
    expect(viewport.getAttribute("transform")).not.toBe(before);
  });

  it("sin `drill` y con el teclado de zoom desactivado, el <svg> no es enfocable (no añade un tab stop vacío)", () => {
    const { container } = render(
      <Choropleth.Root
        {...({
          ...baseProps,
          geography: world,
          data: rows.slice(0, 3),
          zoom: { keyboard: false },
        } as RootProps<Row>)}
      >
        <Choropleth.Svg />
      </Choropleth.Root>,
    );

    expect(container.querySelector("svg")?.hasAttribute("tabindex")).toBe(false);
  });
});

describe("pista del tooltip", () => {
  const hover = (utils: ReturnType<typeof mount>, id: string) => {
    fireEvent.pointerOver(utils.path(id));
    fireEvent.pointerMove(utils.path(id), { clientX: 5, clientY: 5 });
  };

  it("una región navegable promete «Click to see regions»", () => {
    const utils = mount();
    hover(utils, "A");

    expect(screen.getByRole("tooltip").textContent).toContain("Click to see regions");
  });

  it("una que no se puede perforar (último nivel, o `canDrill: false`) no lo promete", async () => {
    const closed = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id !== "B" },
      { ...regionLevel },
    ]);
    const utils = mount({ drill: closed });
    hover(utils, "B");
    expect(screen.getByRole("tooltip").textContent).not.toContain("Click to see regions");

    hover(utils, "A");
    expect(screen.getByRole("tooltip").textContent).toContain("Click to see regions");
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]));
    hover(utils, "A1");

    expect(screen.getByRole("tooltip").textContent).not.toContain("Click to see regions");
  });

  it("el texto sale de `labels.drillHint`", () => {
    const utils = mount({ labels: es });
    hover(utils, "A");

    expect(screen.getByRole("tooltip").textContent).toContain("Clic para ver regiones");
  });

  it("con tu propio contenido (render prop) no se añade nada: recibes `drillable` y decides", () => {
    const utils = render(
      <Choropleth.Root {...({ ...baseProps, drill: levels } as RootProps<Row>)}>
        <Choropleth.Svg />
        <Choropleth.Tooltip<Row>>
          {(ctx) => <span>{ctx.drillable ? "yes" : "no"}</span>}
        </Choropleth.Tooltip>
      </Choropleth.Root>,
    );
    const region = utils.container.querySelector('[data-region-id="A"]') as Element;
    fireEvent.pointerOver(region);
    fireEvent.pointerMove(region, { clientX: 5, clientY: 5 });

    expect(screen.getByRole("tooltip").textContent).toBe("yes");
  });
});
