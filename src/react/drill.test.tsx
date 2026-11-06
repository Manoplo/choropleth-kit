import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import type { DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { defineDrillLevels, type DrillEvent } from "./drill-levels";
import { world110m } from "../geo";
import { useDrillDown, type DrillController } from "./use-drill-down";

// Paso 31: la prop `drill` dentro del mapa. El cambio de nivel es instantáneo (el vuelo y el contexto
// llegan en el paso siguiente). Geometrías pequeñas hechas a mano: el anillo exterior va en sentido
// HORARIO (el que espera d3), no el de GeoJSON.

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

// Nivel 0: A, B y C. Nivel 1 (por padre): A1, A2 dentro de A; B1, B2 dentro de B.
// C está lejos: hace que A y B sean pequeñas en la raíz (si no, A ya llenaría el lienzo y encuadrarla la alejaría).
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

const levels = defineDrillLevels<Row>([
  { id: "country", label: "Countries", geography: world },
  { id: "region", geography: ({ parentId }) => Promise.resolve(children[parentId ?? ""] as never) },
]);

const baseProps = {
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
  data: (ctx: DrillContext) => rows.filter((r) => r.parent === (ctx.parentId ?? undefined)),
} as const;

const mapElement = (props: Partial<RootProps<Row>>) => (
  <Choropleth.Root {...({ ...baseProps, drill: levels, ...props } as RootProps<Row>)}>
    <Choropleth.Svg />
  </Choropleth.Root>
);

const setup = (props: Partial<RootProps<Row>> = {}) => {
  const utils = render(mapElement(props));
  const ids = () =>
    Array.from(utils.container.querySelectorAll("[data-region-id]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
  const path = (id: string) => utils.container.querySelector(`[data-region-id="${id}"]`) as Element;
  return {
    ...utils,
    ids,
    path,
    rerenderWith: (p: Partial<RootProps<Row>>) => utils.rerender(mapElement(p)),
    viewport: () => utils.container.querySelector(".cm-viewport") as SVGGElement,
  };
};

// El cambio de nivel espera al vuelo de cámara (350-1200 ms). Los vuelos de d3 no avanzan con los
// temporizadores falsos de Vitest (su reloj de fotogramas usa el `requestAnimationFrame` real), así que
// salvo en la coreografía real (más abajo) se simula «reducir movimiento»: el vuelo es un salto inmediato
// y el revelado dura 0 ms. `waitFor` de Testing Library tampoco sabe de temporizadores falsos de Vitest.
const reduceMotion = (reduced: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduced && query.includes("prefers-reduced-motion"),
        media: query,
      }) as MediaQueryList,
  );
beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(true);
});
afterEach(() => {
  if (vi.isFakeTimers()) act(() => void vi.runOnlyPendingTimers());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Avanza el reloj y deja correr las promesas (cargas de geometría, vuelos). */
const flush = (ms = 100) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Como `waitFor`, pero avanzando el reloj falso: reintenta la aserción hasta ~6 s de reloj simulado. */
const until = async (assertion: () => void) => {
  for (let step = 0; step < 60; step++) {
    await flush();
    try {
      assertion();
      return;
    } catch {
      // todavía no
    }
  }
  assertion();
};

describe("la prop `drill`: nivel raíz", () => {
  it("pinta la geometría del primer nivel, con sus datos", () => {
    const { ids, path } = setup();

    expect(ids()).toEqual(["A", "B", "C"]);
    expect(path("A").getAttribute("style")).not.toBe(path("B").getAttribute("style"));
  });

  it("las regiones navegables llevan `data-drillable`", () => {
    const { path } = setup();

    expect(path("A").hasAttribute("data-drillable")).toBe(true);
    expect(path("B").hasAttribute("data-drillable")).toBe(true);
  });

  it("`canDrill: false` en el nivel: nada es navegable", () => {
    const closed = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: false },
      levels[1] as never,
    ]);
    const { path } = setup({ drill: closed });

    expect(path("A").hasAttribute("data-drillable")).toBe(false);
  });

  it("`canDrill` como función decide por item", () => {
    const some = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id !== "B" },
      levels[1] as never,
    ]);
    const { path } = setup({ drill: some });

    expect(path("A").hasAttribute("data-drillable")).toBe(true);
    expect(path("B").hasAttribute("data-drillable")).toBe(false);
  });

  it("sin `geography` ni `drill` lanza un error que dice qué pasar", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => setup({ drill: undefined })).toThrow(/Missing `geography`/);
    quiet.mockRestore();
  });
});

