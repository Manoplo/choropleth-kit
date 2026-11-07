import type { MockInstance } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import { createRef, type RefObject } from "react";
import { es, type DrillContext } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { useChoroplethApi } from "./choropleth-context";
import { defineDrillLevels } from "./drill-levels";
import type { ChoroplethMapHandle } from "./handle";
import { useDrillDown } from "./use-drill-down";

// Paso 34: cierre del drill. Handle (`drillDown` / `drillUp` / `drillTo` con Promise), prefetch por intención
// (`onDrillIntent`), modo táctil de dos toques y avisos de desarrollo. «Reducir movimiento» simulado: el vuelo
// es un salto y el revelado dura 0, así los tests no esperan vuelos de d3.

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

const geographyOf = ({ parentId }: DrillContext) =>
  Promise.resolve(children[parentId ?? ""] as never);
const levels = defineDrillLevels<Row>([
  { id: "country", geography: world },
  { id: "region", geography: geographyOf },
]);
const threeLevels = defineDrillLevels<Row>([
  { id: "country", geography: world },
  { id: "region", geography: geographyOf },
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

const mount = (props: Partial<RootProps<Row>> = {}) => {
  const ref: RefObject<ChoroplethMapHandle | null> = createRef<ChoroplethMapHandle>();
  const utils = render(
    <Choropleth.Root {...({ ...baseProps, drill: levels, ...props } as RootProps<Row>)} ref={ref}>
      <Choropleth.Svg />
      <Choropleth.Tooltip />
    </Choropleth.Root>,
  );
  const ids = () =>
    Array.from(utils.container.querySelectorAll(".cm-regions [data-region-id]")).map((el) =>
      el.getAttribute("data-region-id"),
    );
  const path = (id: string) =>
    utils.container.querySelector(`.cm-regions [data-region-id="${id}"]`) as Element;
  const handle = () => ref.current as ChoroplethMapHandle;
  return { ...utils, ids, path, handle };
};

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: query.includes("prefers-reduced-motion"), media: query }) as MediaQueryList,
  );
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

type Result = { completed: boolean };
/**
 * Lanza una navegación del handle y espera su resultado. NO se puede hacer `await` dentro de `act(async)`: `act`
 * retiene los renders hasta que el callback acaba, y la Promise depende de esos renders (se quedaría colgada).
 */
const call = async (start: () => Promise<Result>): Promise<Result> => {
  let result: Result | undefined;
  act(() => {
    void start().then((r) => {
      result = r;
    });
  });
  await waitFor(() => expect(result).toBeDefined());
  return result as Result;
};

const warnings = () => warn.mock.calls.map((call) => String(call[0]));

