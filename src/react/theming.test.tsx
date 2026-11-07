import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import { useState } from "react";
import { twoSquares } from "../../tests/fixtures";
import { THEMES, defineTheme, extendTheme, themeToCssVars, type DrillContext } from "../core";
import { CLASS_SLOTS, type ChoroplethClassNames } from "./class-names";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { defineDrillLevels } from "./drill-levels";
import type { Region } from "./use-choropleth";

// Paso 35: theming mínimo. `theme`, `classNames`, `getRegionStyle` y el contrato `data-*`. jsdom no resuelve
// `styles.css`: aquí se prueba lo que la LIBRERÍA escribe (variables en línea, clases, atributos); que las
// reglas CSS se apliquen se comprueba en un navegador (ver el diario).

type Row = { code: string; v: number | null; estimated?: boolean };
const data: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9, estimated: true },
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

const rootOf = (container: HTMLElement) => container.querySelector(".cm-root") as HTMLElement;
const preset = (props: Partial<ChoroplethMapProps<Row>> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);

describe("theme", () => {
  it("un nombre escribe sus variables EN LÍNEA en `.cm-root` y marca `data-theme`", () => {
    const { container } = preset({ theme: "dark" });
    const root = rootOf(container);

    expect(root.getAttribute("data-theme")).toBe("dark");
    for (const [name, value] of Object.entries(themeToCssVars(THEMES.dark))) {
      expect(root.style.getPropertyValue(name), `variable ${name}`).toBe(value);
    }
  });

  it("un objeto escribe solo lo que define y se marca `custom`", () => {
    const mine = defineTheme({ border: { color: "#ff0000", width: 2 } });
    const { container } = preset({ theme: mine });
    const root = rootOf(container);

    expect(root.getAttribute("data-theme")).toBe("custom");
    expect(root.style.getPropertyValue("--cm-border-color")).toBe("#ff0000");
    expect(root.style.getPropertyValue("--cm-border-width")).toBe("2px");
    expect(root.style.getPropertyValue("--cm-empty-fill")).toBe(""); // lo demás sigue siendo del CSS
  });

  it("sin `theme` no se escribe ninguna variable ni `data-theme` (el CSS manda)", () => {
    const { container } = preset();
    const root = rootOf(container);

    expect(root.hasAttribute("data-theme")).toBe(false);
    // (`--cm-k` y compañeras son internas de la cámara y siempre están.)
    for (const name of Object.keys(themeToCssVars(THEMES.light))) {
      expect(root.style.getPropertyValue(name), `variable ${name}`).toBe("");
    }
  });

  it("un tema extendido conserva lo de la base y aplica los ajustes", () => {
    const { container } = preset({
      theme: extendTheme("dark", { border: { color: "#00ff00" } }),
    });
    const root = rootOf(container);

    expect(root.style.getPropertyValue("--cm-border-color")).toBe("#00ff00");
    expect(root.style.getPropertyValue("--cm-border-width")).toBe("0.5px"); // de `dark`
    expect(root.style.getPropertyValue("--cm-background")).toBe(THEMES.dark.background);
  });

  it("`style` del consumidor gana al tema (es la vía para tocar una variable a mano)", () => {
    const { container } = preset({
      theme: "dark",
      style: { "--cm-border-color": "#123456" } as React.CSSProperties,
    });

    expect(rootOf(container).style.getPropertyValue("--cm-border-color")).toBe("#123456");
    expect(rootOf(container).style.getPropertyValue("--cm-empty-fill")).toBe(
      THEMES.dark.empty?.fill,
    );
  });

  it("cambiar de tema en caliente cambia las variables", () => {
    const Harness = () => {
      const [theme, setTheme] = useState<"light" | "dark">("light");
      return (
        <>
          <button onClick={() => setTheme("dark")}>dark</button>
          <ChoroplethMap<Row> {...(baseProps as ChoroplethMapProps<Row>)} theme={theme} />
        </>
      );
    };
    const { container, getByText } = render(<Harness />);
    expect(rootOf(container).style.getPropertyValue("--cm-empty-fill")).toBe("#d4d4d4");
    fireEvent.click(getByText("dark"));
    expect(rootOf(container).style.getPropertyValue("--cm-empty-fill")).toBe("#475569");
    expect(rootOf(container).getAttribute("data-theme")).toBe("dark");
  });

  it("con `unstyled` el tema sigue escribiendo sus variables", () => {
    const { container } = preset({ theme: "contrast", unstyled: true });
    expect(rootOf(container).hasAttribute("data-unstyled")).toBe(true);
    expect(rootOf(container).style.getPropertyValue("--cm-border-width")).toBe("1px");
  });

  it("funciona también en el compound (`Choropleth.Root`)", () => {
    const { container } = render(
      <Choropleth.Root {...({ ...baseProps, theme: "minimal" } as RootProps<Row>)}>
        <Choropleth.Svg />
      </Choropleth.Root>,
    );
    expect(rootOf(container).getAttribute("data-theme")).toBe("minimal");
  });
});