describe("bajar de nivel (no controlado)", () => {
  it("clic en una región navegable: aparecen sus hijas, con sus datos", async () => {
    const { ids, path } = setup();
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(path("A1").getAttribute("style")).not.toBe(path("A2").getAttribute("style"));
  });

  it("el último nivel no es navegable: clic selecciona, no baja", async () => {
    const { ids, path } = setup({ defaultSelectedId: null });
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
    fireEvent.click(path("A1"));

    expect(ids()).toEqual(["A1", "A2"]);
    expect(path("A1").hasAttribute("data-drillable")).toBe(false);
  });

  it("`onItemClick` se llama también al bajar, con el nivel y `drillable` del item", async () => {
    const onItemClick =
      vi.fn<
        (item: { id: string; drillable: boolean; level: { id: string; depth: number } }) => void
      >();
    const { ids, path } = setup({ onItemClick: onItemClick as never });
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(onItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A", drillable: true, level: { id: "country", depth: 0 } }),
    );
  });

  it("la proyección del hijo encuadra la región: sus rutas caen dentro del lienzo", async () => {
    const { ids, path } = setup();
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
    const numbers = (path("A1").getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];

    expect(numbers.length).toBeGreaterThan(4);
    for (const n of numbers) {
      expect(n).toBeGreaterThanOrEqual(-0.5);
      expect(n).toBeLessThanOrEqual(200.5);
    }
  });

  it("A llena el lienzo al bajar (rebase): su hija A1 ocupa mucho más que antes", async () => {
    const extent = (d: string) => {
      const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const xs = n.filter((_, i) => i % 2 === 0);
      return Math.max(...xs) - Math.min(...xs);
    };
    const { ids, path } = setup();
    const before = extent(path("A").getAttribute("d") ?? "");
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
    const after = extent(path("A1").getAttribute("d") ?? "");

    expect(after).toBeGreaterThan(before);
  });

  it("al cambiar de nivel la cámara vuelve al encaje (sin animar)", async () => {
    const { ids, path, container, viewport } = setup({ zoom: { max: 6 } });
    const svg = container.querySelector("svg") as SVGSVGElement;
    fireEvent.wheel(svg, { deltaY: -2000, clientX: 40, clientY: 20 });
    await until(() =>
      expect(viewport().getAttribute("transform")).not.toBe("translate(0,0) scale(1)"),
    );
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(viewport().getAttribute("transform")).toBe("translate(0,0) scale(1)");
  });

  it("la selección se limpia al cambiar de nivel", async () => {
    const closed = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id === "A" },
      levels[1] as never,
    ]);
    const { ids, path, container } = setup({ drill: closed, defaultSelectedId: null });
    fireEvent.click(path("B")); // no navegable: selecciona
    expect(container.querySelector(".cm-root")?.hasAttribute("data-has-selection")).toBe(true);
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(container.querySelector(".cm-root")?.hasAttribute("data-has-selection")).toBe(false);
  });
});

