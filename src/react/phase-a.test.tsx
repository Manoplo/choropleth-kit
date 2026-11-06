import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { Feature, FeatureCollection } from "geojson";
import { twoSquares } from "../../tests/fixtures";
import { createProjection, es } from "../core";
import { Choropleth } from "./choropleth";
import type { RootProps } from "./components/root";
import { world110m, worldFallbackPoints } from "../geo";
import { clearGeographyCache } from "./use-geography";
import { useChoropleth, type UseChoroplethOptions } from "./use-choropleth";

// Pruebas de la fase A (pasos 17-22 del diario): selección, dimOthers, labels, geometría robusta,
// geografía asíncrona, `data: undefined`, microestados y anclas.

type Row = { code: string; v: number | null };
const rows: Row[] = [
  { code: "A", v: 1 },
  { code: "B", v: 9 },
];

const base = {
  geography: twoSquares,
  data: rows,
  getId: (r: Row) => r.code,
  getValue: (r: Row) => r.v,
  variant: "sequential",
  width: 200,
  height: 100,
} as const;

const hook = (props: Partial<UseChoroplethOptions<Row>> = {}) =>
  renderHook(
    (p: Partial<UseChoroplethOptions<Row>>) =>
      useChoropleth<Row>({ ...base, ...p } as UseChoroplethOptions<Row>),
    { initialProps: props },
  );

const renderMap = (props: Partial<RootProps<Row>> = {}, children?: React.ReactNode) => {
  const utils = render(
    <Choropleth.Root {...({ ...base, ...props } as RootProps<Row>)}>
      {children ?? (
        <>
          <Choropleth.Svg />
          <Choropleth.Tooltip />
        </>
      )}
    </Choropleth.Root>,
  );
  const path = (id: string) => utils.container.querySelector(`[data-region-id="${id}"]`) as Element;
  const root = utils.container.querySelector(".cm-root") as HTMLElement;
  return { ...utils, path, root };
};

const polygon = (lon0: number, lat0: number, lon1: number, lat1: number) => [
  [
    [lon0, lat0],
    [lon0, lat1],
    [lon1, lat1],
    [lon1, lat0],
    [lon0, lat0],
  ],
];
const feature = (id: string | undefined, ...polygons: number[][][][]): Feature => ({
  type: "Feature",
  ...(id === undefined ? {} : { id }),
  properties: { name: `Name ${id ?? "?"}` },
  geometry:
    polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] ?? [] }
      : { type: "MultiPolygon", coordinates: polygons },
});
const collection = (...features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

describe("paso 17 · selección", () => {
  it("sin ninguna prop de selección, un clic no selecciona ni cambia el cursor", () => {
    const { path, root, container } = renderMap();
    fireEvent.click(path("A"));

    expect(container.querySelector('[data-selection="selected"]')).toBeNull();
    expect(root.hasAttribute("data-has-selection")).toBe(false);
    expect(container.querySelector<HTMLElement>(".cm-regions")?.style.cursor).toBe("");
  });

  it("no controlada: defaultSelectedId, clic cambia, clic en la seleccionada la quita", () => {
    const onSelectedIdChange = vi.fn<(id: string | null) => void>();
    const { path, container, root } = renderMap({ defaultSelectedId: "A", onSelectedIdChange });
    const selected = () => container.querySelector('[data-selection="selected"]');

    expect(selected()).not.toBeNull();
    expect(root.hasAttribute("data-has-selection")).toBe(true);

    fireEvent.click(path("B"));
    expect(onSelectedIdChange).toHaveBeenLastCalledWith("B");
    expect(selected()?.getAttribute("d")).toBe(path("B").getAttribute("d"));

    fireEvent.click(path("B"));
    expect(onSelectedIdChange).toHaveBeenLastCalledWith(null);
    expect(selected()).toBeNull();
    expect(root.hasAttribute("data-has-selection")).toBe(false);
  });

  it("controlada: solo avisa; el valor lo manda el consumidor (null = nada)", () => {
    const onSelectedIdChange = vi.fn<(id: string | null) => void>();
    const { path, container, rerender } = renderMap({ selectedId: null, onSelectedIdChange });

    fireEvent.click(path("A"));
    expect(onSelectedIdChange).toHaveBeenCalledWith("A");
    expect(container.querySelector('[data-selection="selected"]')).toBeNull();

    rerender(
      <Choropleth.Root {...({ ...base, selectedId: "A", onSelectedIdChange } as RootProps<Row>)}>
        <Choropleth.Svg />
      </Choropleth.Root>,
    );
    expect(container.querySelector('[data-selection="selected"]')).not.toBeNull();
  });

  it("onItemClick sigue llamándose, también con selección", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const { path } = renderMap({ defaultSelectedId: null, onItemClick });
    fireEvent.click(path("A"));

    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ kind: "region", id: "A" }));
  });

  it("setSelectedId del hook cambia (o avisa) sin pasar por un clic", () => {
    const { result } = hook({ defaultSelectedId: "A" });
    expect(result.current.selectedId).toBe("A");
    act(() => result.current.setSelectedId("B"));
    expect(result.current.selectedId).toBe("B");
    act(() => result.current.setSelectedId(null));
    expect(result.current.selectedId).toBeNull();
  });

  it("los puntos no se seleccionan, aunque su id coincida con el de una región", () => {
    const { container, root } = renderMap({
      defaultSelectedId: null,
      variant: "bubble",
      data: [{ code: "A", sales: 5, at: [0.5, 0.5] }],
      getValue: (r: unknown) => (r as { sales: number }).sales,
      getCoordinates: (r: unknown) => (r as { at: [number, number] }).at,
    } as never);
    fireEvent.click(container.querySelector('[data-point-id="A"]') as Element);

    expect(root.hasAttribute("data-has-selection")).toBe(false);
  });
});

