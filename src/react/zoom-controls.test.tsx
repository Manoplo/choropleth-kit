import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { twoSquares } from "../../tests/fixtures";
import { es, type ZoomOptions } from "../core";
import { Choropleth } from "./choropleth";
import { ChoroplethMap, type ChoroplethMapProps } from "./choropleth-map";
import { useChoroplethContext } from "./choropleth-context";
import type { RootProps } from "./components/root";
import type { MapStore } from "./map-store";

// Paso 25: botones de zoom, aviso de gesto y teclado.

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

/** Captura el store del mapa para llamar a la API de zoom desde el test. */
let store: MapStore;
const Grab = () => {
  const context = useChoroplethContext();
  // En un efecto (no durante el render): `render()` de RTL ya lo ha ejecutado cuando devuelve.
  useEffect(() => {
    store = context.store;
  }, [context.store]);
  return null;
};

const preset = (props: Record<string, unknown> = {}) =>
  render(<ChoroplethMap<Row> {...({ ...baseProps, ...props } as ChoroplethMapProps<Row>)} />);

const compound = (props: Partial<RootProps<Row>> = {}, children?: React.ReactNode) =>
  render(
    <Choropleth.Root {...({ ...baseProps, ...props } as RootProps<Row>)}>
      <Choropleth.Svg />
      <Grab />
      {children}
    </Choropleth.Root>,
  );

const cameraOf = (container: Element) => {
  const viewport = container.querySelector(".cm-viewport");
  const match = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
    viewport?.getAttribute("transform") ?? "",
  );
  if (match === null) throw new Error("sin transform");
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
};

const button = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const svgOf = (container: Element) => container.querySelector("svg") as SVGSVGElement;
const wheel = (svg: Element, init: WheelEventInit = {}) =>
  fireEvent.wheel(svg, { deltaY: -300, clientX: 100, clientY: 50, ...init });

afterEach(() => vi.unstubAllGlobals());

describe("ZoomControls · opt-in", () => {
  it("el preset NO los dibuja por defecto", () => {
    preset();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    preset({ zoom: true });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("`zoom={{ controls: true }}` dibuja +, − y ⟲ con aria-label (inglés por defecto)", () => {
    preset({ zoom: { controls: true } });

    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Zoom in",
      "Zoom out",
      "Reset view",
    ]);
  });

  it("los textos vienen de `labels` (español)", () => {
    preset({ zoom: { controls: true }, labels: es });

    expect(button(/acercar/i)).toBeTruthy();
    expect(button(/alejar/i)).toBeTruthy();
    expect(button(/restablecer/i)).toBeTruthy();
  });

  it("`reset: false` quita el botón ⟲", () => {
    preset({ zoom: { controls: { reset: false } } });

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /reset/i })).toBeNull();
  });

  it("la esquina es configurable (abajo a la derecha por defecto)", () => {
    const { container } = preset({ zoom: { controls: { position: "top-left" } } });
    const controls = container.querySelector<HTMLElement>(".cm-zoom-controls");

    expect(controls?.style.top).toBe("12px");
    expect(controls?.style.left).toBe("12px");
    preset({ zoom: { controls: true } });
    expect(document.querySelectorAll<HTMLElement>(".cm-zoom-controls")[1]?.style.bottom).toBe(
      "12px",
    );
  });

  it("en el compound se coloca a mano; con zoom={false} no dibuja nada", () => {
    compound({}, <Choropleth.ZoomControls position="top-right" />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("con zoom={false} los controles no se dibujan", () => {
    compound({ zoom: false }, <Choropleth.ZoomControls />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("son <button type=button> reales (no envían formularios)", () => {
    preset({ zoom: { controls: true } });
    for (const b of screen.getAllByRole("button")) expect(b.getAttribute("type")).toBe("button");
  });
});

describe("ZoomControls · comportamiento", () => {
  const controls: ZoomOptions = { controls: true };

  it("en el encaje, `−` y `⟲` están deshabilitados y `+` no", () => {
    preset({ zoom: controls });

    expect(button(/zoom in/i).disabled).toBe(false);
    expect(button(/zoom out/i).disabled).toBe(true);
    expect(button(/reset/i).disabled).toBe(true);
  });

  it("`+` acerca ×2 centrado, y habilita `−` y `⟲` al terminar", async () => {
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));

    await waitFor(() => expect(cameraOf(container).k).toBeCloseTo(2, 3), { timeout: 2000 });
    // centrado en la vista: el centro del lienzo (100, 50) sigue en el centro
    const { k, x, y } = cameraOf(container);
    expect(100 * k + x).toBeCloseTo(100, 3);
    expect(50 * k + y).toBeCloseTo(50, 3);
    await waitFor(() => expect(button(/zoom out/i).disabled).toBe(false));
    expect(button(/reset/i).disabled).toBe(false);
  });

  it("`+` se deshabilita en el máximo", async () => {
    const { container } = preset({ zoom: { ...controls, max: 2 } });
    fireEvent.click(button(/zoom in/i));

    await waitFor(() => expect(button(/zoom in/i).disabled).toBe(true), { timeout: 2000 });
    expect(cameraOf(container).k).toBeCloseTo(2, 3);
  });

  it("`−` aleja y `⟲` vuelve al encaje, y se vuelve a deshabilitar", async () => {
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));
    await waitFor(() => expect(button(/reset/i).disabled).toBe(false), { timeout: 2000 });

    fireEvent.click(button(/reset/i));
    await waitFor(() => expect(button(/reset/i).disabled).toBe(true), { timeout: 3000 });
    expect(cameraOf(container)).toMatchObject({ k: 1 });
    expect(cameraOf(container).x).toBeCloseTo(0, 3);
  });

  it("`−` tras `+` vuelve a k = 1", async () => {
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));
    await waitFor(() => expect(button(/zoom out/i).disabled).toBe(false), { timeout: 2000 });
    fireEvent.click(button(/zoom out/i));

    await waitFor(() => expect(cameraOf(container).k).toBeCloseTo(1, 3), { timeout: 2000 });
  });

  it("un zoom con la rueda también actualiza los botones (cámara confirmada al terminar)", async () => {
    const { container } = preset({ zoom: controls });
    wheel(svgOf(container));

    await waitFor(() => expect(button(/reset/i).disabled).toBe(false), { timeout: 1500 });
  });

  it("onViewChange se llama al terminar cada zoom de los botones", async () => {
    const onViewChange = vi.fn<(view: unknown) => void>();
    preset({ zoom: { controls: true, onViewChange } });
    fireEvent.click(button(/zoom in/i));

    await waitFor(() => expect(onViewChange).toHaveBeenCalledOnce(), { timeout: 2000 });
    expect(onViewChange).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
    );
  });

  it("con «reducir movimiento» el salto es inmediato (sin transición)", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { container } = preset({ zoom: controls });
    fireEvent.click(button(/zoom in/i));

    expect(cameraOf(container).k).toBeCloseTo(2, 6); // sin esperar
  });

  it("pulsar los botones no re-renderiza Root", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    preset({ zoom: controls, getId });
    const before = getId.mock.calls.length;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    fireEvent.click(button(/zoom in/i));

    expect(getId.mock.calls.length).toBe(before);
  });
});