describe("`data` como selector", () => {
  it("recibe el contexto del nivel que se muestra", async () => {
    const seen: (string | null)[] = [];
    const data = (ctx: DrillContext) => {
      seen.push(ctx.parentId);
      return rows.filter((r) => r.parent === (ctx.parentId ?? undefined));
    };
    const { ids, path } = setup({ data });
    fireEvent.click(path("B"));
    await until(() => expect(ids()).toEqual(["B1", "B2"]));

    expect(seen).toContain(null);
    expect(seen).toContain("B");
  });

  it("una lista fija también vale (la cruza con la geometría del nivel mostrado)", () => {
    const { ids } = setup({ data: rows.filter((r) => r.parent === undefined) });

    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("sin `drill`, un selector se resuelve con el contexto de la raíz", () => {
    const data = vi.fn<(ctx: DrillContext) => Row[]>(() => rows.slice(0, 2));
    const { ids } = setup({ drill: undefined, geography: world, data });

    expect(ids()).toEqual(["A", "B", "C"]);
    expect(data).toHaveBeenCalledWith({ path: [], parentId: null, depth: 0 });
  });
});

describe("carga entre niveles", () => {
  it("mientras la geometría hija carga se sigue mostrando el nivel anterior, con SUS datos", async () => {
    let release: (value: FeatureCollection) => void = () => {};
    const slow = defineDrillLevels<Row>([
      { id: "country", geography: world },
      {
        id: "region",
        geography: () => new Promise<never>((resolve) => (release = resolve as never)),
      },
    ]);
    const { ids, path } = setup({ drill: slow });
    const before = path("A").getAttribute("style");
    fireEvent.click(path("A"));
    await flush();

    expect(ids()).toEqual(["A", "B", "C"]);
    expect(path("A").getAttribute("style")).toBe(before);

    await act(async () => release(children["A"] as FeatureCollection));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
  });

  it("si los DATOS del nivel nuevo son `undefined`, se mantiene el nivel anterior (sin mapa gris)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Harness = () => {
      const [loaded, setLoaded] = useState(false);
      return (
        <>
          <button onClick={() => setLoaded(true)}>load</button>
          {mapElement({
            data: (ctx) =>
              ctx.depth === 0
                ? rows.filter((r) => !r.parent)
                : loaded
                  ? rows.filter((r) => r.parent === ctx.parentId)
                  : undefined,
          })}
        </>
      );
    };
    const { container, getByText } = render(<Harness />);
    const ids = () =>
      Array.from(container.querySelectorAll("[data-region-id]")).map((e) =>
        e.getAttribute("data-region-id"),
      );
    fireEvent.click(container.querySelector('[data-region-id="A"]') as Element);
    await flush();

    expect(ids()).toEqual(["A", "B", "C"]); // sigue el nivel viejo
    expect(warn).not.toHaveBeenCalled(); // y sin avisos de «sin cruzar»

    fireEvent.click(getByText("load"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
    warn.mockRestore();
  });
});

describe("subir de nivel", () => {
  const Controlled = ({ onController }: { onController: (c: DrillController<Row>) => void }) => {
    const controller = useDrillDown<Row>({ levels });
    onController(controller);
    return mapElement({ drill: controller });
  };

  it("`drillUp` del controlador vuelve al nivel anterior", async () => {
    let controller: DrillController<Row> | undefined;
    const { container } = render(<Controlled onController={(c) => (controller = c)} />);
    const ids = () =>
      Array.from(container.querySelectorAll("[data-region-id]")).map((e) =>
        e.getAttribute("data-region-id"),
      );
    fireEvent.click(container.querySelector('[data-region-id="A"]') as Element);
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
    expect(controller?.path).toEqual(["A"]);

    act(() => controller?.drillUp());
    await until(() => expect(ids()).toEqual(["A", "B", "C"]));
    expect(controller?.path).toEqual([]);
  });

  it("`status` del controlador: «loading» mientras carga y «idle» al terminar", async () => {
    let release: (value: FeatureCollection) => void = () => {};
    const slow = defineDrillLevels<Row>([
      { id: "country", geography: world },
      {
        id: "region",
        geography: () => new Promise<never>((resolve) => (release = resolve as never)),
      },
    ]);
    let controller: DrillController<Row> | undefined;
    const Harness = () => {
      const c = useDrillDown<Row>({ levels: slow });
      controller = c;
      return mapElement({ drill: c });
    };
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector('[data-region-id="A"]') as Element);
    await flush();
    expect(controller?.status).toBe("loading");

    await act(async () => release(children["A"] as FeatureCollection));
    await until(() => expect(controller?.status).toBe("idle"));
  });
});

describe("modo controlado", () => {
  it("el clic avisa con `onPathChange` y la ruta la manda el padre", async () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const Harness = () => {
      const [path, setPath] = useState<readonly string[]>([]);
      const controller = useDrillDown<Row>({
        levels,
        path,
        onPathChange: (p) => {
          onPathChange(p);
          setPath(p);
        },
      });
      return mapElement({ drill: controller });
    };
    const { container } = render(<Harness />);
    const ids = () =>
      Array.from(container.querySelectorAll("[data-region-id]")).map((e) =>
        e.getAttribute("data-region-id"),
      );
    fireEvent.click(container.querySelector('[data-region-id="B"]') as Element);
    await until(() => expect(ids()).toEqual(["B1", "B2"]));

    expect(onPathChange).toHaveBeenCalledWith(["B"]);
  });

  it("montar con una ruta (URL) muestra directamente ese nivel", async () => {
    const Harness = () => mapElement({ drill: useDrillDown<Row>({ levels, path: ["A"] }) });
    const { container } = render(<Harness />);
    const ids = () =>
      Array.from(container.querySelectorAll("[data-region-id]")).map((e) =>
        e.getAttribute("data-region-id"),
      );
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
  });

  it("si el padre rechaza el cambio, el mapa no se mueve", async () => {
    const Harness = () =>
      mapElement({ drill: useDrillDown<Row>({ levels, path: [], onPathChange: () => {} }) });
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector('[data-region-id="A"]') as Element);
    await flush();

    expect(container.querySelector('[data-region-id="A"]')).not.toBeNull();
    expect(container.querySelector('[data-region-id="A1"]')).toBeNull();
  });
});

