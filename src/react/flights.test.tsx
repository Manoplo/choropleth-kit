import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import type { FeatureCollection } from "geojson";
import type { ViewState, ZoomOptions } from "../core";
import { world110m } from "../geo";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { useChoroplethApi } from "./choropleth-context";
import type { RootProps } from "./components/root";
import type { ChoroplethMapHandle } from "./handle";

// Paso 26: vuelos de cámara (`zoomTo`, `focusId`, `initialView`) y handle imperativo.

type Row = { code: string; v: number | null };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];
// Dos bloques CLAROS (anillos en sentido horario, lo que espera d3) a la misma latitud: A en lon 0…10
// y B en lon 20…30. El fixture compartido `twoSquares` tiene el anillo al revés (d3 lo lee como «el
// globo menos el cuadrado»), así que su mapa es el mundo entero y no sirve para comprobar encuadres.
const block = (id: string, west: number): FeatureCollection["features"][number] => ({
  type: "Feature",
  id,
  properties: { name: id },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, 40],
        [west, 50],
        [west + 10, 50],
        [west + 10, 40],
        [west, 40],
      ],
    ],
  },
});
const blocks: FeatureCollection = {
  type: "FeatureCollection",
  features: [block("A", 0), block("B", 20)],
};
/** Centro geográfico de cada bloque. */
const CENTER_A = 5;
const CENTER_B = 25;
const CENTER_LAT = 45;