describe("paso 17 · dimOthers", () => {
  it("por defecto «selection»; la copia resaltada lleva el color de su región", () => {
    const { root, container, path } = renderMap({ defaultSelectedId: "A" });

    expect(root.getAttribute("data-dim")).toBe("selection");
    const copy = container.querySelector<SVGElement>('[data-selection="selected"]');
    expect(copy?.style.fill).toBe((path("A") as SVGElement).style.fill);
  });

  it("el modo llega al contenedor", () => {
    expect(renderMap({ dimOthers: "never" }).root.getAttribute("data-dim")).toBe("never");
    expect(renderMap({ dimOthers: "hover-and-selection" }).root.getAttribute("data-dim")).toBe(
      "hover-and-selection",
    );
  });

  it("atenuar no re-renderiza las regiones: solo cambia un atributo del contenedor", () => {
    const getId = vi.fn<(r: Row) => string>((r) => r.code);
    const { path, root } = renderMap({ getId, defaultSelectedId: null });
    const before = path("A");

    fireEvent.click(path("A"));
    expect(root.hasAttribute("data-has-selection")).toBe(true);
    // El mismo <path> sigue en el DOM (no se recreó) y conserva su color.
    expect(path("A")).toBe(before);
  });
});

describe("paso 18 · labels", () => {
  it("inglés por defecto; `es` y textos sueltos se aplican al tooltip", () => {
    const geo = collection(feature("Z", polygon(0, 0, 1, 1)));
    const props = { geography: geo, data: [] as Row[] };

    const first = renderMap(props);
    fireEvent.pointerOver(first.path("Z"));
    fireEvent.pointerMove(first.path("Z"), { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("No data");
    first.unmount();

    const second = renderMap({ ...props, labels: es });
    fireEvent.pointerOver(second.path("Z"));
    fireEvent.pointerMove(second.path("Z"), { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("Sin dato");
    second.unmount();

    const third = renderMap({ ...props, labels: { noData: "—" } });
    fireEvent.pointerOver(third.path("Z"));
    fireEvent.pointerMove(third.path("Z"), { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("—");
  });
});

describe("paso 19 · geometría robusta", () => {
  const withAnonymous = collection(
    feature("A", polygon(0, 0, 1, 1)),
    feature(undefined, polygon(1, 0, 2, 1)),
    feature("B", polygon(2, 0, 3, 1)),
  );

  it("las regiones sin id se pintan (sin agujeros) pero no son regiones", () => {
    const { result } = hook({ geography: withAnonymous, data: [] });

    expect(result.current.regions.map((r) => r.id)).toEqual(["A", "B"]);
    expect(result.current.anonymousPaths).toHaveLength(1);
  });

  it("capa no interactiva: en emptyFill, sin data-region-id y sin cursor de clic", () => {
    const { container, path } = renderMap({
      geography: withAnonymous,
      data: [],
      onItemClick: () => {},
    });
    const anon = container.querySelector<SVGElement>(".cm-region--anonymous");

    expect(anon).not.toBeNull();
    expect(anon?.hasAttribute("data-region-id")).toBe(false);
    expect(anon?.style.fill).toContain("--cm-empty-fill");
    expect(anon?.style.cursor).toBe("default");

    // Pasar el cursor por ella quita el hover de la región anterior.
    fireEvent.pointerOver(path("A"));
    expect(container.querySelector('[data-selection="hover"]')).not.toBeNull();
    fireEvent.pointerOver(anon as Element);
    expect(container.querySelector('[data-selection="hover"]')).toBeNull();
  });

  it("filterFeatures descarta regiones y sus fronteras, aunque la función sea en línea", () => {
    const { result, rerender } = hook({
      filterFeatures: (f) => f.id !== "B",
    });
    expect(result.current.regions.map((r) => r.id)).toEqual(["A"]);
    expect(result.current.borders).toBeNull(); // sin frontera compartida no queda línea

    // Nueva identidad de la función con el mismo resultado: la geometría no se recalcula.
    const before = result.current.regions[0]?.feature;
    rerender({ filterFeatures: (f) => f.id !== "B" });
    expect(result.current.regions[0]?.feature).toBe(before);

    rerender({ filterFeatures: () => true });
    expect(result.current.regions.map((r) => r.id)).toEqual(["A", "B"]);
  });

  it("aspectRatio «auto»: una geometría alta da un mapa alto, y una ancha, uno ancho", () => {
    const tall = hook({
      geography: collection(feature("T", polygon(0, 0, 2, 20))),
      aspectRatio: "auto",
      width: undefined,
      height: undefined,
    });
    const wide = hook({
      geography: collection(feature("W", polygon(0, 0, 40, 2))),
      aspectRatio: "auto",
      width: undefined,
      height: undefined,
    });

    expect(tall.result.current.height).toBeGreaterThan(tall.result.current.width);
    expect(wide.result.current.width).toBeGreaterThan(wide.result.current.height * 3);
  });

  it("aspectRatio numérico y por defecto se respetan", () => {
    const numeric = hook({ aspectRatio: 4, width: undefined, height: undefined });
    expect(numeric.result.current.height).toBe(numeric.result.current.width / 4);
    const byDefault = hook({ width: undefined, height: undefined });
    expect(byDefault.result.current.height).toBeCloseTo(500);
  });
});

describe("paso 20 · anclas de burbuja en el cuerpo principal", () => {
  it("la burbuja de una región con un territorio lejano cae en el cuerpo principal", () => {
    const fr = feature("FR", polygon(0, 40, 10, 50), polygon(-55, 3, -52, 5));
    const geo = collection(fr);
    const { result } = hook({
      geography: geo,
      data: [{ code: "FR", v: 10 }],
      variant: "bubble",
    });

    const projection = createProjection({ width: 200, height: 100, featureCollection: geo });
    const [mx, my] = projection([5, 45]) ?? [NaN, NaN];
    const bubble = result.current.bubbles[0];
    expect(bubble).toBeDefined();
    expect(Math.hypot((bubble?.x ?? 0) - mx, (bubble?.y ?? 0) - my)).toBeLessThan(6);
  });
});

describe("paso 21 · geografía asíncrona", () => {
  beforeEach(() => clearGeographyCache());

  it("promesa: esqueleto con la proporción del mapa, y luego el mapa", async () => {
    const { container, root } = renderMap({ geography: Promise.resolve(twoSquares) });

    expect(root.getAttribute("data-status")).toBe("loading");
    const skeleton = container.querySelector<HTMLElement>(".cm-skeleton");
    expect(skeleton?.style.aspectRatio).toBe("200 / 100");
    expect(container.querySelector("svg")).toBeNull();

    await waitFor(() => expect(container.querySelector("svg")).not.toBeNull());
    expect(root.getAttribute("data-status")).toBe("ready");
    expect(container.querySelector(".cm-skeleton")).toBeNull();
  });

  it("función que importa un módulo: acepta `{ default }` y el estado pasa a ready", async () => {
    const loader = () => Promise.resolve({ default: twoSquares });
    const { result } = hook({ geography: loader });

    expect(result.current.status).toBe("loading");
    expect(result.current.regions).toEqual([]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.regions.map((r) => r.id)).toEqual(["A", "B"]);
  });

  it("geographyKey: dos mapas con la misma clave cargan UNA vez, y el segundo no parpadea", async () => {
    const loader = vi.fn<() => Promise<typeof twoSquares>>(() => Promise.resolve(twoSquares));
    const first = hook({ geography: loader, geographyKey: "squares" });
    await waitFor(() => expect(first.result.current.status).toBe("ready"));

    const second = hook({ geography: loader, geographyKey: "squares" });
    expect(second.result.current.status).toBe("ready"); // ya en caché: sin esqueleto
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("un cargador en línea (identidad nueva en cada render) no entra en bucle", async () => {
    const { result, rerender } = renderHook(() =>
      useChoropleth<Row>({
        ...base,
        geography: () => Promise.resolve(twoSquares),
      } as UseChoroplethOptions<Row>),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender();
    rerender();
    expect(result.current.status).toBe("ready");
  });

  it("si falla: estado error, onGeographyError y mensaje accesible", async () => {
    const onGeographyError = vi.fn<(error: Error) => void>();
    const { container, root } = renderMap({
      geography: () => Promise.reject(new Error("boom")),
      onGeographyError,
    });

    await waitFor(() => expect(root.getAttribute("data-status")).toBe("error"));
    expect(onGeographyError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The map could not be loaded.",
    );
  });

  it("sin onGeographyError, el fallo se avisa por consola (en inglés)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = hook({ geography: () => Promise.reject("nope") });
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(spy).toHaveBeenCalledWith("[choropleth] Failed to load geography: nope");
    spy.mockRestore();
  });

  it("si se descarta antes de resolver, no actualiza un componente desmontado", async () => {
    let resolve: (value: typeof twoSquares) => void = () => {};
    const loader = () => new Promise<typeof twoSquares>((r) => (resolve = r));
    const { unmount } = hook({ geography: loader });
    unmount();
    expect(() => resolve(twoSquares)).not.toThrow();
  });
});

describe("paso 21 · data undefined = cargando", () => {
  it("sin datos aún: mapa en gris, pulso (data-loading) y sin avisos de consola", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, container } = renderMap({ data: undefined });

    expect(root.hasAttribute("data-loading")).toBe(true);
    expect(container.querySelectorAll(".cm-region")).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("al volver a undefined se mantiene el último dato y no se avisa", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result, rerender } = hook();
    const fills = result.current.regions.map((r) => r.fill);
    expect(result.current.dataLoading).toBe(false);

    rerender({ data: undefined });
    expect(result.current.dataLoading).toBe(true);
    expect(result.current.regions.map((r) => r.fill)).toEqual(fills);

    rerender({
      data: [
        { code: "A", v: 100 },
        { code: "B", v: 50 },
      ],
    });
    expect(result.current.dataLoading).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("loading fuerza el estado de carga aunque haya datos", () => {
    expect(renderMap({ loading: true }).root.hasAttribute("data-loading")).toBe(true);
    expect(renderMap({ loading: false, data: undefined }).root.hasAttribute("data-loading")).toBe(
      false,
    );
  });
});

describe("paso 22 · fallbackPoints (microestados)", () => {
  const geo = collection(feature("A", polygon(0, 0, 10, 10)));
  const props = {
    geography: geo,
    data: [
      { code: "A", v: 1 },
      { code: "AD", v: 9 },
      { code: "ZZ", v: 5 },
    ],
    fallbackPoints: { AD: [5, 5] as [number, number] },
  };

  it("un dato sin región pero con punto de respaldo se pinta como punto con su color", () => {
    const { result } = hook(props);

    expect(result.current.fallbackPoints).toHaveLength(1);
    const [point] = result.current.fallbackPoints;
    expect(point).toMatchObject({ id: "AD", datum: { code: "AD", v: 9 }, formattedValue: "9" });
    expect(point?.fill).not.toBe(result.current.emptyFill);
  });

  it("deja de avisar de ese id, pero sigue avisando de los demás huérfanos", () => {
    const { result } = hook(props);

    expect(result.current.joinReport.unmatchedData).toEqual(["ZZ"]);
  });

  it("el punto es un item `point` con hover, tooltip y clic; no se confunde con una región", () => {
    const onItemClick = vi.fn<(item: unknown) => void>();
    const { container } = renderMap({ ...props, onItemClick } as never);
    const circle = container.querySelector('[data-point-id="AD"]') as Element;

    fireEvent.pointerEnter(circle);
    fireEvent.pointerMove(circle, { clientX: 5, clientY: 5 });
    expect(screen.getByRole("tooltip").textContent).toContain("AD");
    expect(container.querySelector('circle[data-selection="hover"]')).not.toBeNull();

    fireEvent.click(circle);
    expect(onItemClick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "point", id: "AD", coordinates: [5, 5] }),
    );
  });

  it("el microestado entra en la leyenda (cuenta como una región más)", () => {
    const withLegend = hook({ ...props, data: [{ code: "AD", v: 9 }] });
    expect(withLegend.result.current.legend.reduce((n, item) => n + item.count, 0)).toBe(1);
  });

  it("en `bubble` es una burbuja con sus coordenadas, y no hay puntos aparte", () => {
    const { result } = hook({ ...props, variant: "bubble" });

    expect(result.current.fallbackPoints).toEqual([]);
    expect(result.current.bubbles.find((b) => b.id === "AD")).toMatchObject({
      coordinates: [5, 5],
    });
  });

  it("sin fallbackPoints no hay puntos; un punto no proyectable se ignora", () => {
    expect(hook({ ...props, fallbackPoints: undefined }).result.current.fallbackPoints).toEqual([]);
    expect(
      hook({ ...props, fallbackPoints: { AD: [Number.NaN, Number.NaN] } }).result.current
        .fallbackPoints,
    ).toEqual([]);
  });
});

describe("paso 22 · world110m + worldFallbackPoints, integrados", () => {
  it("datos alpha-2 cruzan con el mapa del mundo y Andorra aparece como punto", () => {
    const { result } = renderHook(() =>
      useChoropleth<Row>({
        geography: world110m,
        objectName: "countries",
        data: [
          { code: "ES", v: 1 },
          { code: "AD", v: 9 },
        ],
        getId: (r) => r.code,
        getValue: (r) => r.v,
        variant: "sequential",
        fallbackPoints: worldFallbackPoints,
        diagnostics: false,
      }),
    );

    expect(result.current.joinReport.unmatchedData).toEqual([]);
    expect(result.current.regions.find((r) => r.id === "ES")?.datum).toEqual({ code: "ES", v: 1 });
    expect(result.current.fallbackPoints.map((p) => p.id)).toEqual(["AD"]);
    // Kosovo (XK) y las dos regiones sin id ya no dejan agujeros.
    expect(result.current.regions.some((r) => r.id === "XK")).toBe(true);
    expect(result.current.anonymousPaths).toHaveLength(2);
  });
});
