import { fireEvent, render } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { useDefId } from "./choropleth-context";
import type { RootProps } from "./components/root";

// Paso 36: leyenda `bar` e interactiva, y `Defs` / `Patterns` con ids por instancia. jsdom no ve el CSS: aquí se
// prueba lo que la librería ESCRIBE (atributos, ids, `<pattern>`); que el resaltado se vea, en un navegador.

type Row = { code: string; v: number | null; cat?: string };
const data: Row[] = [
  { code: "A", v: 1, cat: "x" },
  { code: "B", v: 9, cat: "y" },
];
const baseProps = {
  geography: twoSquares,
  data,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  classification: { method: "quantile", classes: 2 },
  width: 200,
  height: 100,
} as const;

const preset = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);
const rootOf = (c: HTMLElement) => c.querySelector(".cm-root") as HTMLElement;
const region = (c: HTMLElement, id: string) =>
  c.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;

describe("leyenda interactiva", () => {
  it("cada región lleva `data-class` (índice de clase) y las sin valor, `empty`", () => {
    const { container } = preset({
      data: [
        { code: "A", v: 1 },
        { code: "B", v: 9 },
      ],
    });
    const classes = ["A", "B"].map((id) => region(container, id).getAttribute("data-class"));
    expect(classes).toEqual(["0", "1"]);

    const sparse = preset({ data: [{ code: "A", v: 1 }] });
    expect(region(sparse.container, "B").getAttribute("data-class")).toBe("empty");
  });

  it("pasar el ratón por una clase escribe `data-highlight-class` en el root; salir lo quita", () => {
    const { container } = preset();
    const items = container.querySelectorAll(".cm-legend__item");
    expect(items[0]?.getAttribute("data-class")).toBe("0");

    fireEvent.pointerEnter(items[1] as Element);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("1");
    fireEvent.pointerLeave(items[1] as Element);
    expect(rootOf(container).hasAttribute("data-highlight-class")).toBe(false);
  });

  it("el item de «sin dato» se resalta como `empty`", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }] });
    const empty = container.querySelector('.cm-legend__item[data-class="empty"]') as Element;
    expect(empty).not.toBeNull();
    fireEvent.pointerEnter(empty);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("empty");
  });

  it("el índice del item coincide con el `data-class` de las regiones de su color", () => {
    const { container } = preset();
    const items = [...container.querySelectorAll(".cm-legend__item")];
    for (const id of ["A", "B"]) {
      const cls = region(container, id).getAttribute("data-class");
      const item = items.find((i) => i.getAttribute("data-class") === cls) as HTMLElement;
      const swatch = item.querySelector(".cm-legend__swatch") as HTMLElement;
      expect((region(container, id) as SVGElement).style.fill).toBe(swatch.style.backgroundColor);
    }
  });

  it("no re-renderiza el mapa: resaltar no vuelve a llamar a `getId`", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { container } = preset({ getId });
    const before = getId.mock.calls.length;
    const item = container.querySelector(".cm-legend__item") as Element;
    fireEvent.pointerEnter(item);
    fireEvent.pointerLeave(item);
    expect(getId.mock.calls.length).toBe(before);
  });

  it("`interactive: false` no pone atributos ni manejadores", () => {
    const { container } = preset({ legend: { interactive: false } });
    expect(container.querySelector(".cm-legend [data-class]")).toBeNull();
  });

  it("con escala continua o `bubble` no hay nada que resaltar", () => {
    const linear = preset({ classification: { method: "linear" } });
    expect(linear.container.querySelector(".cm-legend [data-class]")).toBeNull();
    linear.unmount();
    // `bubble` con segunda métrica: la leyenda TIENE clases, pero el color va en las burbujas, no en las regiones.
    const bubble = preset({
      variant: "bubble",
      getColorValue: (r: Row) => (r.v === null ? null : r.v - 5),
    } as Partial<ChoroplethMapProps<Row>>);
    expect(bubble.container.querySelectorAll(".cm-legend__item").length).toBeGreaterThan(0);
    expect(bubble.container.querySelector(".cm-legend [data-class]")).toBeNull();
  });

  it("al desmontar la leyenda se suelta el resaltado", () => {
    const { container, rerender } = preset();
    fireEvent.pointerEnter(container.querySelector(".cm-legend__item") as Element);
    expect(rootOf(container).hasAttribute("data-highlight-class")).toBe(true);
    const root = rootOf(container);
    rerender(
      <ChoroplethMap<Row> {...({ ...baseProps, legend: false } as ChoroplethMapProps<Row>)} />,
    );
    expect(root.hasAttribute("data-highlight-class")).toBe(false);
  });

  it("las categorías también se resaltan", () => {
    const { container } = preset({
      variant: "categorical",
      getCategory: (r: Row) => r.cat ?? null,
    } as Partial<ChoroplethMapProps<Row>>);
    const item = container.querySelector(".cm-legend__item") as Element;
    fireEvent.pointerEnter(item);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("0");
  });
});

