import { act, createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import type { DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { defineDrillLevels, type DrillEvent } from "./drill-levels";
import { useDrillDown, type DrillController } from "./use-drill-down";

// Paso 32: la coreografía del drill-down (dd.md §11.2.3). A diferencia de `drill.test.tsx`, aquí hay
// vuelos REALES de cámara (350-1200 ms, temporizadores reales): se comprueba el orden de las fases, la
// atenuación, el contexto gris, que el rebase no se nota (cámara de llegada == transform de la capa de
// contexto) y los bordes (subir, lateral, interrumpir, fallar).

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

// C está lejos: hace que A y B sean pequeñas en la raíz (si no, encuadrarlas las alejaría).
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
const select = (ctx: DrillContext) => rows.filter((r) => r.parent === (ctx.parentId ?? undefined));

const levels = defineDrillLevels<Row>([
  { id: "country", geography: world },
  { id: "region", geography: ({ parentId }) => Promise.resolve(children[parentId ?? ""] as never) },
]);

const baseProps = {
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
  data: select,
} as const;

/** Un mapa cuyo controlador `useDrillDown` se puede manejar desde el test. */
const mount = (props: Partial<RootProps<Row>> = {}, drillLevels = levels) => {
  const handle: { controller: DrillController<Row> | undefined } = { controller: undefined };
  // `tick` solo sirve para volver a renderizar desde el test (p. ej. cuando llegan los datos).
  const Harness = ({ tick }: { tick: number }) => {
    const controller = useDrillDown<Row>({ levels: drillLevels });
    handle.controller = controller;
    void tick;
    return (
      <Choropleth.Root {...({ ...baseProps, drill: controller, ...props } as RootProps<Row>)}>
        <Choropleth.Svg />
      </Choropleth.Root>
    );
  };
  const utils = render(<Harness tick={0} />);
  let tick = 0;
  const rerender = () => utils.rerender(<Harness tick={++tick} />);
  const root = () => utils.container.querySelector(".cm-root") as HTMLElement;
  const phase = () => root().getAttribute("data-drill-phase");
  const ids = () =>
    Array.from(utils.container.querySelectorAll(".cm-regions [data-region-id]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
  const path = (id: string) =>
    utils.container.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;
  const viewport = () => utils.container.querySelector(".cm-viewport") as SVGGElement;
  const layers = (role: string) =>
    Array.from(utils.container.querySelectorAll(`.cm-layer[data-role="${role}"]`));
  return { ...utils, handle, root, phase, ids, path, viewport, layers, rerender };
};

const TIMEOUT = { timeout: 4000, interval: 15 };

/** `translate(x,y) scale(k)` → números. */
const parseTransform = (value: string | null) => {
  const m = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(value ?? "");
  if (m === null) throw new Error(`transform inesperado: ${value}`);
  return { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) };
};

beforeEach(() => {
  // Sin «reducir movimiento»: vuelos reales.
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("bajar: las fases", () => {
  it("vuela primero (el nivel viejo sigue ahí), luego revela, luego reposo", async () => {
    const { phase, ids, path, root, handle } = mount();
    expect(phase()).toBeNull(); // en reposo no hay atributo
    fireEvent.click(path("A"));

    await waitFor(() => expect(phase()).toBe("flying"), TIMEOUT);
    expect(ids()).toEqual(["A", "B", "C"]); // aún el nivel viejo
    expect(handle.controller?.path).toEqual(["A"]); // pero la ruta es optimista: ya cambió

    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);
    expect(ids()).toEqual(["A1", "A2"]);
    await waitFor(() => expect(phase()).toBeNull(), TIMEOUT);
    expect(root().hasAttribute("data-drill-phase")).toBe(false);
  });

  it("durante el vuelo solo la región elegida lleva `data-drill-target` (el resto se atenúa por CSS)", async () => {
    const { phase, container, path } = mount();
    fireEvent.click(path("B"));
    await waitFor(() => expect(phase()).toBe("flying"), TIMEOUT);

    const targets = Array.from(container.querySelectorAll("[data-drill-target]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
    expect(targets).toEqual(["B"]);
    await waitFor(() => expect(phase()).toBeNull(), TIMEOUT);
    expect(container.querySelector("[data-drill-target]")).toBeNull();
  });

  it("el vuelo NO muestra el nivel nuevo hasta terminar (sin salto a mitad)", async () => {
    const { phase, ids, path } = mount();
    fireEvent.click(path("A"));
    const seen = new Set<string>();
    await waitFor(() => {
      if (phase() === "flying") seen.add(ids().join(","));
      expect(phase()).toBe("revealing");
    }, TIMEOUT);

    expect([...seen]).toEqual(["A,B,C"]);
  });

  it("el nivel nuevo entra con `--cm-wave` (revelado escalonado) y se quita al terminar", async () => {
    const { phase, path, container } = mount();
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    const waves = Array.from(container.querySelectorAll<SVGElement>(".cm-regions .cm-region")).map(
      (el) => el.style.getPropertyValue("--cm-wave"),
    );
    expect(waves).toHaveLength(2);
    for (const wave of waves) {
      expect(Number(wave)).toBeGreaterThanOrEqual(0);
      expect(Number(wave)).toBeLessThanOrEqual(1);
    }
    await waitFor(() => expect(phase()).toBeNull(), TIMEOUT);
    expect(
      container
        .querySelector<SVGElement>(".cm-regions .cm-region")
        ?.style.getPropertyValue("--cm-wave"),
    ).toBe("");
  });
});

describe("el rebase no se nota", () => {
  it("la cámara con la que acaba el vuelo == el transform de la capa de contexto (mismos píxeles)", async () => {
    const { phase, viewport, layers, path } = mount();
    fireEvent.click(path("A"));

    // La última cámara vista mientras vuela (justo antes del cambio de proyección).
    let lastFlying = "";
    await waitFor(() => {
      if (phase() === "flying") lastFlying = viewport().getAttribute("transform") ?? "";
      expect(phase()).toBe("revealing");
    }, TIMEOUT);

    const before = parseTransform(lastFlying);
    const group = layers("context")[0] as SVGGElement;
    const after = parseTransform(group.getAttribute("transform"));
    // El padre se pinta ahora con la afín R en lugar de con la cámara: tienen que coincidir.
    expect(after.k).toBeCloseTo(before.k, 1);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    // Y el hijo empieza con la cámara en el encaje (k = 1).
    expect(parseTransform(viewport().getAttribute("transform"))).toEqual({ x: 0, y: 0, k: 1 });
  });
});

describe("contexto gris", () => {
  it("tras bajar, el nivel de arriba queda como capa de contexto (sus regiones, sin color de dato)", async () => {
    const { phase, layers } = mount();
    expect(layers("context")).toHaveLength(0);
    fireEvent.click(layers("context")[0] ?? document.body); // sin efecto
    const { path } = {
      path: (id: string) =>
        document.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element,
    };
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    const [context] = layers("context");
    const ids = Array.from(context?.querySelectorAll("[data-context-id]") ?? []).map((el) =>
      el.getAttribute("data-context-id"),
    );
    expect(ids).toEqual(["A", "B", "C"]);
    // La región en la que se entró está marcada (su contorno no debe verse doble bajo sus hijas).
    expect(context?.querySelector("[data-focus]")?.getAttribute("data-context-id")).toBe("A");
    // Sin color de dato: el relleno lo da el CSS (`--cm-context-fill`), no un `style` en línea.
    expect(context?.querySelector("path")?.getAttribute("style")).toBeNull();
  });

  it('`context: "none"` no deja capa de contexto', async () => {
    const none = defineDrillLevels<Row>([
      levels[0] as never,
      { ...(levels[1] as object), context: "none" } as never,
    ]);
    const { phase, layers, path } = mount({}, none);
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    expect(layers("context")).toHaveLength(0);
  });

  it('un nivel "inherit" no duplica la capa: dibuja ya las mismas regiones', async () => {
    const inherited = defineDrillLevels<Row>([
      levels[0] as never,
      { id: "store", geography: "inherit" },
    ]);
    const { phase, layers, path } = mount({}, inherited);
    fireEvent.click(path("A"));
    await waitFor(() => expect(phase()).toBe("revealing"), TIMEOUT);

    expect(layers("context")).toHaveLength(0);
  });
});

describe("subir", () => {
  const down = async (utils: ReturnType<typeof mount>, id = "A") => {
    fireEvent.click(utils.path(id));
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.ids()).toEqual([`${id}1`, `${id}2`]);
  };

  it("el nivel de arriba vuelve YA (con sus colores) y el hijo sale desvaneciéndose", async () => {
    const utils = mount();
    const fillBefore = utils.path("A").getAttribute("style");
    await down(utils);
    act(() => utils.handle.controller?.drillUp());

    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]), TIMEOUT);
    expect(utils.phase()).toBe("flying");
    expect(utils.path("A").getAttribute("style")).toBe(fillBefore); // recupera el color de dato
    const [exiting] = utils.layers("exiting");
    expect(exiting).toBeDefined();
    expect(
      Array.from(exiting?.querySelectorAll("[data-context-id]") ?? []).map((e) =>
        e.getAttribute("data-context-id"),
      ),
    ).toEqual(["A1", "A2"]);
  });

  it("la capa que sale se desvanece CON el color que tenía (no en gris)", async () => {
    const utils = mount();
    await down(utils);
    const fills = ["A1", "A2"].map((id) => utils.path(id).getAttribute("style"));
    expect(fills[0]).not.toBe(fills[1]); // dos colores distintos de verdad
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.layers("exiting")).toHaveLength(1), TIMEOUT);

    const [exiting] = utils.layers("exiting");
    const leaving = ["A1", "A2"].map((id) =>
      exiting?.querySelector(`[data-context-id="${id}"]`)?.getAttribute("style"),
    );
    expect(leaving).toEqual(fills);
  });

  it("al empezar a subir la cámara reproduce lo que se veía (R), no el encaje: sin salto", async () => {
    const utils = mount();
    await down(utils);
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);

    const start = parseTransform(utils.viewport().getAttribute("transform"));
    expect(start.k).toBeGreaterThan(2); // zoom del nivel de arriba para encuadrar A, no k = 1
  });

  it("espera a tener los DATOS del nivel de arriba: no vuela ni pinta un mapa gris mientras tanto", async () => {
    let parentReady = true;
    const utils = mount({
      data: (ctx: DrillContext) => (ctx.depth === 0 && !parentReady ? undefined : select(ctx)),
    });
    await down(utils);
    parentReady = false; // p. ej. la consulta del nivel de arriba se invalidó
    act(() => utils.handle.controller?.drillUp());
    await new Promise((resolve) => setTimeout(resolve, 600)); // más que un vuelo corto

    expect(utils.handle.controller?.path).toEqual([]); // la ruta ya cambió…
    expect(utils.ids()).toEqual(["A1", "A2"]); // …pero se sigue viendo el hijo, sin vuelo ni gris
    expect(utils.phase()).toBeNull();

    parentReady = true;
    act(() => utils.rerender());
    await waitFor(() => expect(utils.ids()).toEqual(["A", "B", "C"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });

  it("termina en reposo, en la cámara que había antes de bajar, y sin capa saliente", async () => {
    const utils = mount();
    await down(utils);
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);

    expect(parseTransform(utils.viewport().getAttribute("transform"))).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
    expect(utils.layers("exiting")).toHaveLength(0);
    expect(utils.layers("context")).toHaveLength(0);
  });

  it("vuelve a la cámara EXACTA de antes de bajar (si el usuario había acercado, no al encaje)", async () => {
    const utils = mount({ zoom: { max: 6 } });
    const svg = utils.container.querySelector("svg") as SVGSVGElement;
    fireEvent.wheel(svg, { deltaY: -600, clientX: 40, clientY: 20 });
    await waitFor(
      () => expect(utils.viewport().getAttribute("transform")).not.toBe("translate(0,0) scale(1)"),
      TIMEOUT,
    );
    await new Promise((resolve) => setTimeout(resolve, 250)); // acaba el gesto de rueda
    const zoomed = parseTransform(utils.viewport().getAttribute("transform"));
    expect(zoomed.k).toBeGreaterThan(1);

    await down(utils);
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);

    const back = parseTransform(utils.viewport().getAttribute("transform"));
    expect(back.k).toBeCloseTo(zoomed.k, 3);
    expect(back.x).toBeCloseTo(zoomed.x, 1);
    expect(back.y).toBeCloseTo(zoomed.y, 1);
  });
});