describe("eventos onDrill / onDrillEnd", () => {
  it("al bajar: onDrill con dirección, contextos e item; después onDrillEnd", async () => {
    const order: string[] = [];
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>(() => void order.push("drill"));
    const onDrillEnd = vi.fn<(e: DrillEvent<Row>) => void>(() => void order.push("end"));
    const { ids, path } = setup({ onDrill, onDrillEnd });
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
    await until(() => expect(onDrillEnd).toHaveBeenCalledOnce()); // al acabar el revelado

    expect(onDrill).toHaveBeenCalledOnce();
    expect(onDrill.mock.calls[0]?.[0]).toMatchObject({
      direction: "down",
      from: { path: [], depth: 0 },
      to: { path: ["A"], parentId: "A", depth: 1 },
      item: { id: "A", kind: "region" },
    });
    expect(onDrillEnd).toHaveBeenCalledOnce();
    expect(onDrillEnd.mock.calls[0]?.[0]).toMatchObject({ direction: "down", to: { path: ["A"] } });
    expect(order).toEqual(["drill", "end"]);
  });

  it("al montar NO hay eventos", () => {
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>();
    const onDrillEnd = vi.fn<(e: DrillEvent<Row>) => void>();
    setup({ onDrill, onDrillEnd });

    expect(onDrill).not.toHaveBeenCalled();
    expect(onDrillEnd).not.toHaveBeenCalled();
  });

  it("subir desde el controlador: dirección `up` y sin item", async () => {
    const onDrill = vi.fn<(e: DrillEvent<Row>) => void>();
    let controller: DrillController<Row> | undefined;
    const Harness = () => {
      const c = useDrillDown<Row>({ levels, defaultPath: ["A"] });
      controller = c;
      return mapElement({ drill: c, onDrill });
    };
    render(<Harness />);
    await flush();
    act(() => controller?.drillUp());

    expect(onDrill.mock.calls[0]?.[0]).toMatchObject({ direction: "up", to: { path: [] } });
    expect(onDrill.mock.calls[0]?.[0]).not.toHaveProperty("item");
  });
});

describe("errores de geometría", () => {
  it("si la carga falla: onDrillError, vuelta al nivel anterior y el mapa sigue usable", async () => {
    const failing = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => Promise.reject(new Error("boom")) },
    ]);
    const onDrillError = vi.fn<(e: { error: unknown; ctx: DrillContext }) => void>();
    let controller: DrillController<Row> | undefined;
    const Harness = () => {
      const c = useDrillDown<Row>({ levels: failing });
      controller = c;
      return mapElement({ drill: c, onDrillError });
    };
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector('[data-region-id="A"]') as Element);
    await until(() => expect(onDrillError).toHaveBeenCalledOnce());

    expect(onDrillError.mock.calls[0]?.[0]?.error).toEqual(new Error("boom"));
    expect(onDrillError.mock.calls[0]?.[0]?.ctx).toMatchObject({ path: ["A"], depth: 1 });
    await until(() => expect(controller?.path).toEqual([]));
    expect(container.querySelector('[data-region-id="A"]')).not.toBeNull();
  });

  it("un nivel con 0 regiones para ese padre: error con la pista de `canDrill`", async () => {
    const empty = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => Promise.resolve(collection() as never) },
    ]);
    const onDrillError = vi.fn<(e: { error: unknown; ctx: DrillContext }) => void>();
    const { path } = setup({ drill: empty, onDrillError });
    fireEvent.click(path("A"));
    await until(() => expect(onDrillError).toHaveBeenCalledOnce());

    expect(onDrillError.mock.calls[0]?.[0]?.error).toEqual(
      new Error(
        '[choropleth] drill level "region" has 0 features for "A". Hint: return false from canDrill for it.',
      ),
    );
  });

  it("sin `onDrillError` el fallo se cuenta por consola (en inglés)", async () => {
    const failing = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => Promise.reject(new Error("boom")) },
    ]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { path } = setup({ drill: failing });
    fireEvent.click(path("A"));
    await until(() => expect(error).toHaveBeenCalled());

    expect(String(error.mock.calls[0]?.[0])).toContain("[choropleth]");
    error.mockRestore();
  });

  it("se puede reintentar tras un fallo", async () => {
    let fail = true;
    const flaky = defineDrillLevels<Row>([
      { id: "country", geography: world },
      {
        id: "region",
        geography: ({ parentId }) =>
          fail
            ? Promise.reject(new Error("boom"))
            : Promise.resolve(children[parentId ?? ""] as never),
      },
    ]);
    const onDrillError = vi.fn<(e: { error: unknown; ctx: DrillContext }) => void>();
    const { ids, path } = setup({ drill: flaky, onDrillError });
    fireEvent.click(path("A"));
    await until(() => expect(onDrillError).toHaveBeenCalledOnce());
    await flush();
    fail = false;
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));
  });
});