describe("classNames", () => {
  const square = (id: string, west: number, size: number): Feature => ({
    type: "Feature",
    id,
    properties: { name: `Name ${id}` },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, 0],
          [west, size],
          [west + size, size],
          [west + size, 0],
          [west, 0],
        ],
      ],
    },
  });
  const collection = (...f: Feature[]): FeatureCollection => ({
    type: "FeatureCollection",
    features: f,
  });
  const world = collection(square("A", 0, 4), square("B", 6, 4));
  const children: Record<string, FeatureCollection> = {
    A: collection(square("A1", 0, 2), square("A2", 2, 2)),
  };
  const levels = defineDrillLevels<Row>([
    { id: "country", geography: world },
    {
      id: "region",
      geography: ({ parentId }: DrillContext) => Promise.resolve(children[parentId ?? ""] as never),
    },
  ]);

  const names: Required<ChoroplethClassNames> = Object.fromEntries(
    CLASS_SLOTS.map((slot) => [slot, `mine-${slot}`]),
  ) as Required<ChoroplethClassNames>;

  const has = (container: HTMLElement, selector: string, cls: string) =>
    container.querySelector(selector)?.classList.contains(cls) === true;

  it("cada pieza lleva SU clase junto a la `cm-*` (nunca la sustituye)", async () => {
    const { container } = render(
      <ChoroplethMap<Row>
        {...({
          ...baseProps,
          geography: undefined,
          drill: levels,
          data: (ctx: DrillContext) =>
            ctx.depth === 0
              ? data
              : [
                  { code: "A1", v: 1 },
                  { code: "A2", v: 2 },
                ],
          zoom: { controls: true },
        } as unknown as ChoroplethMapProps<Row>)}
        classNames={names}
      />,
    );
    const pairs: [string, ClassNameSlot][] = [
      [".cm-root", "root"],
      [".cm-svg", "svg"],
      [".cm-regions", "regions"],
      [".cm-region", "region"],
      [".cm-selection", "selection"],
      [".cm-legend", "legend"],
      [".cm-legend__item", "legendItem"],
      [".cm-zoom-controls", "controls"],
      [".cm-zoom-button", "controlButton"],
      [".cm-gesture-hint", "gestureHint"],
      [".cm-breadcrumb", "breadcrumb"],
      [".cm-breadcrumb__item", "breadcrumbItem"],
    ];
    for (const [selector, slot] of pairs) {
      expect(has(container, selector, `mine-${slot}`), `${slot} en ${selector}`).toBe(true);
    }

    // La capa de contexto aparece al bajar.
    vi.stubGlobal(
      "matchMedia",
      (q: string) =>
        ({ matches: q.includes("prefers-reduced-motion"), media: q }) as MediaQueryList,
    );
    fireEvent.click(container.querySelector('.cm-regions [data-region-id="A"]') as Element);
    await waitFor(() =>
      expect(container.querySelector('.cm-regions [data-region-id="A1"]')).not.toBeNull(),
    );
    expect(has(container, ".cm-layer", "mine-layer")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("fronteras, burbujas y tooltip", () => {
    const { container } = render(
      <ChoroplethMap<Row>
        {...({
          ...baseProps,
          variant: "bubble",
          getValue: (r: Row) => r.v,
        } as unknown as ChoroplethMapProps<Row>)}
        classNames={names}
      />,
    );
    expect(has(container, ".cm-borders", "mine-borders")).toBe(true);
    expect(has(container, ".cm-bubbles", "mine-bubbles")).toBe(true);
    expect(has(container, ".cm-bubble", "mine-bubble")).toBe(true);

    fireEvent.pointerMove(rootOf(container), { clientX: 10, clientY: 10 }); // el tooltip necesita posición
    fireEvent.pointerOver(container.querySelector(".cm-regions [data-region-id='A']") as Element);
    expect(has(container, ".cm-tooltip", "mine-tooltip")).toBe(true);
  });

  it("se suma a `className` de la pieza, no lo pisa", () => {
    const { container } = render(
      <Choropleth.Root
        {...({ ...baseProps } as RootProps<Row>)}
        className="extra"
        classNames={{ root: "from-slot" }}
      >
        <Choropleth.Svg className="svg-extra" />
        <Choropleth.Legend className="legend-extra" />
      </Choropleth.Root>,
    );
    expect(rootOf(container).className).toBe("cm-root from-slot extra");
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("cm-svg svg-extra");
    expect(container.querySelector(".cm-legend")?.className).toBe("cm-legend legend-extra");
  });

  it("sin `classNames` no se añade ninguna clase suelta (ni «undefined»)", () => {
    const { container } = preset();
    expect(rootOf(container).className).toBe("cm-root");
    expect(container.querySelector(".cm-region")?.getAttribute("class")).toBe("cm-region");
    expect(container.innerHTML).not.toContain("undefined");
  });

  it("las clases de las regiones no rompen el `memo`: no re-renderizan al pasar el ratón", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { container } = preset({ getId, classNames: { region: "r" } });
    const before = getId.mock.calls.length;
    fireEvent.pointerOver(container.querySelector(".cm-regions [data-region-id='A']") as Element);
    fireEvent.pointerOver(container.querySelector(".cm-regions [data-region-id='B']") as Element);
    expect(getId.mock.calls.length).toBe(before);
  });
});
type ClassNameSlot = (typeof CLASS_SLOTS)[number];