const baseProps = {
  geography: blocks,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

/** `constrain: "free"` para comprobar el encuadre exacto sin que el límite lo desplace. */
const free: ZoomOptions = { constrain: "free", padding: 0 };

const setup = (props: Partial<RootProps<Row>> = {}, children?: React.ReactNode) => {
  const ref = createRef<ChoroplethMapHandle>();
  const utils = render(
    <Choropleth.Root ref={ref} {...({ ...baseProps, ...props } as RootProps<Row>)}>
      <Choropleth.Svg />
      {children}
    </Choropleth.Root>,
  );
  const handle = () => ref.current as ChoroplethMapHandle;
  // Volver a renderizar CON el mismo `ref`: sin él, React desengancha el handle.
  const rerenderWith = (next: Partial<RootProps<Row>>) =>
    utils.rerender(
      <Choropleth.Root ref={ref} {...({ ...baseProps, ...next } as RootProps<Row>)}>
        <Choropleth.Svg />
        {children}
      </Choropleth.Root>,
    );
  return { ...utils, ref, handle, rerenderWith };
};

const cameraOf = (container: Element) => {
  const viewport = container.querySelector(".cm-viewport");
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport?.getAttribute("transform") ?? "",
  );
  if (match === null) throw new Error("sin transform");
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

afterEach(() => vi.unstubAllGlobals());

describe("handle imperativo (ref)", () => {
  it("expone zoomTo, zoomBy, resetView y getView", () => {
    const { handle } = setup();

    expect(Object.keys(handle()).sort()).toEqual(["getView", "resetView", "zoomBy", "zoomTo"]);
  });

  it("en el encaje, getView da k = 1 y el centro geográfico", () => {
    const { handle } = setup();
    const view = handle().getView();

    expect(view).toMatchObject({ k: 1, zoom: 1, level: { id: "root", depth: 0 } });
    expect(Math.abs(view.center[0] - 15)).toBeLessThan(1.5); // el centro de los dos bloques (lon 0…30)
  });

  it("también en el preset <ChoroplethMap ref>", () => {
    const ref = createRef<ChoroplethMapHandle>();
    render(
      <ChoroplethMap<Row>
        ref={ref}
        {...({ ...baseProps } as unknown as ChoroplethMapProps<Row>)}
      />,
    );

    expect(ref.current?.getView().k).toBe(1);
  });
});

describe("zoomTo", () => {
  it("una región: la encuadra y la deja centrada (centro geográfico de A)", async () => {
    const { handle } = setup({ zoom: free });
    const result = await handle().zoomTo("A", { duration: 50 });

    expect(result).toEqual({ completed: true });
    const view = handle().getView();
    expect(view.k).toBeGreaterThan(1);
    expect(view.center[0]).toBeCloseTo(CENTER_A, 0);
    expect(view.center[1]).toBeCloseTo(CENTER_LAT, 0);
  });

  it("otra región: vuela de A a B", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomTo("A", { duration: 30 });
    await handle().zoomTo("B", { duration: 30 });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("{ center, zoom }: ese punto en el centro con esa escala relativa al encaje", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomTo({ center: [CENTER_B, CENTER_LAT], zoom: 3 }, { duration: 30 });

    const view = handle().getView();
    expect(view.k).toBeCloseTo(3, 6);
    expect(view.center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("{ bounds }: encuadra unos límites geográficos", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomTo(
      {
        bounds: [
          [21, 41],
          [29, 49],
        ],
      },
      { duration: 30 },
    );

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("duration: 0 coloca la cámara al instante (sin transición)", () => {
    const { handle, container } = setup({ zoom: free });
    const promise = handle().zoomTo("A", { duration: 0 });

    expect(cameraOf(container).k).toBeGreaterThan(1); // ya está, sin esperar
    return expect(promise).resolves.toEqual({ completed: true });
  });

  it("una región que no existe: completed false y aviso en inglés (no lanza)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handle } = setup();

    expect(await handle().zoomTo("ZZ")).toEqual({ completed: false });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[choropleth] zoomTo: could not resolve"),
    );
    warn.mockRestore();
  });

  it("con `constrain: contain` el destino respeta los límites (no se sale del mapa)", async () => {
    const { handle, container } = setup(); // contain por defecto
    await handle().zoomTo("A", { duration: 30 });

    const { x, y, k } = cameraOf(container);
    expect(x).toBeLessThanOrEqual(1e-9);
    expect(y).toBeLessThanOrEqual(1e-9);
    expect(x + 200 * k).toBeGreaterThanOrEqual(200 - 1e-9);
    expect(y + 100 * k).toBeGreaterThanOrEqual(100 - 1e-9);
  });

  it("padding: más margen = menos zoom", async () => {
    const small = setup({ zoom: { constrain: "free", padding: 0 } });
    await small.handle().zoomTo("A", { duration: 0 });
    const large = setup({ zoom: { constrain: "free", padding: 40 } });
    await large.handle().zoomTo("A", { duration: 0 });

    expect(large.handle().getView().k).toBeLessThan(small.handle().getView().k);
    // y por llamada: `padding` sustituye al de las opciones
    await small.handle().zoomTo("A", { duration: 0, padding: 40 });
    expect(small.handle().getView().k).toBeCloseTo(large.handle().getView().k, 6);
  });

  it("un gesto del usuario interrumpe el vuelo: completed false", async () => {
    const { handle, container } = setup({ zoom: free });
    const flight = handle().zoomTo("B", { duration: 800 });
    fireEvent.wheel(container.querySelector("svg") as Element, {
      deltaY: -300,
      clientX: 100,
      clientY: 50,
    });

    expect(await flight).toEqual({ completed: false });
  });

  it("onViewChange se llama al terminar cada vuelo, una vez", async () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { handle } = setup({ zoom: { ...free, onViewChange } });
    await handle().zoomTo("A", { duration: 30 });

    await waitFor(() => expect(onViewChange).toHaveBeenCalledOnce());
  });

  it("con zoom={false} los movimientos resuelven completed: false, y getView sigue dando el encaje", async () => {
    const { handle } = setup({ zoom: false });

    expect(await handle().zoomTo("A")).toEqual({ completed: false });
    expect(await handle().zoomBy(2)).toEqual({ completed: false });
    expect(await handle().resetView()).toEqual({ completed: false });
    expect(handle().getView().k).toBe(1);
  });
});

describe("zoomBy y resetView por el handle", () => {
  it("zoomBy multiplica y resetView vuelve al encaje", async () => {
    const { handle } = setup({ zoom: free });
    await handle().zoomBy(3, { duration: 30 });
    expect(handle().getView().k).toBeCloseTo(3, 6);

    expect(await handle().resetView({ duration: 30 })).toEqual({ completed: true });
    expect(handle().getView().k).toBeCloseTo(1, 6);
  });

  it("encadenar con await: cada vuelo espera al anterior", async () => {
    const { handle } = setup({ zoom: free });
    const log: string[] = [];
    await handle().zoomTo("A", { duration: 30 });
    log.push("A");
    await handle().zoomTo("B", { duration: 30 });
    log.push("B");
    await handle().resetView({ duration: 30 });
    log.push("reset");

    expect(log).toEqual(["A", "B", "reset"]);
    expect(handle().getView().k).toBeCloseTo(1, 6);
  });
});

describe("useChoroplethApi (dentro del compound, sin ref)", () => {
  it("un botón hijo vuela con zoomTo", async () => {
    const Button = () => {
      const api = useChoroplethApi();
      return (
        <button type="button" onClick={() => void api.zoomTo("B", { duration: 30 })}>
          volar a B
        </button>
      );
    };
    const { handle } = setup({ zoom: free }, <Button />);
    fireEvent.click(screen.getByRole("button", { name: "volar a B" }));

    await waitFor(() => expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0));
  });

  it("fuera de Root lanza el error claro", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Orphan = () => {
      useChoroplethApi();
      return null;
    };
    expect(() => render(<Orphan />)).toThrow(/inside <Choropleth.Root>/);
    spy.mockRestore();
  });
});

