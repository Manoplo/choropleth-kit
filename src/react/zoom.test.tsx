import { act, createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import type { ViewState, ZoomOptions } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";

// Paso 24: zoom y pan con d3-zoom. jsdom no tiene layout, pero d3-zoom solo necesita eventos y el
// tamaño que le damos (`extent`), así que los gestos se pueden simular con fidelidad suficiente.

type Row = { code: string; v: number | null };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const baseProps = {
  geography: twoSquares,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const mapElement = (props: Partial<RootProps<Row>>) => (
  <Choropleth.Root {...({ ...baseProps, ...props } as RootProps<Row>)}>
    <Choropleth.Svg />
  </Choropleth.Root>
);

const setup = (props: Partial<RootProps<Row>> = {}) => {
  const utils = render(mapElement(props));
  const get = () => ({
    svg: utils.container.querySelector("svg") as SVGSVGElement,
    viewport: utils.container.querySelector(".cm-viewport") as SVGGElement,
    root: utils.container.querySelector(".cm-root") as HTMLElement,
    path: (id: string) => utils.container.querySelector(`[data-region-id="${id}"]`) as Element,
  });
  return {
    ...utils,
    ...get(),
    get,
    rerenderWith: (p: Partial<RootProps<Row>>) => utils.rerender(mapElement(p)),
  };
};

/** `{ k, x, y }` del atributo `transform` que escribe d3-zoom. */
const cameraOf = (viewport: Element) => {
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport.getAttribute("transform") ?? "",
  );
  if (match === null)
    throw new Error(`transform inesperado: ${viewport.getAttribute("transform")}`);
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

/** d3-zoom guarda su estado en `svg.__zoom`: la identidad del objeto delata si se reinstaló. */
const zoomStateOf = (svg: Element) => (svg as unknown as { __zoom: unknown }).__zoom;

const wheel = (svg: Element, init: WheelEventInit = {}) =>
  fireEvent.wheel(svg, { deltaY: -300, clientX: 100, clientY: 50, ...init });

/** La rueda de d3-zoom termina el gesto 150 ms después del último evento. */
const endWheel = () => act(() => void vi.advanceTimersByTime(200));

// d3-zoom engancha `mousemove`/`mouseup` a `event.view`. jsdom no deja pasar `view` en el constructor
// del evento (no reconoce el `window` de vitest como un Window), así que se fija después de crearlo.
const mouse = (
  type: "mouseDown" | "mouseMove" | "mouseUp",
  target: Element | Window,
  init: MouseEventInit,
) => {
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "view", { value: window });
  return fireEvent(target, event);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  // d3-zoom quita su supresor de clic (tras un arrastre) con `setTimeout(…, 0)`. Con temporizadores
  // falsos no correría nunca, y el supresor se quedaría en la `window` compartida tragándose el clic
  // del test siguiente. En un navegador real sí se ejecuta.
  if (vi.isFakeTimers()) act(() => void vi.runOnlyPendingTimers());
  vi.useRealTimers();
});

describe("Viewport y montaje", () => {
  it("Svg envuelve las capas por defecto en `.cm-viewport` (la cámara)", () => {
    const { svg, viewport, path } = setup();

    expect(svg.contains(viewport)).toBe(true);
    expect(viewport.contains(path("A"))).toBe(true);
    expect(viewport.querySelector(".cm-borders")).not.toBeNull();
    expect(viewport.querySelector(".cm-selection")).not.toBeNull();
  });

  it("al montar, d3-zoom escribe el transform inicial (el encaje) y `--cm-k`", () => {
    const { viewport, root } = setup();

    expect(cameraOf(viewport)).toEqual({ x: 0, y: 0, k: 1 });
    expect(root.style.getPropertyValue("--cm-k")).toBe("1");
    expect(root.hasAttribute("data-zoomed")).toBe(false);
  });

  it("zoom={false}: no hay comportamiento de zoom (la rueda no hace nada)", () => {
    const { svg, viewport } = setup({ zoom: false });

    expect(viewport.hasAttribute("transform")).toBe(false);
    wheel(svg);
    endWheel();
    expect(viewport.hasAttribute("transform")).toBe(false);
  });

  it("un `zoom` con min > max lanza un error claro", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => setup({ zoom: { min: 5, max: 2 } })).toThrow(/\[choropleth\] zoom/);
    spy.mockRestore();
  });
});