describe("lateral", () => {
  it("clic en un hermano de la capa de contexto: vuela y revela el otro; el contexto sigue", async () => {
    const utils = mount();
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    const context = utils.container.querySelector(
      '.cm-layer[data-role="context"] [data-context-id="B"]',
    ) as Element;
    expect(context.hasAttribute("data-drillable")).toBe(true);

    fireEvent.click(context);
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    expect(utils.handle.controller?.path).toEqual(["B"]);
    expect(utils.ids()).toEqual(["A1", "A2"]); // aún las de España mientras vuela
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);

    expect(utils.ids()).toEqual(["B1", "B2"]);
    const [stillContext] = utils.layers("context");
    expect(stillContext?.querySelector("[data-focus]")?.getAttribute("data-context-id")).toBe("B");
  });

  it("los items NO navegables del contexto no responden al clic", async () => {
    const closed = defineDrillLevels<Row>([
      { ...(levels[0] as object), canDrill: (item: { id: string }) => item.id !== "C" } as never,
      levels[1] as never,
    ]);
    const utils = mount({}, closed);
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    const c = utils.container.querySelector(
      '.cm-layer[data-role="context"] [data-context-id="C"]',
    ) as Element;
    expect(c.hasAttribute("data-drillable")).toBe(false);
    fireEvent.click(c);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(utils.handle.controller?.path).toEqual(["A"]);
  });
});