describe("focusId (declarativo)", () => {
  it("en el primer render coloca la cámara SIN volar y SIN avisar a onViewChange", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { container, handle } = setup({ focusId: "A", zoom: { ...free, onViewChange } });

    expect(cameraOf(container).k).toBeGreaterThan(1); // ya está en A, sin esperar
    expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("al cambiar vuela a la nueva región; con null, vuelve al encaje", async () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const zoom = { ...free, onViewChange };
    const { handle, rerenderWith } = setup({ focusId: "A", zoom });

    rerenderWith({ focusId: "B", zoom });
    await waitFor(() => expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0), {
      timeout: 3000,
    });
    await waitFor(() => expect(onViewChange).toHaveBeenCalledTimes(1));

    rerenderWith({ focusId: null, zoom });
    await waitFor(() => expect(handle().getView().k).toBeCloseTo(1, 3), { timeout: 3000 });
  });

  it("volver a renderizar con el MISMO focusId no vuela otra vez", async () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const zoom = { ...free, onViewChange };
    const { rerenderWith } = setup({ focusId: "A", zoom });
    for (let i = 0; i < 3; i += 1) rerenderWith({ focusId: "A", zoom });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("un focusId inexistente no rompe: avisa y se queda como está", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handle } = setup({ focusId: "ZZ" });

    expect(handle().getView().k).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("si el mapa carga de forma asíncrona, se coloca cuando aparece el <svg>", async () => {
    const { container, handle } = setup({
      geography: Promise.resolve(blocks),
      focusId: "A",
      zoom: free,
    });
    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());

    await waitFor(() => expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0));
  });
});

describe("initialView", () => {
  it("coloca la cámara al montar, sin animar ni avisar", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { handle } = setup({
      zoom: { ...free, initialView: { center: [CENTER_B, CENTER_LAT], zoom: 2 }, onViewChange },
    });

    expect(handle().getView().k).toBeCloseTo(2, 6);
    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("acepta una región", () => {
    const { handle } = setup({ zoom: { ...free, initialView: "B" } });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_B, 0);
  });

  it("focusId manda sobre initialView", () => {
    const { handle } = setup({ focusId: "A", zoom: { ...free, initialView: "B" } });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0);
  });

  it("solo cuenta al montar: cambiarlo después no mueve la cámara", () => {
    const { handle, rerenderWith } = setup({ zoom: { ...free, initialView: "A" } });
    rerenderWith({ zoom: { ...free, initialView: "B" } });

    expect(handle().getView().center[0]).toBeCloseTo(CENTER_A, 0);
  });
});

