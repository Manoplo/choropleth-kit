import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import { es, type DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import { ChoroplethMap } from "./choropleth-map";
import type { RootProps } from "./components/root";
import { defineDrillLevels } from "./drill-levels";
import { useDrillDown } from "./use-drill-down";

// Step 33: breadcrumb, drill keyboard (Escape / Backspace) and tooltip hint. Simulated "reduce motion":
// the flight is a jump and the reveal lasts 0, so the tests do not wait for d3 flights.

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
// Three levels: the last one inherits the regions' geometry (stores).
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
  it("at the root: a <nav> with the root as the current page and no ← button", () => {
    const { container, crumbs } = mount();
    const nav = container.querySelector("nav.cm-breadcrumb");

    expect(nav?.getAttribute("aria-label")).toBe("Breadcrumb");
    expect(crumbs()).toEqual(["All"]); // without a `label` on the first level: `labels.breadcrumbRoot`
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe("All");
    expect(container.querySelector(".cm-breadcrumb__back")).toBeNull();
  });

  it("the root uses the first level's `label` if there is one", () => {
    const { crumbs } = mount({ drill: threeLevels });

    expect(crumbs()).toEqual(["World"]);
  });

  it("when going down, the new crumb carries the region's NAME (properties.name) and is the current one", async () => {
    const { path, ids, crumbs, container } = mount();
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(crumbs()).toEqual(["All", "Name A"]);
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe("Name A");
    expect(container.querySelector(".cm-breadcrumb__back")).not.toBeNull();
  });

  it("the crumb appears as soon as the click happens (optimistic route), not when the flight ends", () => {
    const { path, crumbs } = mount();
    fireEvent.click(path("B"));

    expect(crumbs()).toEqual(["All", "Name B"]);
  });

  it("an earlier crumb goes up to that level", async () => {
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

  it("the ← button goes up one level", async () => {
    const { path, ids, container } = mount();
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    fireEvent.click(within(container).getByRole("button", { name: "Up one level" }));

    await waitFor(() => expect(ids()).toEqual(["A", "B", "C"]));
  });

  it("the consumer's `getLabel` wins over the region's name", async () => {
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

  it("the texts come from `labels` (i18n)", () => {
    const { container } = mount({ labels: es });

    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Ruta de navegación");
    expect(container.querySelector(".cm-breadcrumb__item")?.textContent).toBe("Todo");
  });

  it("render prop: the look is yours and it receives items, drillTo and drillUp", async () => {
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

  it("without `drill` it draws nothing", () => {
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

  it("`position` places it over the map; without it, it is not positioned", () => {
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

describe("the preset", () => {
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

  it("with `drill` it includes the breadcrumbs at top left", () => {
    const { container } = preset();
    const nav = container.querySelector("nav.cm-breadcrumb") as HTMLElement;

    expect(nav).not.toBeNull();
    expect(nav.style.top).toBe("12px");
    expect(nav.style.left).toBe("12px");
  });

  it("`breadcrumb={false}` hides them; `{ position }` moves them", () => {
    expect(preset({ breadcrumb: false }).container.querySelector("nav")).toBeNull();
    const moved = preset({ breadcrumb: { position: "bottom-right" } }).container;

    expect((moved.querySelector("nav") as HTMLElement).style.bottom).toBe("12px");
  });

  it("without `drill` there are no breadcrumbs", () => {
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

describe("drill keyboard", () => {
  const down = async (utils: ReturnType<typeof mount>) => {
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]));
  };

  it("Escape goes up one level", async () => {
    const utils = mount();
    await down(utils);
    fireEvent.keyDown(utils.svg(), { key: "Escape" });

    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]));
  });

  it("Backspace also goes up (and does not let the browser go back)", async () => {
    const utils = mount();
    await down(utils);
    const notPrevented = fireEvent.keyDown(utils.svg(), { key: "Backspace" });

    expect(notPrevented).toBe(false); // preventDefault
    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]));
  });

  it("at the root it does nothing and does NOT cancel the key (Escape still belongs to the page)", () => {
    const utils = mount();
    const notPrevented = fireEvent.keyDown(utils.svg(), { key: "Escape" });

    expect(notPrevented).toBe(true);
    expect(utils.ids()).toEqual(["A", "B", "C"]);
  });

  it("with Ctrl, ⌘ or Alt it is not interpreted", async () => {
    const utils = mount();
    await down(utils);
    fireEvent.keyDown(utils.svg(), { key: "Escape", ctrlKey: true });
    fireEvent.keyDown(utils.svg(), { key: "Backspace", metaKey: true });
    fireEvent.keyDown(utils.svg(), { key: "Escape", altKey: true });
    await act(async () => {});

    expect(utils.ids()).toEqual(["A1", "A2"]);
  });

  it("works even if the zoom keyboard is disabled, and with `zoom={false}`", async () => {
    for (const zoom of [{ keyboard: false }, false] as const) {
      const utils = mount({ zoom });
      expect(utils.svg().getAttribute("tabindex")).toBe("0"); // focusable to receive the key
      await down(utils);
      fireEvent.keyDown(utils.svg(), { key: "Escape" });
      await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]));
      utils.unmount();
    }
  });

  it("does not break the zoom keyboard: `+` still zooms in with `drill`", () => {
    const utils = mount({ zoom: { max: 6 } });
    const viewport = utils.container.querySelector(".cm-viewport") as SVGGElement;
    const before = viewport.getAttribute("transform");
    fireEvent.keyDown(utils.svg(), { key: "+" });

    expect(before).toBe("translate(0,0) scale(1)");
    expect(viewport.getAttribute("transform")).not.toBe(before);
  });

  it("without `drill` and with the zoom keyboard disabled, the <svg> is not focusable (no empty tab stop is added)", () => {
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

describe("tooltip hint", () => {
  const hover = (utils: ReturnType<typeof mount>, id: string) => {
    fireEvent.pointerOver(utils.path(id));
    fireEvent.pointerMove(utils.path(id), { clientX: 5, clientY: 5 });
  };

  it("a drillable region promises Click to see regions", () => {
    const utils = mount();
    hover(utils, "A");

    expect(screen.getByRole("tooltip").textContent).toContain("Click to see regions");
  });

  it("one that cannot be drilled (last level, or `canDrill: false`) does not promise it", async () => {
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

  it("the text comes from `labels.drillHint`", () => {
    const utils = mount({ labels: es });
    hover(utils, "A");

    expect(screen.getByRole("tooltip").textContent).toContain("Clic para ver regiones");
  });

  it("with your own content (render prop) nothing is added: you receive `drillable` and decide", () => {
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
