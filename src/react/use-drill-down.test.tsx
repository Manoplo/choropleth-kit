import { act, renderHook } from "@testing-library/react";
import type { Feature } from "geojson";
import { buildDrillEvent, defineDrillLevels, isDrillable, type DrillLevel } from "./drill-levels";
import type { MapItem } from "./map-item";
import { ROOT_LEVEL } from "./map-item";
import { DRILL_BRIDGE, isDrillController, useDrillDown } from "./use-drill-down";

// Paso 30: el estado de navegación del drill-down. Sin mapa: el hook no pinta nada.

type Row = { id: string };
const levels = defineDrillLevels<Row>([
  { id: "country", label: "Countries", geography: {} as never },
  { id: "region", geography: () => Promise.resolve({} as never) },
  { id: "store", geography: "inherit" },
]);

const region = (id: string): MapItem<Row> => ({
  kind: "region",
  id,
  feature: {
    type: "Feature",
    id,
    properties: {},
    geometry: { type: "Point", coordinates: [0, 0] },
  } as Feature,
  datum: undefined,
  level: ROOT_LEVEL,
  drillable: true,
});

afterEach(() => vi.restoreAllMocks());

describe("defineDrillLevels", () => {
  it("devuelve la misma lista (identidad con tipos)", () => {
    const list: DrillLevel<Row>[] = [{ id: "a", geography: {} as never }];

    expect(defineDrillLevels(list)).toBe(list);
  });

  it("falla al definirla si está mal formada", () => {
    expect(() => defineDrillLevels([])).toThrow(/at least one level/);
    expect(() =>
      defineDrillLevels([
        { id: "a", geography: {} as never },
        { id: "a", geography: {} as never },
      ]),
    ).toThrow(/duplicate level id/);
  });
});

describe("useDrillDown · no controlado", () => {
  it("empieza en la raíz: nivel 0, contexto vacío, una miga, no se puede subir", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));

    expect(result.current.path).toEqual([]);
    expect(result.current.level.id).toBe("country");
    expect(result.current.context).toEqual({ path: [], parentId: null, depth: 0 });
    expect(result.current.breadcrumbs).toEqual([{ depth: 0, id: null, label: "Countries" }]);
    expect(result.current.canDrillUp).toBe(false);
    expect(result.current.status).toBe("idle");
  });

  it("defaultPath: monta ya en esa ruta", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES"] }));

    expect(result.current.path).toEqual(["ES"]);
    expect(result.current.level.id).toBe("region");
    expect(result.current.canDrillUp).toBe(true);
  });

  it("drillDown / drillUp / reset cambian la ruta y avisan con onPathChange", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() => useDrillDown({ levels, onPathChange }));

    act(() => result.current.drillDown("ES"));
    expect(result.current.path).toEqual(["ES"]);
    expect(onPathChange).toHaveBeenLastCalledWith(["ES"]);

    act(() => result.current.drillDown("MD"));
    expect(result.current.level.id).toBe("store");
    expect(result.current.breadcrumbs.map((c) => c.id)).toEqual([null, "ES", "MD"]);

    act(() => result.current.drillUp());
    expect(result.current.path).toEqual(["ES"]);

    act(() => result.current.reset());
    expect(result.current.path).toEqual([]);
    expect(onPathChange).toHaveBeenCalledTimes(4);
  });

  it("drillUp(n) sube n niveles, y de más = a la raíz", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES", "MD"] }));
    act(() => result.current.drillUp(5));

    expect(result.current.path).toEqual([]);
  });

  it("drillUp(profundidad + 1) también llega a la raíz (no se queda con un id por un slice negativo)", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES", "MD"] }));
    act(() => result.current.drillUp(3));

    expect(result.current.path).toEqual([]);
  });

  it("drillUp(0), negativo o NaN: no hace nada", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES"], onPathChange }),
    );
    act(() => {
      result.current.drillUp(0);
      result.current.drillUp(-3);
      result.current.drillUp(NaN);
    });

    expect(result.current.path).toEqual(["ES"]);
    expect(onPathChange).not.toHaveBeenCalled();
  });

  it("drillTo: lateral y saltos", () => {
    const { result } = renderHook(() => useDrillDown({ levels, defaultPath: ["ES"] }));
    act(() => result.current.drillTo(["FR"]));
    expect(result.current.path).toEqual(["FR"]);

    act(() => result.current.drillTo(["US", "CA"]));
    expect(result.current.path).toEqual(["US", "CA"]);
  });

  it("ir a la ruta actual no avisa ni re-renderiza", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES"], onPathChange }),
    );
    const before = result.current;
    act(() => result.current.drillTo(["ES"]));

    expect(onPathChange).not.toHaveBeenCalled();
    expect(result.current).toBe(before);
  });

  it("dos llamadas en el mismo tick se componen (la segunda ve la primera)", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));
    act(() => {
      result.current.drillDown("ES");
      result.current.drillDown("MD");
    });

    expect(result.current.path).toEqual(["ES", "MD"]);
  });

  it("no se baja más allá del último nivel: se ignora y avisa en desarrollo", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES", "MD"], onPathChange }),
    );
    act(() => result.current.drillDown("X"));

    expect(result.current.path).toEqual(["ES", "MD"]);
    expect(onPathChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[choropleth] useDrillDown"));
  });

  it("las funciones son estables entre renders (se pasan a efectos del mapa)", () => {
    const { result, rerender } = renderHook(() => useDrillDown({ levels }));
    const first = result.current;
    rerender();
    act(() => first.drillDown("ES"));
    rerender();

    expect(result.current.drillDown).toBe(first.drillDown);
    expect(result.current.drillUp).toBe(first.drillUp);
    expect(result.current.drillTo).toBe(first.drillTo);
    expect(result.current.reset).toBe(first.reset);
  });
});