describe("carga lenta y fallos", () => {
  it("si la carga tarda más que el vuelo: fase `loading` (la región respira) y luego revela", async () => {
    let release: (value: FeatureCollection) => void = () => {};
    const slow = defineDrillLevels<Row>([
      levels[0] as never,
      {
        id: "region",
        geography: () => new Promise<never>((resolve) => (release = resolve as never)),
      },
    ]);
    const utils = mount({}, slow);
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(utils.phase()).toBe("loading"), TIMEOUT);
    expect(utils.ids()).toEqual(["A", "B", "C"]); // el nivel viejo se mantiene
    expect(
      utils.container.querySelector("[data-drill-target]")?.getAttribute("data-region-id"),
    ).toBe("A");
    expect(utils.handle.controller?.status).toBe("loading");

    await act(async () => release(children["A"] as FeatureCollection));
    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });

  it("si la carga falla: espera al fin del vuelo, vuela de vuelta y avisa UNA vez", async () => {
    const failing = defineDrillLevels<Row>([
      levels[0] as never,
      { id: "region", geography: () => Promise.reject(new Error("boom")) },
    ]);
    const onDrillError = vi.fn<(e: { error: unknown; ctx: DrillContext }) => void>();
    const utils = mount({ onDrillError }, failing);
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(onDrillError).toHaveBeenCalledOnce(), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.handle.controller?.path).toEqual([]);
    expect(utils.ids()).toEqual(["A", "B", "C"]);
    expect(parseTransform(utils.viewport().getAttribute("transform"))).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
    expect(onDrillError).toHaveBeenCalledOnce();
  });
});