describe("handle del drill", () => {
  it("drillDown resuelve cuando el nivel nuevo está en reposo", async () => {
    const { handle, ids } = mount();

    const result = await call(() => handle().drillDown("A"));

    expect(result).toEqual({ completed: true });
    expect(ids()).toEqual(["A1", "A2"]);
  });

  it("encadena: bajar, subir y saltar con await (guion sin temporizadores)", async () => {
    const { handle, ids } = mount({ drill: threeLevels });

    expect(await call(() => handle().drillDown("A"))).toEqual({ completed: true });
    expect(ids()).toEqual(["A1", "A2"]);
    expect(await call(() => handle().drillUp())).toEqual({ completed: true });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(await call(() => handle().drillTo(["B"]))).toEqual({ completed: true });
    expect(ids()).toEqual(["B1", "B2"]);
    expect(await call(() => handle().drillDown("B1"))).toEqual({ completed: true });
    expect(await call(() => handle().drillUp(5))).toEqual({ completed: true }); // de más = a la raíz
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("drillTo con una ruta profunda de golpe", async () => {
    const { handle, ids } = mount({ drill: threeLevels });
    expect(await call(() => handle().drillTo(["A", "A1"]))).toEqual({ completed: true });
    // El último nivel hereda la geometría de las regiones (tiendas sobre la región).
    expect(ids()).toEqual(["A1", "A2"]);
  });

  it("estar ya allí resuelve `completed: true` sin tocar nada (también subir desde la raíz)", async () => {
    const { handle, ids } = mount();
    expect(await call(() => handle().drillUp())).toEqual({ completed: true });
    expect(await call(() => handle().drillTo([]))).toEqual({ completed: true });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(warnings()).toEqual([]);
  });

  it("un id que no existe en el nivel no navega: `completed: false` y aviso en inglés", async () => {
    const { handle, ids } = mount();
    const result = await call(() => handle().drillDown("ZZ"));

    expect(result).toEqual({ completed: false });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(warnings().join("\n")).toMatch(/\[choropleth\] drillDown\(\).*"ZZ".*does not exist/);
  });

  it("un id inexistente en un tramo intermedio de drillTo también se rechaza", async () => {
    const { handle } = mount({ drill: threeLevels });
    expect(await call(() => handle().drillTo(["ZZ", "A1"]))).toEqual({ completed: false });
    expect(warnings().join("\n")).toContain('"ZZ"');
  });

  it("`canDrill: false` rechaza la bajada con su aviso", async () => {
    const noC = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id !== "C" },
      { id: "region", geography: geographyOf },
    ]);
    const { handle, ids } = mount({ drill: noC });
    expect(await call(() => handle().drillDown("C"))).toEqual({ completed: false });
    expect(ids()).toEqual(["A", "B", "C"]);
    expect(warnings().join("\n")).toMatch(/canDrill/);
    expect(await call(() => handle().drillDown("A"))).toEqual({ completed: true });
  });

  it("más profundo que los niveles definidos: rechazado, con aviso", async () => {
    const { handle } = mount();
    expect(await call(() => handle().drillTo(["A", "A1"]))).toEqual({ completed: false });
    expect(warnings().join("\n")).toMatch(/only 2 level\(s\) are defined/);
  });

  it("sin la prop `drill`: `completed: false` y un aviso que lo explica", async () => {
    const { handle } = mount({ drill: undefined, data: rows, geography: world });
    expect(await call(() => handle().drillDown("A"))).toEqual({ completed: false });
    expect(warnings().join("\n")).toMatch(/drillDown\(\) needs the `drill` prop/);
  });

  it("una navegación nueva sustituye a la anterior: la primera resuelve `false`", async () => {
    const { handle, ids } = mount();
    let first: Result | undefined;
    let second: Result | undefined;
    act(() => {
      void handle()
        .drillTo(["A"])
        .then((r) => {
          first = r;
        });
      void handle()
        .drillTo(["B"])
        .then((r) => {
          second = r;
        });
    });
    await waitFor(() => expect(second).toBeDefined());
    expect(first).toEqual({ completed: false });
    expect(second).toEqual({ completed: true });
    expect(ids()).toEqual(["B1", "B2"]);
  });

  it("un error de carga deshace la bajada: `completed: false` y `onDrillError`", async () => {
    const onDrillError = vi.fn<(event: { error: unknown; ctx: DrillContext }) => void>();
    const failing = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => Promise.reject(new Error("boom")) },
    ]);
    const { handle, ids } = mount({ drill: failing, onDrillError });
    const result = await call(() => handle().drillDown("A"));

    expect(result).toEqual({ completed: false });
    expect(onDrillError).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("modo controlado: si el padre rechaza la ruta, resuelve `false` sin quedarse colgada", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const ref = createRef<ChoroplethMapHandle>();
    const Harness = () => {
      // El padre ignora `onPathChange`: la ruta se queda en [].
      const drill = useDrillDown<Row>({ levels, path: [], onPathChange: () => {} });
      return (
        <Choropleth.Root {...({ ...baseProps, drill } as RootProps<Row>)} ref={ref}>
          <Choropleth.Svg />
        </Choropleth.Root>
      );
    };
    render(<Harness />);

    let result: Result | undefined;
    act(() => {
      void (ref.current as ChoroplethMapHandle).drillDown("A").then((r) => {
        result = r;
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(result).toEqual({ completed: false });
  });

  it("al desmontar, las promesas pendientes resuelven `false`", async () => {
    const slow = defineDrillLevels<Row>([
      { id: "country", geography: world },
      { id: "region", geography: () => new Promise<never>(() => {}) },
    ]);
    const { handle, unmount } = mount({ drill: slow });
    let result: { completed: boolean } | undefined;
    const pending = handle()
      .drillDown("A")
      .then((r) => {
        result = r;
      });
    unmount();
    await pending;
    expect(result).toEqual({ completed: false });
  });

  it("`useChoroplethApi` ofrece lo mismo desde un hijo del compound", async () => {
    const Button = () => {
      const api = useChoroplethApi();
      return <button onClick={() => void api.drillDown("B")}>go</button>;
    };
    const { container, getByText } = (() => {
      const utils = render(
        <Choropleth.Root {...({ ...baseProps, drill: levels } as RootProps<Row>)}>
          <Choropleth.Svg />
          <Button />
        </Choropleth.Root>,
      );
      return { ...utils, getByText: utils.getByText };
    })();
    fireEvent.click(getByText("go"));
    await waitFor(() =>
      expect(container.querySelector(".cm-regions [data-region-id='B1']")).not.toBeNull(),
    );
  });
});

describe("intención de bajar (onDrillIntent y prefetch)", () => {
  const spyLevels = () => {
    const geography = vi.fn<(ctx: DrillContext) => Promise<never>>(geographyOf);
    return {
      geography,
      drill: defineDrillLevels<Row>([
        { id: "country", geography: world, canDrill: (item) => item.id !== "C" },
        { id: "region", geography },
      ]),
    };
  };
  const leave = (container: HTMLElement) =>
    fireEvent.pointerOver(container.querySelector(".cm-regions") as Element);

  it("150 ms sobre una región navegable: avisa con el contexto del nivel destino y precarga su geometría", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path, ids, container } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("A"));
    expect(onDrillIntent).not.toHaveBeenCalled();
    await waitFor(() => expect(onDrillIntent).toHaveBeenCalledTimes(1));

    expect(onDrillIntent).toHaveBeenCalledWith({ path: ["A"], parentId: "A", depth: 1 });
    expect(geography).toHaveBeenCalledTimes(1); // precargada antes del clic

    // Cuando llega el clic, la geometría ya está: no se vuelve a pedir.
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    expect(geography).toHaveBeenCalledTimes(1);
    leave(container);
  });

  it("un paso fugaz (< 150 ms) no es intención", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path, container } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("A"));
    leave(container);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onDrillIntent).not.toHaveBeenCalled();
    expect(geography).not.toHaveBeenCalled();
  });

  it("una región que no se puede perforar (`canDrill: false`) no genera intención", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("C"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(onDrillIntent).not.toHaveBeenCalled();
    expect(geography).not.toHaveBeenCalled();
  });

  it("sin `onDrillIntent` también precarga la geometría", async () => {
    const { geography, drill } = spyLevels();
    const { path } = mount({ drill });

    fireEvent.pointerOver(path("B"));
    await waitFor(() => expect(geography).toHaveBeenCalledTimes(1));
  });

  it("volver a entrar tras salir es otra permanencia (avisa de nuevo; la geometría no se repite)", async () => {
    const { geography, drill } = spyLevels();
    const onDrillIntent = vi.fn<(ctx: DrillContext) => void>();
    const { path, container } = mount({ drill, onDrillIntent });

    fireEvent.pointerOver(path("A"));
    await waitFor(() => expect(onDrillIntent).toHaveBeenCalledTimes(1));
    leave(container);
    fireEvent.pointerOver(path("A"));
    await waitFor(() => expect(onDrillIntent).toHaveBeenCalledTimes(2));
    expect(geography).toHaveBeenCalledTimes(1);
  });

  it("no re-renderiza `Root`: el hover y la intención no llaman a `getId` de nuevo", async () => {
    const { drill } = spyLevels();
    const getId = vi.fn<(row: Row) => string>((r) => r.id);
    const { path } = mount({ drill, getId, onDrillIntent: () => {} });
    const before = getId.mock.calls.length;

    fireEvent.pointerOver(path("A"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // La geometría precargada llega (un render legítimo del motor), pero ni el hover ni el temporizador renderizan.
    expect(getId.mock.calls.length - before).toBeLessThan(rows.length * 3);
  });

  it("un prefetch que falla no condena el clic: se reintenta", async () => {
    let calls = 0;
    const flaky = defineDrillLevels<Row>([
      { id: "country", geography: world },
      {
        id: "region",
        geography: (ctx) => (calls++ === 0 ? Promise.reject(new Error("net")) : geographyOf(ctx)),
      },
    ]);
    const onDrillError = vi.fn<(event: { error: unknown; ctx: DrillContext }) => void>();
    const { path, ids } = mount({ drill: flaky, onDrillError });

    fireEvent.pointerOver(path("A"));
    await waitFor(() => expect(calls).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(path("A"));

    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
    expect(onDrillError).not.toHaveBeenCalled();
    expect(calls).toBe(2);
  });
});

describe("táctil: dos toques", () => {
  const touch = { pointerType: "touch" };
  const tap = (el: Element) => {
    fireEvent.pointerDown(el, touch);
    fireEvent.pointerOver(el, touch);
    fireEvent.pointerUp(el, touch);
    fireEvent.click(el);
  };

  // Bajar es asíncrono (la geometría llega en un microtask): para afirmar que NO ha bajado hay que dejar pasar tiempo.
  const quiet = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));

  it("el primer toque previsualiza (tooltip con «Tap again») y el segundo baja", async () => {
    const onItemHover = vi.fn<(item: unknown) => void>();
    const onDrill = vi.fn<(event: unknown) => void>();
    const { path, ids, container } = mount({ onItemHover, onDrill });

    tap(path("A"));
    await quiet();
    expect(ids()).toEqual(["A", "B", "C"]); // sigue en el mundo
    expect(onDrill).not.toHaveBeenCalled();
    expect(onItemHover).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".cm-tooltip")?.textContent).toContain("Tap again to enter");
    expect(container.querySelector(".cm-tooltip")?.textContent).not.toContain("Click to see");

    tap(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
  });

  it("tocar otra región mueve la vista previa: hacen falta dos toques en ELLA", async () => {
    const { path, ids } = mount();
    tap(path("A"));
    tap(path("B"));
    await quiet();
    expect(ids()).toEqual(["A", "B", "C"]);
    tap(path("B"));
    await waitFor(() => expect(ids()).toEqual(["B1", "B2"]));
  });

  it("tocar fuera (el océano) retira la vista previa: el siguiente toque vuelve a ser el primero", async () => {
    const { path, ids, container } = mount();
    tap(path("A"));
    fireEvent.pointerOver(container.querySelector(".cm-regions") as Element, touch);
    tap(path("A"));
    await quiet();
    expect(ids()).toEqual(["A", "B", "C"]);
  });

  it("los textos de la pista salen de `labels`", () => {
    const { path, container } = mount({ labels: es });
    tap(path("A"));
    expect(container.querySelector(".cm-tooltip")?.textContent).toContain(
      "Toca de nuevo para entrar",
    );
  });

  it("con ratón un solo clic baja (nada cambia)", async () => {
    const { path, ids } = mount();
    fireEvent.pointerDown(path("A"), { pointerType: "mouse" });
    fireEvent.click(path("A"));
    await waitFor(() => expect(ids()).toEqual(["A1", "A2"]));
  });

  it("una región que no se puede perforar se selecciona con un toque, como siempre", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const noC = defineDrillLevels<Row>([
      { id: "country", geography: world, canDrill: (item) => item.id !== "C" },
      { id: "region", geography: geographyOf },
    ]);
    const { path } = mount({ drill: noC, onItemClick });
    tap(path("C"));
    expect(onItemClick).toHaveBeenCalledTimes(1);
  });
});