describe("leyenda `bar`", () => {
  const bar = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
    preset({ legend: { variant: "bar" }, formatValue: (v: number) => `${v}u`, ...props });

  it("un tramo por clase, con su color, y los cortes debajo (inicio de cada clase y final de la última)", () => {
    const { container } = bar();
    const segments = [...container.querySelectorAll(".cm-legend__segment")] as HTMLElement[];
    const ticks = [...container.querySelectorAll(".cm-legend__tick")].map((t) => t.textContent);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.style.backgroundColor).not.toBe(segments[1]?.style.backgroundColor);
    expect(ticks).toHaveLength(3);
    expect(ticks[0]).toBe("1u");
    expect(ticks.at(-1)).toBe("9u");
    expect(container.querySelector(".cm-legend__items")).toBeNull();
  });

  it("los tramos se resaltan igual que las filas", () => {
    const { container } = bar();
    const segment = container.querySelectorAll(".cm-legend__segment")[1] as Element;
    expect(segment.getAttribute("data-class")).toBe("1");
    fireEvent.pointerEnter(segment);
    expect(rootOf(container).getAttribute("data-highlight-class")).toBe("1");
  });

  it("«sin dato» va aparte, tras la barra, y cuenta si pides `showCount`", () => {
    const { container } = bar({
      data: [{ code: "A", v: 1 }],
      legend: { variant: "bar", showCount: true },
    });
    const empty = container.querySelector(".cm-legend__item") as HTMLElement;
    expect(empty.textContent).toContain("No data");
    expect(empty.textContent).toContain("(1)");
    expect(empty.getAttribute("data-class")).toBe("empty");
  });

  it("el tramo informa de su rango y su conteo (`title`)", () => {
    const { container } = bar();
    expect(container.querySelector(".cm-legend__segment")?.getAttribute("title")).toMatch(/\(1\)$/);
  });

  it("con categorías, `bar` no tiene cortes que poner: se dibuja como filas", () => {
    const { container } = bar({
      variant: "categorical",
      getCategory: (r: Row) => r.cat ?? null,
    } as Partial<ChoroplethMapProps<Row>>);
    expect(container.querySelector(".cm-legend__bar")).toBeNull();
    expect(container.querySelector(".cm-legend__items")).not.toBeNull();
  });

  it("con escala continua sigue siendo el degradado", () => {
    const { container } = bar({ classification: { method: "linear" } });
    expect(container.querySelector(".cm-legend__bar")).toBeNull();
    expect(container.querySelector("[data-legend-gradient]")).not.toBeNull();
  });

  it("por defecto es la lista de siempre", () => {
    const { container } = preset();
    expect(container.querySelector(".cm-legend__bar")).toBeNull();
    expect(container.querySelectorAll(".cm-legend__item").length).toBeGreaterThan(1);
  });

  it("`classNames.legendItem` llega a los tramos", () => {
    const { container } = bar({ classNames: { legendItem: "mine" } });
    expect(container.querySelector(".cm-legend__segment")?.classList.contains("mine")).toBe(true);
  });
});