describe("niveles con `encoding` y `inherit`", () => {
  it("`encoding` sustituye el variant y el getValue de ESE nivel", async () => {
    const encoded = defineDrillLevels<Row>([
      { id: "country", geography: world },
      {
        id: "region",
        geography: ({ parentId }) => Promise.resolve(children[parentId ?? ""] as never),
        encoding: { variant: "bubble", getValue: (r) => r.v * 10 },
      },
    ]);
    const { container, ids, path } = setup({ drill: encoded });
    expect(container.querySelectorAll("circle.cm-bubble")).toHaveLength(0);
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(container.querySelectorAll("circle.cm-bubble")).toHaveLength(2);
  });

  it('"inherit": el nivel siguiente reutiliza la geometría del padre, encuadrada en la región', async () => {
    const inherited = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "store", geography: "inherit" },
    ]);
    const { ids, path } = setup({ drill: inherited });
    const extent = (d: string) => {
      const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const xs = n.filter((_, i) => i % 2 === 0);
      return Math.max(...xs) - Math.min(...xs);
    };
    const before = extent(path("A").getAttribute("d") ?? "");
    fireEvent.click(path("A"));
    await until(() => expect(extent(path("A").getAttribute("d") ?? "")).toBeGreaterThan(before));

    expect(ids()).toEqual(["A", "B", "C"]); // mismas regiones; ahora A llena la vista
  });
});

describe("proporción automática", () => {
  it('con `aspectRatio: "auto"` el alto NO cambia al bajar (se mide en la raíz, no en el nivel)', async () => {
    const { container, ids, path } = setup({
      width: undefined,
      height: undefined,
      aspectRatio: "auto",
    });
    const viewBox = () => container.querySelector("svg")?.getAttribute("viewBox");
    const before = viewBox();
    fireEvent.click(path("A"));
    await until(() => expect(ids()).toEqual(["A1", "A2"]));

    expect(before).not.toBeNull();
    expect(viewBox()).toBe(before);
  });
});

describe("rendimiento", () => {
  it("el hover no re-renderiza el mapa con `drill` (no vuelve a llamar a `getId`)", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.id);
    const { path } = setup({ getId });
    const calls = getId.mock.calls.length;
    fireEvent.pointerOver(path("A"));
    fireEvent.pointerOver(path("B"));

    expect(getId.mock.calls.length).toBe(calls);
  });
});

describe("geodatos reales (world110m)", () => {
  const real = defineDrillLevels<Row>([
    { id: "country", geography: world110m, objectName: "countries" },
    { id: "store", geography: "inherit" },
  ]);

  // Rusia y Fiyi cruzan el antimeridiano: sin tratarlo, el encuadre sale del ancho del mundo. Al bajar a un
  // país, su cuerpo principal debe quedar DENTRO de la vista (los territorios lejanos —Guayana, Hawái, la
  // isla de Fiyi al otro lado del mapa— se salen a propósito) y las rutas ser finitas.
  it.each(["ES", "FR", "US", "RU", "FJ", "NO", "BR"])(
    "bajar a %s: su cuerpo principal queda dentro de la vista",
    async (id) => {
      const { container } = render(
        mapElement({ drill: real, data: [], width: 960, height: 500, getValue: () => 1 }),
      );
      fireEvent.click(container.querySelector(`[data-region-id="${id}"]`) as Element);
      await flush();
      const d = container.querySelector(`[data-region-id="${id}"]`)?.getAttribute("d") ?? "";
      const parts = d
        .split(/(?=M)/)
        .map((part) => (part.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number));
      const inside = parts.filter((numbers) =>
        numbers.every((n, i) => (i % 2 === 0 ? n >= -1 && n <= 961 : n >= -1 && n <= 501)),
      );

      expect(d).not.toContain("NaN");
      expect(inside.length).toBeGreaterThan(0);
    },
  );
});