describe("getRegionStyle", () => {
  const path = (c: HTMLElement, id: string) =>
    c.querySelector(`.cm-regions [data-region-id="${id}"]`) as SVGElement;

  it("sustituye el color, la opacidad y suma una clase; el resto no se toca", () => {
    const { container } = preset({
      getRegionStyle: (r) =>
        r.datum?.estimated === true
          ? { fill: "#ff00ff", opacity: 0.5, className: "estimated" }
          : undefined,
    });
    const b = path(container, "B");
    const a = path(container, "A");

    expect(b.style.fill).toBe("#ff00ff");
    expect(b.style.opacity).toBe("0.5");
    expect(b.classList.contains("estimated")).toBe(true);
    expect(a.style.fill).not.toBe("#ff00ff");
    expect(a.style.opacity).toBe("");
    expect(a.getAttribute("class")).toBe("cm-region");
  });

  it("prioridad: getRegionStyle > color de la escala > emptyFill", () => {
    const { container } = preset({
      data: [{ code: "A", v: 1 }],
      emptyFill: "#111111",
      getRegionStyle: (r) => (r.id === "B" ? { fill: "#222222" } : undefined),
    });
    // B no tiene dato (emptyFill) pero getRegionStyle gana.
    expect(path(container, "B").style.fill).toBe("#222222");
    expect(path(container, "A").style.fill).not.toBe("#111111");
  });

  it("recibe la región ya construida (dato, valor, color de la escala)", () => {
    const seen: Region<Row>[] = [];
    preset({
      getRegionStyle: (r) => {
        seen.push(r);
        return undefined;
      },
    });
    const b = seen.find((r) => r.id === "B");
    expect(b?.datum?.estimated).toBe(true);
    expect(b?.value).toBe(9);
    expect(b?.fill).not.toBe("");
    expect(b?.opacity).toBeUndefined();
  });

  it("la copia de hover/selección y el tooltip usan el color propio", () => {
    const { container } = preset({
      selectedId: "B",
      getRegionStyle: (r) => (r.id === "B" ? { fill: "#ff00ff" } : undefined),
    });
    const selected = container.querySelector(".cm-selection [data-selection='selected']");
    expect((selected as SVGElement).style.fill).toBe("#ff00ff");
  });

  it("`pattern` está reservado: se ignora y avisa UNA vez (inglés, fuera de producción)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = preset({ getRegionStyle: () => ({ pattern: "hatch" }) });
    rerender(
      <ChoroplethMap<Row>
        {...({
          ...baseProps,
          getRegionStyle: () => ({ pattern: "hatch" }),
        } as ChoroplethMapProps<Row>)}
      />,
    );
    const messages = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("pattern"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("[choropleth] getRegionStyle");
    warn.mockRestore();
  });

  it("no cambiar nada (devolver undefined) no cambia el DOM", () => {
    const plain = preset();
    const withFn = preset({ getRegionStyle: () => undefined });
    expect(path(withFn.container, "A").outerHTML).toBe(path(plain.container, "A").outerHTML);
  });
});

describe("contrato data-*", () => {
  it("las regiones sin dato llevan `data-empty`; las que tienen dato, no", () => {
    const { container } = preset({ data: [{ code: "A", v: 1 }] });
    expect(container.querySelector("[data-region-id='A']")?.hasAttribute("data-empty")).toBe(false);
    expect(container.querySelector("[data-region-id='B']")?.hasAttribute("data-empty")).toBe(true);
  });

  it("un dato con valor nulo también es «vacío»: se pinta con `emptyFill`, así que se puede estilar igual", () => {
    const { container } = preset({
      data: [
        { code: "A", v: null },
        { code: "B", v: 3 },
      ],
    });
    expect(container.querySelector("[data-region-id='A']")?.hasAttribute("data-empty")).toBe(true);
    expect(container.querySelector("[data-region-id='B']")?.hasAttribute("data-empty")).toBe(false);
  });

  it("`data-empty` no depende de getRegionStyle (es del dato, no del color)", () => {
    const { container } = preset({
      data: [{ code: "A", v: 1 }],
      getRegionStyle: () => ({ fill: "#ff0000" }),
    });
    expect(container.querySelector("[data-region-id='B']")?.hasAttribute("data-empty")).toBe(true);
  });

  it("el root publica el estado como atributos (status, dim, theme)", () => {
    const { container } = preset({ theme: "light" });
    const root = rootOf(container);
    expect(root.getAttribute("data-status")).toBe("ready");
    expect(root.getAttribute("data-dim")).toBe("selection");
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("tras seleccionar, el root lleva `data-has-selection`", () => {
    const { container } = preset({ selectedId: "A" });
    expect(rootOf(container).hasAttribute("data-has-selection")).toBe(true);
  });
});

// `act` se importa por si un test futuro lo necesita; evita un import sin uso si se borra el último uso.
void act;