describe("interrumpir y redirigir", () => {
  it("un gesto del usuario durante el vuelo cancela la bajada (no se sigue contra la mano)", async () => {
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>();
    const utils = mount({ onDrill });
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    const svg = utils.container.querySelector("svg") as SVGSVGElement;
    // Acercar (no alejar): con `k` en el mínimo d3 sale antes de interrumpir y no hace nada.
    fireEvent.wheel(svg, { deltaY: -100, clientX: 100, clientY: 50 });

    await waitFor(() => expect(utils.handle.controller?.path).toEqual([]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.ids()).toEqual(["A", "B", "C"]);
  });

  it("clic en otra región durante el vuelo: redirige sin pasar por el primer destino", async () => {
    const utils = mount();
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    fireEvent.click(utils.path("B"));
    await waitFor(() => expect(utils.handle.controller?.path).toEqual(["B"]), TIMEOUT);
    await waitFor(() => expect(utils.ids()).toEqual(["B1", "B2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });

  it("subir antes de terminar de bajar: vuelve sin llegar a mostrar el hijo", async () => {
    const utils = mount();
    fireEvent.click(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    const seen = new Set<string>();
    act(() => utils.handle.controller?.drillUp());
    await waitFor(() => {
      seen.add(utils.ids().join(","));
      expect(utils.phase()).toBeNull();
    }, TIMEOUT);

    expect([...seen]).toEqual(["A,B,C"]);
    expect(utils.handle.controller?.path).toEqual([]);
  });
});

// d3-zoom engancha `mousemove`/`mouseup` a `event.view`; jsdom no deja pasarlo en el constructor.
const mouse = (type: "mouseDown" | "mouseUp", target: Element | Window, init: MouseEventInit) => {
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "view", { value: window });
  return fireEvent(target, event);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un clic como lo manda un navegador: `mousedown`, una pausa, `mouseup` y `click`. */
const realClick = async (target: Element, x = 40, y = 50) => {
  mouse("mouseDown", target, { clientX: x, clientY: y, button: 0 });
  await sleep(50);
  mouse("mouseUp", window, { clientX: x, clientY: y });
  fireEvent.click(target);
};

describe("clic y doble clic (eventos de ratón reales)", () => {
  it("un clic baja de nivel", async () => {
    const utils = mount();
    await realClick(utils.path("A"));

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), TIMEOUT);
  });

  it("el doble clic NO hace zoom ×2 en el mapa: el clic ya hace drill", () => {
    const utils = mount();
    const before = utils.viewport().getAttribute("transform");
    fireEvent.doubleClick(utils.container.querySelector("svg") as SVGSVGElement, {
      clientX: 100,
      clientY: 50,
    });

    expect(utils.viewport().getAttribute("transform")).toBe(before);
  });

  it("doble clic sobre una región: acaba en el nivel de abajo, sin zoom suelto ni drill doble", async () => {
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>();
    const utils = mount({ onDrill });
    const svg = utils.container.querySelector("svg") as SVGSVGElement;
    await realClick(utils.path("A"));
    await sleep(120);
    await realClick(utils.path("A")); // el segundo clic cae sobre la región a la que se vuela
    fireEvent.doubleClick(svg, { clientX: 40, clientY: 50 });

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(parseTransform(utils.viewport().getAttribute("transform"))).toEqual({
      x: 0,
      y: 0,
      k: 1,
    });
    // Pulsar la región de destino NO interrumpe el vuelo: un solo `onDrill` (no «down, up, down»).
    expect(onDrill).toHaveBeenCalledTimes(1);
    expect(onDrill.mock.calls[0]?.[0].direction).toBe("down");
  });

  it("pulsar OTRA región durante el vuelo sí interrumpe y redirige", async () => {
    const utils = mount();
    await realClick(utils.path("A"));
    await waitFor(() => expect(utils.phase()).toBe("flying"), TIMEOUT);
    await realClick(utils.path("B"));

    await waitFor(() => expect(utils.ids()).toEqual(["B1", "B2"]), TIMEOUT);
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
    expect(utils.handle.controller?.path).toEqual(["B"]);
  });
});

describe("eventos", () => {
  it("onDrill al instante del clic (ruta ya cambiada); onDrillEnd al acabar el revelado", async () => {
    const calls: string[] = [];
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>(() => void calls.push("drill"));
    const onDrillEnd = vi.fn<(e: DrillEvent<Row>) => void>(() => void calls.push("end"));
    const utils = mount({ onDrill, onDrillEnd });
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(onDrill).toHaveBeenCalledOnce(), TIMEOUT);
    expect(utils.phase()).toBe("flying"); // aún no ha terminado
    expect(onDrillEnd).not.toHaveBeenCalled();
    await waitFor(() => expect(onDrillEnd).toHaveBeenCalledOnce(), TIMEOUT);
    expect(calls).toEqual(["drill", "end"]);
  });
});

describe("sin zoom", () => {
  it("con `zoom={false}` no hay vuelo: el nivel se revela directamente", async () => {
    const utils = mount({ zoom: false });
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), { timeout: 1000 });
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });
});

describe("«reducir movimiento»", () => {
  it("el vuelo es un salto y el revelado dura 0: el nivel aparece enseguida", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList,
    );
    const utils = mount();
    const start = Date.now();
    fireEvent.click(utils.path("A"));

    await waitFor(() => expect(utils.ids()).toEqual(["A1", "A2"]), { timeout: 1000 });
    expect(Date.now() - start).toBeLessThan(900); // un vuelo real tardaría ≥ 350 ms + revelado
    await waitFor(() => expect(utils.phase()).toBeNull(), TIMEOUT);
  });
});