describe("API de zoom (store.getZoom)", () => {
  it("zoomBy devuelve una Promise que resuelve `completed: true` al terminar", async () => {
    const { container } = compound();
    const result = await store.getZoom()?.zoomBy(2, { duration: 50 });

    expect(result).toEqual({ completed: true });
    expect(cameraOf(container).k).toBeCloseTo(2, 3);
  });

  it("si otro movimiento la interrumpe, resuelve `completed: false` (no rechaza)", async () => {
    compound();
    const api = store.getZoom();
    const first = api?.zoomBy(2, { duration: 400 });
    const second = api?.zoomBy(2, { duration: 50 });

    expect(await first).toEqual({ completed: false });
    expect(await second).toEqual({ completed: true });
  });

  it("un gesto del usuario (rueda) interrumpe el vuelo en curso", async () => {
    const { container } = compound();
    await store.getZoom()?.zoomBy(2, { duration: 30 }); // algo que resetear
    const flight = store.getZoom()?.resetView({ duration: 600 });
    wheel(svgOf(container));

    expect(await flight).toEqual({ completed: false });
  });

  it("resetView con duración propia vuela al encaje", async () => {
    const { container } = compound();
    await store.getZoom()?.zoomBy(2, { duration: 30 });
    const result = await store.getZoom()?.resetView({ duration: 50 });

    expect(result).toEqual({ completed: true });
    expect(cameraOf(container).k).toBeCloseTo(1, 3);
  });

  it("resetView sin duración usa la del vuelo (acotada) y también termina", async () => {
    const { container } = compound();
    await store.getZoom()?.zoomBy(4, { duration: 30 });

    expect(await store.getZoom()?.resetView()).toEqual({ completed: true });
    expect(cameraOf(container).k).toBeCloseTo(1, 3);
  });

  it("al desmontar se des-registra y se interrumpe cualquier vuelo", async () => {
    const { unmount } = compound();
    const pending = store.getZoom()?.zoomBy(2, { duration: 500 });
    unmount();

    expect(store.getZoom()).toBeNull();
    expect(await pending).toEqual({ completed: false });
  });

  it("con zoom={false} no hay API", () => {
    compound({ zoom: false });
    expect(store.getZoom()).toBeNull();
  });
});