describe("useDrillDown · controlado", () => {
  it("manda `path`: pedir un cambio avisa pero NO cambia la ruta hasta que el padre la cambia", () => {
    const onPathChange = vi.fn<(path: readonly string[]) => void>();
    const { result, rerender } = renderHook(
      ({ path }: { path: readonly string[] }) => useDrillDown({ levels, path, onPathChange }),
      { initialProps: { path: [] as readonly string[] } },
    );
    act(() => result.current.drillDown("ES"));

    expect(onPathChange).toHaveBeenCalledWith(["ES"]);
    expect(result.current.path).toEqual([]);

    rerender({ path: ["ES"] });
    expect(result.current.path).toEqual(["ES"]);
    expect(result.current.level.id).toBe("region");
  });

  it("el padre puede rechazar el cambio: la ruta no se mueve", () => {
    const { result } = renderHook(() =>
      useDrillDown({ levels, path: ["ES"], onPathChange: () => {} }),
    );
    act(() => result.current.drillUp());

    expect(result.current.path).toEqual(["ES"]);
  });

  it("un cambio externo (botón «atrás» del navegador) actualiza nivel y migas", () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: readonly string[] }) => useDrillDown({ levels, path }),
      { initialProps: { path: ["ES", "MD"] as readonly string[] } },
    );
    rerender({ path: [] });

    expect(result.current.level.id).toBe("country");
    expect(result.current.breadcrumbs).toHaveLength(1);
  });

  it("`path` manda sobre `defaultPath`", () => {
    const { result } = renderHook(() =>
      useDrillDown({ levels, path: ["FR"], defaultPath: ["ES"] }),
    );

    expect(result.current.path).toEqual(["FR"]);
  });
});

describe("ruta más profunda que los niveles (URL vieja)", () => {
  it("se recorta y se avisa una vez en desarrollo", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result, rerender } = renderHook(() =>
      useDrillDown({ levels, path: ["ES", "MD", "X", "Y"] }),
    );
    rerender();

    expect(result.current.path).toEqual(["ES", "MD"]);
    expect(result.current.level.id).toBe("store");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/truncated/);
  });
});