describe("avisos de desarrollo del drill", () => {
  it("una ruta de la URL con un id que no existe avisa (sin romper)", async () => {
    const Harness = () => {
      const drill = useDrillDown<Row>({ levels, path: ["ZZ"] });
      return (
        <Choropleth.Root {...({ ...baseProps, drill } as RootProps<Row>)}>
          <Choropleth.Svg />
        </Choropleth.Root>
      );
    };
    render(<Harness />);
    await waitFor(() => expect(warnings().join("\n")).toMatch(/drill path.*"ZZ".*does not exist/));
  });

  it("datos de otro nivel sobre la geometría actual: pista de usar un selector", () => {
    const stores = [{ id: "S1", v: 1 }];
    mount({ data: stores });
    const text = warnings().join("\n");
    expect(text).toContain("no matching geometry");
    expect(text).toMatch(/Pass `data` as a selector/);
  });

  it("con selector no se da esa pista", () => {
    mount({ data: () => [{ id: "S1", v: 1 }] });
    expect(warnings().join("\n")).not.toMatch(/as a selector/);
  });

  it("`getFeatureId` que no devuelve nada: avisa de que ninguna región tiene id", () => {
    mount({ drill: undefined, data: rows, geography: world, getFeatureId: () => undefined });
    expect(warnings().join("\n")).toMatch(/none of the 3 region\(s\).*returned `undefined`/);
  });

  it("con `diagnostics={false}` no se avisa de ids", () => {
    mount({
      drill: undefined,
      data: rows,
      geography: world,
      getFeatureId: () => undefined,
      diagnostics: false,
    });
    expect(warnings()).toEqual([]);
  });
});
