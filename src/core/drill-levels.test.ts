import {
  buildBreadcrumbs,
  clampPath,
  contextOf,
  createLruCache,
  drillDirectionBetween,
  geographyKeyFor,
  resolveDrillData,
  validateLevels,
  type DrillContext,
  type LevelShape,
} from "./drill-levels";

const levels: LevelShape[] = [
  { id: "country", label: "Countries", geography: {} },
  { id: "region", geography: () => Promise.resolve({}) },
  { id: "store", geography: "inherit" },
];

describe("contextOf", () => {
  it("la raíz: sin padre y profundidad 0", () => {
    expect(contextOf([])).toEqual({ path: [], parentId: null, depth: 0 });
  });

  it("el padre es el último id", () => {
    expect(contextOf(["ES", "MD"])).toEqual({ path: ["ES", "MD"], parentId: "MD", depth: 2 });
  });
});

describe("validateLevels", () => {
  it("acepta una lista correcta", () => {
    expect(() => validateLevels(levels)).not.toThrow();
  });

  it("una lista vacía lanza un error claro", () => {
    expect(() => validateLevels([])).toThrow(/\[choropleth\] drill: at least one level/);
  });

  it("ids repetidos: dice cuál", () => {
    expect(() =>
      validateLevels([
        { id: "a", geography: {} },
        { id: "a", geography: {} },
      ]),
    ).toThrow(/duplicate level id "a"/);
  });

  it('el primer nivel no puede ser "inherit"', () => {
    expect(() => validateLevels([{ id: "a", geography: "inherit" }])).toThrow(
      /cannot use geography: "inherit"/,
    );
  });
});

describe("clampPath", () => {
  it("con N niveles el path más largo tiene N − 1 ids", () => {
    expect(clampPath(["ES", "MD"], 3)).toEqual({ path: ["ES", "MD"], clamped: false });
    expect(clampPath(["ES", "MD", "X"], 3)).toEqual({ path: ["ES", "MD"], clamped: true });
  });

  it("un solo nivel no se puede perforar", () => {
    expect(clampPath(["ES"], 1)).toEqual({ path: [], clamped: true });
    expect(clampPath([], 1)).toEqual({ path: [], clamped: false });
  });

  it("no crea un array nuevo si no hay recorte (misma referencia)", () => {
    const path = ["ES"];

    expect(clampPath(path, 3).path).toBe(path);
  });
});

describe("buildBreadcrumbs", () => {
  it("raíz + un paso por id, con profundidades 0, 1, 2…", () => {
    expect(buildBreadcrumbs({ path: ["ES", "MD"], rootLabel: "World" })).toEqual([
      { depth: 0, id: null, label: "World" },
      { depth: 1, id: "ES", label: "ES" },
      { depth: 2, id: "MD", label: "MD" },
    ]);
  });

  it("getLabel pone nombre a cada paso y recibe la profundidad", () => {
    const crumbs = buildBreadcrumbs({
      path: ["ES"],
      rootLabel: "World",
      getLabel: ({ id, depth }) => `${id}@${depth}`,
    });

    expect(crumbs[1]).toEqual({ depth: 1, id: "ES", label: "ES@1" });
  });

  it("en la raíz solo hay una miga", () => {
    expect(buildBreadcrumbs({ path: [], rootLabel: "World" })).toHaveLength(1);
  });
});

describe("geographyKeyFor", () => {
  it("geometría fija: el id del nivel", () => {
    expect(geographyKeyFor(levels, [])).toBe("country");
  });

  it("geometría que depende del padre: `${id}:${parentId}` (España y Francia no comparten caché)", () => {
    expect(geographyKeyFor(levels, ["ES"])).toBe("region:ES");
    expect(geographyKeyFor(levels, ["FR"])).toBe("region:FR");
  });

  it('"inherit" usa la clave del padre (las tiendas comparten la geometría de su región)', () => {
    expect(geographyKeyFor(levels, ["ES", "MD"])).toBe("region:ES");
  });

  it("`geographyKey` del consumidor manda, y recibe el contexto", () => {
    const custom: LevelShape[] = [
      { id: "a", geography: {} },
      { id: "b", geography: () => 1, geographyKey: (ctx) => `custom-${ctx.parentId}-${ctx.depth}` },
    ];

    expect(geographyKeyFor(custom, ["X"])).toBe("custom-X-1");
  });

  it("una ruta más larga que los niveles no rompe (usa el último)", () => {
    expect(geographyKeyFor(levels, ["ES", "MD", "extra"])).toBe("region:ES");
  });
});

describe("resolveDrillData", () => {
  it("una lista pasa tal cual", () => {
    const rows = [1, 2];

    expect(resolveDrillData(rows, contextOf([]))).toBe(rows);
  });

  it("`undefined` (cargando) se respeta", () => {
    expect(resolveDrillData(undefined, contextOf([]))).toBeUndefined();
  });

  it("un selector recibe el contexto del nivel actual", () => {
    const selector = vi.fn<(ctx: DrillContext) => readonly (string | null)[]>((ctx) => [
      ctx.parentId,
    ]);

    expect(resolveDrillData(selector, contextOf(["ES"]))).toEqual(["ES"]);
    expect(selector).toHaveBeenCalledOnce();
  });

  it("un selector puede devolver `undefined` (cargando)", () => {
    expect(resolveDrillData(() => undefined, contextOf([]))).toBeUndefined();
  });
});

describe("drillDirectionBetween", () => {
  it("la dirección, o `null` si no cambia", () => {
    expect(drillDirectionBetween([], ["ES"])).toBe("down");
    expect(drillDirectionBetween(["ES"], [])).toBe("up");
    expect(drillDirectionBetween(["ES"], ["FR"])).toBe("lateral");
    expect(drillDirectionBetween([], ["ES", "MD"])).toBe("jump");
    expect(drillDirectionBetween(["ES"], ["ES"])).toBeNull();
  });
});

describe("createLruCache", () => {
  it("guarda y devuelve; lo que no está es `undefined`", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("zz")).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it("expulsa el MENOS reciente al pasar de la capacidad", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("`get` marca como reciente: lo consultado sobrevive", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("`has` NO altera el orden", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.has("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(false);
  });

  it("reescribir una clave la actualiza y la hace reciente, sin crecer", () => {
    const cache = createLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(10);
    expect(cache.has("b")).toBe(false);
    expect(cache.size).toBe(2);
  });

  it("delete y clear", () => {
    const cache = createLruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.size).toBe(1);
    cache.clear();

    expect(cache.size).toBe(0);
  });

  it("la capacidad por defecto es 8", () => {
    const cache = createLruCache<number>();
    for (let i = 0; i < 9; i++) cache.set(String(i), i);

    expect(cache.size).toBe(8);
    expect(cache.has("0")).toBe(false);
  });

  it("una capacidad inválida lanza un error claro", () => {
    expect(() => createLruCache(0)).toThrow(/capacity must be an integer ≥ 1/);
    expect(() => createLruCache(1.5)).toThrow(/createLruCache/);
  });
});