describe("migas", () => {
  it("getLabel pone nombre a los pasos; la raíz usa la etiqueta del primer nivel", () => {
    const { result } = renderHook(() =>
      useDrillDown({
        levels,
        defaultPath: ["ES", "MD"],
        getLabel: ({ id, depth }) => `${id.toLowerCase()}#${depth}`,
      }),
    );

    expect(result.current.breadcrumbs.map((c) => c.label)).toEqual(["Countries", "es#1", "md#2"]);
  });

  it("sin etiqueta en el primer nivel, la raíz usa su id", () => {
    const bare = defineDrillLevels<Row>([{ id: "world", geography: {} as never }]);
    const { result } = renderHook(() => useDrillDown({ levels: bare }));

    expect(result.current.breadcrumbs[0]?.label).toBe("world");
  });

  it("un `getLabel` en línea no recalcula las migas en cada render", () => {
    const { result, rerender } = renderHook(() =>
      useDrillDown({ levels, defaultPath: ["ES"], getLabel: ({ id }) => id }),
    );
    const first = result.current.breadcrumbs;
    rerender();

    expect(result.current.breadcrumbs).toBe(first);
  });
});

describe("status (lo escribe el mapa)", () => {
  it("el hook lo lee del canal; solo re-renderiza si cambia", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));
    const bridge = result.current[DRILL_BRIDGE];
    act(() => bridge.setStatus("flying"));
    expect(result.current.status).toBe("flying");

    const same = result.current;
    act(() => bridge.setStatus("flying"));
    expect(result.current).toBe(same);

    act(() => bridge.setStatus("idle"));
    expect(result.current.status).toBe("idle");
  });

  it("el canal sobrevive a los renders (es el mismo)", () => {
    const { result, rerender } = renderHook(() => useDrillDown({ levels }));
    const bridge = result.current[DRILL_BRIDGE];
    rerender();

    expect(result.current[DRILL_BRIDGE]).toBe(bridge);
  });
});

describe("isDrillController", () => {
  it("distingue una lista de niveles de un controlador", () => {
    const { result } = renderHook(() => useDrillDown({ levels }));

    expect(isDrillController(levels)).toBe(false);
    expect(isDrillController(result.current)).toBe(true);
  });
});

describe("isDrillable", () => {
  it("con un nivel por debajo y sin `canDrill`: sí", () => {
    expect(isDrillable(levels, 0, region("ES"))).toBe(true);
    expect(isDrillable(levels, 1, region("MD"))).toBe(true);
  });

  it("en el último nivel: nunca", () => {
    expect(isDrillable(levels, 2, region("x"))).toBe(false);
  });

  it("fuera de rango: no", () => {
    expect(isDrillable(levels, 9, region("x"))).toBe(false);
  });

  it("`canDrill` booleano o función decide (con el item)", () => {
    const custom = defineDrillLevels<Row>([
      { id: "a", geography: {} as never, canDrill: (item) => item.id !== "AD" },
      { id: "b", geography: {} as never, canDrill: false },
      { id: "c", geography: {} as never },
    ]);

    expect(isDrillable(custom, 0, region("ES"))).toBe(true);
    expect(isDrillable(custom, 0, region("AD"))).toBe(false);
    expect(isDrillable(custom, 1, region("ES"))).toBe(false);
  });
});

describe("buildDrillEvent", () => {
  it("dirección, contextos de origen y destino, y el item si lo hubo", () => {
    const item = region("ES");
    const event = buildDrillEvent<Row>({ from: [], to: ["ES"], item });

    expect(event).toEqual({
      direction: "down",
      from: { path: [], parentId: null, depth: 0 },
      to: { path: ["ES"], parentId: "ES", depth: 1 },
      item,
    });
  });

  it("sin item (breadcrumb, teclado, URL) la clave no existe", () => {
    const event = buildDrillEvent<Row>({ from: ["ES"], to: [] });

    expect(event?.direction).toBe("up");
    expect(event).not.toHaveProperty("item");
  });

  it("si la ruta no cambia no hay evento", () => {
    expect(buildDrillEvent<Row>({ from: ["ES"], to: ["ES"] })).toBeNull();
  });
});