describe("rueda", () => {
  it("por defecto (always): la rueda sin modificador hace zoom anclado al cursor", () => {
    const { svg, viewport, root } = setup();
    wheel(svg);

    const { k, x, y } = cameraOf(viewport);
    expect(k).toBeGreaterThan(1);
    // Zoom anclado al cursor (100, 50): el punto del lienzo que había debajo sigue debajo.
    expect(100 * k + x).toBeCloseTo(100, 6);
    expect(50 * k + y).toBeCloseTo(50, 6);
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
    expect(root.style.getPropertyValue("--cm-k")).toBe(String(k));
    expect(root.hasAttribute("data-zoomed")).toBe(true);
  });

  it("`data-interacting` vale durante el gesto y se quita al terminar; la cámara se confirma", () => {
    const { svg, root } = setup();
    wheel(svg);
    expect(root.hasAttribute("data-interacting")).toBe(true);

    endWheel();
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("onViewChange llega UNA vez, al terminar, con un ViewState geográfico", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    const { svg } = setup({ zoom: { onViewChange } });

    wheel(svg);
    wheel(svg);
    wheel(svg);
    expect(onViewChange).not.toHaveBeenCalled(); // nunca por frame
    endWheel();

    expect(onViewChange).toHaveBeenCalledOnce();
    const [view] = onViewChange.mock.calls[0] ?? [];
    expect(view?.k).toBeGreaterThan(1);
    expect(view?.zoom).toBe(view?.k);
    expect(view?.level).toEqual({ id: "root", depth: 0 });
    expect(Number.isFinite(view?.center[0])).toBe(true);
  });

  it("no avisa al montar (la restauración de la cámara no es un gesto)", () => {
    const onViewChange = vi.fn<(view: ViewState) => void>();
    setup({ zoom: { onViewChange } });
    act(() => void vi.runAllTimers());

    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("respeta los límites min y max", () => {
    const { svg, viewport } = setup({ zoom: { max: 3 } });
    for (let i = 0; i < 20; i += 1) wheel(svg, { deltaY: -1000 });
    endWheel();

    expect(cameraOf(viewport).k).toBe(3);
  });

  it("alejar más allá del encaje no hace nada (min = 1)", () => {
    const { svg, viewport } = setup();
    wheel(svg, { deltaY: 1000 });
    endWheel();

    expect(cameraOf(viewport)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("never: la rueda no hace zoom", () => {
    const { svg, viewport } = setup({ zoom: { wheel: "never" } });
    wheel(svg);
    endWheel();

    expect(cameraOf(viewport).k).toBe(1);
  });

  describe("cooperative", () => {
    const cooperative: ZoomOptions = { wheel: "cooperative" };

    it("la rueda sin modificador NO hace zoom, NO cancela el scroll de la página y enseña el aviso", () => {
      const { svg, viewport, root } = setup({ zoom: cooperative });
      const notPrevented = wheel(svg);

      expect(notPrevented).toBe(true); // `preventDefault` no se llamó: la página sigue haciendo scroll
      expect(cameraOf(viewport).k).toBe(1);
      expect(root.hasAttribute("data-interacting")).toBe(false);
    });

    it("el aviso de gesto se muestra y se apaga solo", () => {
      const { svg } = setup({ zoom: cooperative });
      const hints: (string | null)[] = [];
      wheel(svg);
      // el store no es público: se observa a través del DOM de la cámara y del temporizador
      hints.push("wheel");
      act(() => void vi.advanceTimersByTime(2000));

      expect(hints).toEqual(["wheel"]);
    });

    it("con Ctrl o ⌘ sí hace zoom", () => {
      const ctrl = setup({ zoom: cooperative });
      wheel(ctrl.svg, { ctrlKey: true });
      expect(cameraOf(ctrl.viewport).k).toBeGreaterThan(1);
      ctrl.unmount();

      const meta = setup({ zoom: cooperative });
      wheel(meta.svg, { metaKey: true });
      expect(cameraOf(meta.viewport).k).toBeGreaterThan(1);
    });

    it("devuelve `touch-action` al navegador para que un dedo siga haciendo scroll", () => {
      const { svg } = setup({ zoom: cooperative });
      expect(svg.style.touchAction).toBe("pan-x pan-y");
    });

    it("en el resto de modos no se toca `touch-action` (d3 lo gestiona)", () => {
      expect(setup().svg.style.touchAction).not.toBe("pan-x pan-y");
    });
  });
});

describe("arrastre (pan) y clic", () => {
  const drag = (svg: Element, from: [number, number], to: [number, number]) => {
    mouse("mouseDown", svg, { clientX: from[0], clientY: from[1], button: 0 });
    mouse("mouseMove", window, { clientX: to[0], clientY: to[1] });
    mouse("mouseUp", window, { clientX: to[0], clientY: to[1] });
  };

  it("con k = 1 y `contain` no hay nada que arrastrar", () => {
    const { svg, viewport } = setup();
    drag(svg, [100, 50], [160, 80]);

    expect(cameraOf(viewport)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("ampliado, arrastrar desplaza el mapa; no se puede arrastrar fuera de los límites", () => {
    const { svg, viewport } = setup({ zoom: { max: 4 } });
    wheel(svg, { deltaY: -2000 }); // k = 4
    endWheel();
    const before = cameraOf(viewport);

    drag(svg, [100, 50], [90, 45]);
    const after = cameraOf(viewport);
    expect(after.k).toBe(before.k);
    expect(after.x).toBeLessThan(before.x);

    // Un arrastre enorme hacia el otro lado se queda en el borde: x ≤ 0 e y ≤ 0.
    drag(svg, [0, 0], [5000, 5000]);
    const edge = cameraOf(viewport);
    expect(edge.x).toBeLessThanOrEqual(0);
    expect(edge.y).toBeLessThanOrEqual(0);
  });

  it("pan = false: no se puede arrastrar aunque esté ampliado", () => {
    const { svg, viewport } = setup({ zoom: { pan: false } });
    wheel(svg, { deltaY: -2000 });
    endWheel();
    const before = cameraOf(viewport);
    drag(svg, [100, 50], [60, 20]);

    expect(cameraOf(viewport)).toEqual(before);
  });

  it("un clic con 2 px de temblor sigue siendo un clic", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const { svg, path } = setup({ onItemClick });
    drag(svg, [100, 50], [102, 51]);
    fireEvent.click(path("A"));

    expect(onItemClick).toHaveBeenCalledOnce();
  });

  it("un arrastre de verdad NO produce clic (no se selecciona al soltar)", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const { svg, path } = setup({ onItemClick });
    drag(svg, [100, 50], [140, 50]);
    fireEvent.click(path("A"));

    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("pulsar NO marca `data-interacting`: si quitara los eventos a las regiones, el `click` caería en el <svg>", () => {
    // Regresión (solo se veía en un navegador real): d3-zoom emite `start` en el `mousedown`. Si ahí se marca
    // `interacting`, el CSS pone `pointer-events: none` en las regiones, el `mouseup` aterriza en el <svg> y el
    // `click` nunca llega a la región: ningún clic funcionaba.
    const { svg, root } = setup();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    expect(root.hasAttribute("data-interacting")).toBe(false);
    mouse("mouseUp", window, { clientX: 100, clientY: 50 });
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("un temblor de 3 px (por debajo del umbral de clic) tampoco lo marca", () => {
    const { svg, root } = setup();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    mouse("mouseMove", window, { clientX: 102, clientY: 52 });

    expect(root.hasAttribute("data-interacting")).toBe(false);
    mouse("mouseUp", window, { clientX: 102, clientY: 52 });
  });

  it("al ARRASTRAR de verdad (más de 4 px) sí está `data-interacting`, y al soltar se quita", () => {
    const { svg, root } = setup({ zoom: { max: 4 } });
    wheel(svg, { deltaY: -2000 }); // con k = 1 y `contain` no hay nada que arrastrar
    endWheel();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    mouse("mouseMove", window, { clientX: 130, clientY: 50 });
    expect(root.hasAttribute("data-interacting")).toBe(true);
    mouse("mouseUp", window, { clientX: 130, clientY: 50 });
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("la rueda marca `data-interacting` en cuanto hay zoom", () => {
    const { svg, root } = setup();
    wheel(svg);

    expect(root.hasAttribute("data-interacting")).toBe(true);
    endWheel();
    expect(root.hasAttribute("data-interacting")).toBe(false);
  });

  it("el botón secundario no arrastra", () => {
    const { svg, root } = setup();
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 2 });

    expect(root.hasAttribute("data-interacting")).toBe(false);
  });
});

describe("doble clic", () => {
  beforeEach(() => vi.useRealTimers());

  it("sin clic con otro significado, hace zoom ×2", async () => {
    const { svg, viewport } = setup();
    fireEvent.dblClick(svg, { clientX: 100, clientY: 50 });

    await waitFor(() => expect(cameraOf(viewport).k).toBeCloseTo(2, 1), { timeout: 1500 });
  });

  it("con onItemClick («auto») está desactivado: no se hace clic Y zoom a la vez", async () => {
    const { svg, viewport } = setup({ onItemClick: () => {} });
    fireEvent.dblClick(svg, { clientX: 100, clientY: 50 });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(cameraOf(viewport).k).toBe(1);
  });

  it("doubleClick: true lo fuerza aunque haya onItemClick", async () => {
    const { svg, viewport } = setup({ onItemClick: () => {}, zoom: { doubleClick: true } });
    fireEvent.dblClick(svg, { clientX: 100, clientY: 50 });

    await waitFor(() => expect(cameraOf(viewport).k).toBeGreaterThan(1), { timeout: 1500 });
  });
});

describe("rendimiento: el zoom no toca React", () => {
  // `getId` se llama una vez por fila en CADA render de `useChoropleth`: es un contador de renders
  // de `Root` sin tocar el código de producción (ver el test del paso 15).
  it("ni la rueda ni el arrastre re-renderizan Root durante el gesto", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { svg } = setup({ getId, zoom: { max: 4 } });
    const before = getId.mock.calls.length;

    for (let i = 0; i < 10; i += 1) wheel(svg, { deltaY: -50 });
    mouse("mouseDown", svg, { clientX: 100, clientY: 50, button: 0 });
    mouse("mouseMove", window, { clientX: 80, clientY: 40 });
    mouse("mouseMove", window, { clientX: 60, clientY: 30 });

    expect(getId.mock.calls.length).toBe(before);
    mouse("mouseUp", window, { clientX: 60, clientY: 30 });
  });

  it("tampoco al TERMINAR el gesto (la cámara confirmada solo toca el store)", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { svg } = setup({ getId });
    const before = getId.mock.calls.length;
    wheel(svg);
    endWheel();

    expect(getId.mock.calls.length).toBe(before);
  });
});

describe("React no pisa la cámara", () => {
  it("un render del consumidor (datos nuevos) en mitad de un zoom no reinicia el transform", () => {
    const { svg, viewport, rerenderWith } = setup();
    wheel(svg);
    const zoomed = viewport.getAttribute("transform");
    expect(zoomed).not.toBe("translate(0,0) scale(1)");

    rerenderWith({ data: [{ code: "A", v: 100 }] });

    expect(viewport.getAttribute("transform")).toBe(zoomed);
  });

  it("opciones en línea con los mismos valores NO reinstalan d3-zoom (dependencias primitivas)", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 6 } });
    wheel(svg);
    endWheel();
    const zoomed = viewport.getAttribute("transform");
    const before = zoomStateOf(svg);

    rerenderWith({ zoom: { max: 6 } }); // objeto NUEVO, mismos valores

    expect(zoomStateOf(svg)).toBe(before);
    expect(viewport.getAttribute("transform")).toBe(zoomed);
  });

  it("al cambiar una opción se reinstala y se RESTAURA la cámara confirmada, sin animación", () => {
    const { svg, viewport, rerenderWith } = setup({ zoom: { max: 6 } });
    wheel(svg);
    endWheel();
    const zoomed = cameraOf(viewport);

    rerenderWith({ zoom: { max: 9 } });

    expect(cameraOf(viewport)).toEqual(zoomed);
    // y el nuevo límite está en vigor
    for (let i = 0; i < 30; i += 1) wheel(svg, { deltaY: -1000 });
    endWheel();
    expect(cameraOf(viewport).k).toBe(9);
  });

  it("cambiar el tamaño reinstala y conserva la cámara confirmada", () => {
    const { svg, viewport, rerenderWith } = setup();
    wheel(svg);
    endWheel();
    const zoomed = cameraOf(viewport);

    rerenderWith({ width: 400, height: 200 });

    expect(cameraOf(viewport).k).toBe(zoomed.k);
  });

  it("zoom true → false quita los gestos", () => {
    const { svg, viewport, rerenderWith } = setup();
    rerenderWith({ zoom: false });
    wheel(svg);
    endWheel();

    expect(cameraOf(viewport).k).toBe(1);
  });
});

describe("carga asíncrona", () => {
  it("el zoom se engancha cuando aparece el <svg> tras cargar la geometría", async () => {
    vi.useRealTimers();
    const { container } = render(mapElement({ geography: Promise.resolve(twoSquares) }));
    expect(container.querySelector("svg")).toBeNull();

    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    const svg = container.querySelector("svg") as SVGSVGElement;
    const viewport = container.querySelector(".cm-viewport") as SVGGElement;
    fireEvent.wheel(svg, { deltaY: -300, clientX: 100, clientY: 50 });

    expect(cameraOf(viewport).k).toBeGreaterThan(1);
  });
});