describe("teclado", () => {
  const key = (svg: Element, init: KeyboardEventInit) => fireEvent.keyDown(svg, init);

  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  });

  it("el <svg> es un tab stop (tabIndex 0) cuando hay atajos", () => {
    const { container } = compound();
    expect(svgOf(container).getAttribute("tabindex")).toBe("0");
  });

  it("+ acerca, − aleja y 0 vuelve al encaje, y se cancela el comportamiento del navegador", () => {
    const { container } = compound();
    const svg = svgOf(container);

    expect(key(svg, { key: "+" })).toBe(false); // `preventDefault` llamado
    expect(cameraOf(container).k).toBeCloseTo(2, 6);
    key(svg, { key: "=" });
    expect(cameraOf(container).k).toBeCloseTo(4, 6);
    key(svg, { key: "-" });
    expect(cameraOf(container).k).toBeCloseTo(2, 6);
    key(svg, { key: "0" });
    expect(cameraOf(container).k).toBeCloseTo(1, 6);
  });

  it("Ctrl/⌘ + tecla NO se intercepta (es el zoom de la página)", () => {
    const { container } = compound();
    const svg = svgOf(container);

    expect(key(svg, { key: "+", ctrlKey: true })).toBe(true);
    expect(key(svg, { key: "-", metaKey: true })).toBe(true);
    expect(cameraOf(container).k).toBe(1);
  });

  it("otras teclas no se tocan (Tab sigue funcionando)", () => {
    const { container } = compound();

    expect(key(svgOf(container), { key: "Tab" })).toBe(true);
    expect(key(svgOf(container), { key: "a" })).toBe(true);
  });

  it("zoom={{ keyboard: false }} y zoom={false}: sin tab stop ni atajos", () => {
    const off = compound({ zoom: { keyboard: false } });
    expect(svgOf(off.container).hasAttribute("tabindex")).toBe(false);
    expect(key(svgOf(off.container), { key: "+" })).toBe(true);
    off.unmount();

    const none = compound({ zoom: false });
    expect(svgOf(none.container).hasAttribute("tabindex")).toBe(false);
  });

  it("el teclado no re-renderiza Root", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { container } = compound({ getId });
    const before = getId.mock.calls.length;
    key(svgOf(container), { key: "+" });

    expect(getId.mock.calls.length).toBe(before);
  });
});

describe("GestureHint", () => {
  const cooperative: ZoomOptions = { wheel: "cooperative" };
  const hint = (container: Element) => container.querySelector(".cm-gesture-hint") as HTMLElement;

  it("el preset lo incluye, oculto y aria-hidden", () => {
    const { container } = preset({ zoom: cooperative });

    expect(hint(container)).not.toBeNull();
    expect(hint(container).getAttribute("aria-hidden")).toBe("true");
    expect(hint(container).hasAttribute("data-visible")).toBe(false);
  });

  it("rueda sin modificador en cooperative: aparece «Ctrl + rueda» y se apaga solo", () => {
    vi.useFakeTimers();
    const { container } = preset({ zoom: cooperative });
    wheel(svgOf(container));

    expect(hint(container).hasAttribute("data-visible")).toBe(true);
    expect(hint(container).textContent).toBe("Use Ctrl + scroll to zoom");

    act(() => void vi.advanceTimersByTime(1600));
    expect(hint(container).hasAttribute("data-visible")).toBe(false);
    // el texto se conserva durante el fundido de salida
    expect(hint(container).textContent).toBe("Use Ctrl + scroll to zoom");
    vi.useRealTimers();
  });

  it("en macOS pone ⌘", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const { container } = preset({ zoom: cooperative });
    wheel(svgOf(container));

    expect(hint(container).textContent).toBe("Use ⌘ + scroll to zoom");
    vi.restoreAllMocks();
  });

  it("un dedo en cooperative: «dos dedos»", () => {
    const { container } = preset({ zoom: cooperative });
    fireEvent.touchStart(svgOf(container), { touches: [{ clientX: 10, clientY: 10 }] });

    expect(hint(container).hasAttribute("data-visible")).toBe(true);
    expect(hint(container).textContent).toBe("Use two fingers to move the map");
  });

  it("los textos vienen de `labels`", () => {
    const { container } = preset({ zoom: cooperative, labels: es });
    wheel(svgOf(container));

    expect(hint(container).textContent).toBe("Usa Ctrl + rueda para hacer zoom");
  });

  it("con `always` (por defecto) la rueda hace zoom y NO hay aviso", () => {
    const { container } = preset();
    wheel(svgOf(container));

    expect(hint(container).hasAttribute("data-visible")).toBe(false);
  });

  it("con Ctrl + rueda en cooperative hace zoom y tampoco avisa", () => {
    const { container } = preset({ zoom: cooperative });
    wheel(svgOf(container), { ctrlKey: true });

    expect(hint(container).hasAttribute("data-visible")).toBe(false);
    expect(cameraOf(container).k).toBeGreaterThan(1);
  });

  it("el compound lo ofrece como pieza (`<Choropleth.GestureHint>`)", () => {
    const { container } = compound({ zoom: cooperative }, <Choropleth.GestureHint />);
    wheel(svgOf(container));

    expect(container.querySelector(".cm-gesture-hint[data-visible]")).not.toBeNull();
  });
});