describe("«reducir movimiento»: fundido en vez de vuelo", () => {
  type FakeAnimation = { keyframes: Keyframe[]; finish: () => void; cancel: () => void };
  const animations: FakeAnimation[] = [];

  beforeEach(() => {
    animations.length = 0;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    Element.prototype.animate = function (keyframes: Keyframe[]) {
      let resolve: () => void = () => {};
      let reject: (reason: unknown) => void = () => {};
      const finished = new Promise<unknown>((res, rej) => {
        resolve = () => res(undefined);
        reject = rej;
      });
      const animation = {
        keyframes,
        finished,
        finish: resolve,
        cancel: () => reject(new DOMException("cancelled", "AbortError")),
      };
      animations.push(animation);
      return animation as unknown as Animation;
    };
  });
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  it("zoomTo se hace con un fundido: la cámara salta a mitad, sin interpolar", async () => {
    const { handle, container } = setup({ zoom: free });
    const flight = handle().zoomTo("A");

    expect(animations).toHaveLength(1);
    expect(animations[0]?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(cameraOf(container).k).toBe(1); // aún no se ha movido

    animations[0]?.finish();
    await waitFor(() => expect(cameraOf(container).k).toBeGreaterThan(1)); // saltó
    expect(animations[1]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);

    animations[1]?.finish();
    expect(await flight).toEqual({ completed: true });
  });

  it("no hay ninguna transición de cámara (solo el fundido)", async () => {
    const { handle, container } = setup({ zoom: free });
    const flight = handle().zoomTo("A");
    animations[0]?.finish();
    await waitFor(() => expect(animations).toHaveLength(2));
    const jumped = cameraOf(container);
    animations[1]?.finish();
    await flight;

    // la cámara no cambia después del salto: no hubo interpolación
    expect(cameraOf(container)).toEqual(jumped);
  });

  it("un movimiento nuevo cancela el fundido anterior (completed: false)", async () => {
    const { handle } = setup({ zoom: free });
    const first = handle().zoomTo("A");
    const second = handle().zoomTo("B");

    expect(await first).toEqual({ completed: false });
    animations[1]?.finish();
    await waitFor(() => expect(animations).toHaveLength(3));
    animations[2]?.finish();
    expect(await second).toEqual({ completed: true });
  });

  it("duration: 0 sigue siendo instantáneo (ni fundido): focusId e initialView no parpadean", () => {
    const { handle } = setup({ focusId: "A", zoom: free });

    expect(animations).toHaveLength(0);
    expect(handle().getView().k).toBeGreaterThan(1);
  });

  it("zoomBy y los botones también usan el fundido", async () => {
    const { handle } = setup({ zoom: free });
    void handle().zoomBy(2);

    expect(animations).toHaveLength(1);
  });

  it("al desmontar a mitad de un fundido, se cancela y resuelve completed: false", async () => {
    const { handle, unmount } = setup({ zoom: free });
    const flight = handle().zoomTo("A");
    unmount();

    expect(await flight).toEqual({ completed: false });
  });
});

describe("encuadres con geodatos reales (world110m)", () => {
  const world = (props: Record<string, unknown> = {}) => {
    const ref = createRef<ChoroplethMapHandle>() as RefObject<ChoroplethMapHandle>;
    render(
      <ChoroplethMap<{ id: string; v: number }>
        ref={ref}
        {...({
          geography: world110m,
          objectName: "countries",
          data: [],
          getId: (r: { id: string }) => r.id,
          getValue: (r: { v: number }) => r.v,
          variant: "sequential",
          filterFeatures: (f: { id?: unknown }) => f.id !== "AQ",
          width: 960,
          height: 500,
          zoom: { constrain: "free", padding: 0, max: 40 },
          diagnostics: false,
          ...props,
        } as unknown as ChoroplethMapProps<{ id: string; v: number }>)}
      />,
    );
    const view = async (id: string) => {
      await ref.current?.zoomTo(id, { duration: 0 });
      return ref.current?.getView() as ViewState;
    };
    return { view };
  };

  it("Francia: encuadra la metrópoli, NO la Guayana ni las islas de ultramar", async () => {
    const { view } = world();
    const v = await view("FR");

    expect(v.bounds[0][0]).toBeGreaterThan(-12); // la Guayana está en −54
    expect(v.bounds[1][0]).toBeLessThan(20);
    expect(v.center[0]).toBeGreaterThan(-3);
    expect(v.center[0]).toBeLessThan(6);
  });

  it("EE. UU.: el territorio continental, no Alaska ni Hawái", async () => {
    const { view } = world();
    const v = await view("US");

    expect(v.bounds[0][0]).toBeGreaterThan(-135); // Alaska llega a −170
    expect(v.center[0]).toBeLessThan(-90);
    expect(v.center[0]).toBeGreaterThan(-110);
  });

  it("España incluye CANARIAS por defecto (decisión de negocio)", async () => {
    const { view } = world();
    const v = await view("ES");

    // El encuadre abarca de las Canarias (−18°) a Menorca (4°): su centro cae al OESTE de la península.
    expect(v.center[0]).toBeLessThan(-5.5);
    expect(v.bounds[0][1]).toBeLessThan(29); // llega hasta ~28° N
  });

  it("focusBounds={{ ES: null }} vuelve a la península (sin Canarias)", async () => {
    const { view } = world({ focusBounds: { ES: null } });
    const v = await view("ES");

    expect(v.center[0]).toBeGreaterThan(-5); // la península está centrada en ~−3,7°
    expect(v.bounds[0][1]).toBeGreaterThan(29); // y no llega a las Canarias (28° N)
  });

  it("focusBounds propio sustituye al de la librería", async () => {
    const { view } = world({
      focusBounds: {
        ES: [
          [-10, 36],
          [4, 44],
        ],
      },
    });
    const v = await view("ES");

    expect(v.center[0]).toBeGreaterThan(-5);
    expect(v.center[0]).toBeLessThan(-1);
  });

  it("Fiyi (cruza el antimeridiano): un encuadre pequeño, no medio mundo", async () => {
    const { view } = world();
    const v = await view("FJ");

    expect(v.k).toBeGreaterThan(8);
    expect(Math.abs(v.center[0])).toBeGreaterThan(170);
  });

  it("Rusia: el cuerpo principal (Chukotka, al otro lado del mapa, queda fuera)", async () => {
    const { view } = world();
    const v = await view("RU");

    expect(v.center[0]).toBeGreaterThan(30);
    expect(v.center[0]).toBeLessThan(120);
  });
});