describe("Defs y Patterns", () => {
  const patternPaths = (c: HTMLElement) => [...c.querySelectorAll(".cm-patterns path")];
  const idOfUrl = (fill: string | null) => /url\(#(.+)\)/.exec(fill ?? "")?.[1];

  it("`getRegionStyle().pattern` dibuja la trama ENCIMA del color, que se conserva", () => {
    const { container } = preset({
      getRegionStyle: (r) => (r.id === "B" ? { pattern: "hatch" } : undefined),
    });
    const marks = patternPaths(container);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("d")).toBe(region(container, "B").getAttribute("d"));
    // El color de la escala sigue ahí, debajo.
    expect((region(container, "B") as SVGElement).style.fill).not.toBe("");
    // La trama apunta a un `<pattern>` que existe.
    const id = idOfUrl(marks[0]?.getAttribute("fill") ?? null) as string;
    expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull();
  });

  it("incluye `hatch` y `dots`, y `dots` también se dibuja", () => {
    const { container } = preset({ getRegionStyle: () => ({ pattern: "dots" }) });
    const id = idOfUrl(patternPaths(container)[0]?.getAttribute("fill") ?? null) as string;
    expect(id.endsWith("-dots")).toBe(true);
    expect(container.querySelector(`pattern[id="${id}"] circle`)).not.toBeNull();
  });

  it("las tramas no capturan el ratón ni se anuncian", () => {
    const { container } = preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    const layer = container.querySelector(".cm-patterns") as Element;
    expect(layer.getAttribute("pointer-events")).toBe("none");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
  });

  it("`emptyPattern` rellena solo las regiones sin dato", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }], emptyPattern: "hatch" });
    const marks = patternPaths(container);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("d")).toBe(region(container, "B").getAttribute("d"));
  });

  it("el tema `contrast` rayará «sin dato»; `emptyPattern` manda sobre el tema", () => {
    const withTheme = preset({ data: [{ code: "A", v: 1 }], theme: "contrast" });
    expect(patternPaths(withTheme.container)).toHaveLength(1);
    withTheme.unmount();

    const none = preset({ data: [{ code: "A", v: 1 }], theme: "contrast", emptyPattern: "none" });
    expect(patternPaths(none.container)).toHaveLength(0);
    none.unmount();

    const light = preset({ data: [{ code: "A", v: 1 }], theme: "light" });
    expect(patternPaths(light.container)).toHaveLength(0);
  });

  it("el swatch de «sin dato» de la leyenda lleva la misma trama", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }], emptyPattern: "dots" });
    const swatch = container.querySelector(
      '.cm-legend__item[data-class="empty"] .cm-legend__swatch',
    );
    expect(swatch?.getAttribute("data-pattern")).toBe("dots");
  });

  it("DOS mapas en la página no comparten ids: cada uno referencia SUS definiciones", () => {
    const { container } = render(
      <>
        <ChoroplethMap<Row>
          {...({
            ...baseProps,
            getRegionStyle: () => ({ pattern: "hatch" }),
          } as ChoroplethMapProps<Row>)}
        />
        <ChoroplethMap<Row>
          {...({
            ...baseProps,
            getRegionStyle: () => ({ pattern: "hatch" }),
          } as ChoroplethMapProps<Row>)}
        />
      </>,
    );
    const roots = [...container.querySelectorAll(".cm-root")] as HTMLElement[];
    const defined = roots.map((root) =>
      [...root.querySelectorAll("pattern")].map((p) => p.getAttribute("id")),
    );
    const used = roots.map((root) =>
      patternPaths(root).map((m) => idOfUrl(m.getAttribute("fill"))),
    );

    expect(new Set([...defined[0]!, ...defined[1]!]).size).toBe(4); // 2 tramas × 2 mapas, todas distintas
    for (let i = 0; i < 2; i++) {
      for (const id of used[i]!) expect(defined[i]).toContain(id);
    }
    expect(used[0]?.[0]).not.toBe(used[1]?.[0]);
    // Y ningún id del documento está repetido.
    const all = [...container.querySelectorAll("[id]")].map((e) => e.getAttribute("id"));
    expect(new Set(all).size).toBe(all.length);
  });

  it("una trama tuya: se define en `<Choropleth.Defs>` con `useDefId` y se pide por su nombre", () => {
    const Stripes = () => (
      <pattern id={useDefId("stripes")} width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="2" height="4" fill="red" />
      </pattern>
    );
    const { container } = render(
      <Choropleth.Root
        {...({
          ...baseProps,
          getRegionStyle: (r: { id: string }) =>
            r.id === "A" ? { pattern: "stripes" } : undefined,
        } as unknown as RootProps<Row>)}
      >
        <Choropleth.Svg>
          <Choropleth.Defs>
            <Stripes />
          </Choropleth.Defs>
          <Choropleth.Viewport>
            <Choropleth.Regions />
            <Choropleth.Patterns />
          </Choropleth.Viewport>
        </Choropleth.Svg>
      </Choropleth.Root>,
    );
    const id = idOfUrl(patternPaths(container)[0]?.getAttribute("fill") ?? null) as string;
    expect(id.endsWith("-stripes")).toBe(true);
    expect(container.querySelector(`pattern[id="${id}"] rect`)).not.toBeNull();
  });

  it("los ids son válidos en `url(#…)` (sin los `:` de `useId`)", () => {
    const { container } = preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    expect(idOfUrl(patternPaths(container)[0]?.getAttribute("fill") ?? null)).toMatch(/^[\w-]+$/);
  });

  it("sin patrones no se pinta la capa", () => {
    const { container } = preset();
    expect(container.querySelector(".cm-patterns")).toBeNull();
  });

  it("`getRegionStyle().pattern` ya no avisa de que se ignora", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("pattern"))).toEqual(
      [],
    );
    warn.mockRestore();
  });
});
