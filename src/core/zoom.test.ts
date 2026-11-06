import { geoEqualEarth } from "d3-geo";
import { applyTransform } from "./camera";
import type { Extent } from "./camera";
import {
  createZoomFilter,
  DEFAULT_FOCUS_BOUNDS,
  resolveZoomTarget,
  type ResolveZoomTargetParams,
  resolveControls,
  resolveZoomOptions,
  zoomKeyAction,
  type ZoomFilterParams,
} from "./zoom";

describe("resolveZoomOptions", () => {
  const idle = { clickIsBusy: false };

  it("por defecto: zoom activo, rueda siempre, pellizco y arrastre, límites [1, 12]", () => {
    expect(resolveZoomOptions(undefined, idle)).toEqual({
      min: 1,
      max: 12,
      wheel: "always",
      pinch: true,
      pan: true,
      doubleClick: true,
      constrain: "contain",
      bubbleScaling: "sqrt",
      inertia: true,
      keyboard: true,
      padding: 24,
    });
    expect(resolveZoomOptions(true, idle)).toEqual(resolveZoomOptions(undefined, idle));
  });

  it("zoom={false} lo desactiva (null)", () => {
    expect(resolveZoomOptions(false, idle)).toBeNull();
  });

  it("un objeto parcial se completa con los valores por defecto", () => {
    expect(resolveZoomOptions({ max: 20, wheel: "cooperative" }, idle)).toMatchObject({
      min: 1,
      max: 20,
      wheel: "cooperative",
      pan: true,
    });
  });

  it("doubleClick «auto» se desactiva si el clic ya tiene otro significado", () => {
    expect(resolveZoomOptions({}, { clickIsBusy: true })?.doubleClick).toBe(false);
    expect(resolveZoomOptions({ doubleClick: "auto" }, idle)?.doubleClick).toBe(true);
  });

  it("doubleClick explícito se respeta aunque el clic esté ocupado", () => {
    expect(resolveZoomOptions({ doubleClick: true }, { clickIsBusy: true })?.doubleClick).toBe(
      true,
    );
    expect(resolveZoomOptions({ doubleClick: false }, idle)?.doubleClick).toBe(false);
  });

  it.each([
    { min: 0 },
    { min: -1 },
    { max: 0.5 },
    { max: Infinity },
    { max: NaN },
    { min: 5, max: 2 },
  ])("lanza un error claro con %o", (zoom) => {
    expect(() => resolveZoomOptions(zoom, idle)).toThrow(/\[choropleth\] zoom/);
  });
});

describe("createZoomFilter", () => {
  const base: ZoomFilterParams = { wheel: "always", pinch: true, pan: true, doubleClick: true };
  const filter = (params: Partial<ZoomFilterParams>) => createZoomFilter({ ...base, ...params });
  const touches = (n: number) => ({ type: "touchstart", touches: { length: n } });

  describe("rueda", () => {
    it("always: la rueda hace zoom sin modificador", () => {
      expect(filter({})({ type: "wheel" })).toBe(true);
    });

    it("never: nunca", () => {
      const f = filter({ wheel: "never" });

      expect(f({ type: "wheel" })).toBe(false);
      expect(f({ type: "wheel", ctrlKey: true })).toBe(false);
    });

    it("cooperative: solo con Ctrl o ⌘; sin modificador enseña el aviso y no hace zoom", () => {
      const onGestureHint = vi.fn<(kind: "wheel" | "touch") => void>();
      const f = filter({ wheel: "cooperative", onGestureHint });

      expect(f({ type: "wheel", ctrlKey: true })).toBe(true);
      expect(f({ type: "wheel", metaKey: true })).toBe(true);
      expect(onGestureHint).not.toHaveBeenCalled();

      expect(f({ type: "wheel" })).toBe(false);
      expect(onGestureHint).toHaveBeenCalledExactlyOnceWith("wheel");
    });

    it("cooperative sin onGestureHint no falla", () => {
      expect(filter({ wheel: "cooperative" })({ type: "wheel" })).toBe(false);
    });
  });

  describe("táctil", () => {
    it("cooperative: un dedo = scroll de la página (con aviso); dos dedos = mapa", () => {
      const onGestureHint = vi.fn<(kind: "wheel" | "touch") => void>();
      const f = filter({ wheel: "cooperative", onGestureHint });

      expect(f(touches(1))).toBe(false);
      expect(onGestureHint).toHaveBeenCalledExactlyOnceWith("touch");
      expect(f(touches(2))).toBe(true);
    });

    it("always: un dedo arrastra el mapa", () => {
      expect(filter({})(touches(1))).toBe(true);
    });

    it("pan = false: un dedo no arrastra; dos dedos sí pellizcan", () => {
      const f = filter({ pan: false });

      expect(f(touches(1))).toBe(false);
      expect(f(touches(2))).toBe(true);
    });

    it("pinch = false: dos dedos siguen desplazando si pan está activo; sin ninguno, no", () => {
      expect(filter({ pinch: false })(touches(2))).toBe(true);
      expect(filter({ pinch: false, pan: false })(touches(2))).toBe(false);
    });

    it("un evento sin lista de toques se trata como un dedo", () => {
      expect(filter({ wheel: "cooperative" })({ type: "touchstart" })).toBe(false);
    });
  });

  describe("ratón y doble clic", () => {
    it("arrastrar solo con el botón principal", () => {
      const f = filter({});

      expect(f({ type: "mousedown", button: 0 })).toBe(true);
      expect(f({ type: "mousedown", button: 2 })).toBe(false);
    });

    it("pan = false: el ratón no arrastra", () => {
      expect(filter({ pan: false })({ type: "mousedown", button: 0 })).toBe(false);
    });

    it("el clic derecho no inicia nada en otros eventos", () => {
      expect(filter({})({ type: "mouseup", button: 0 })).toBe(true);
      expect(filter({})({ type: "mouseup", button: 2 })).toBe(false);
    });

    it("doble clic según la opción", () => {
      expect(filter({ doubleClick: true })({ type: "dblclick" })).toBe(true);
      expect(filter({ doubleClick: false })({ type: "dblclick" })).toBe(false);
    });
  });
});

describe("resolveZoomOptions · keyboard", () => {
  it("el teclado está activo por defecto y se puede desactivar", () => {
    expect(resolveZoomOptions({}, { clickIsBusy: false })?.keyboard).toBe(true);
    expect(resolveZoomOptions({ keyboard: false }, { clickIsBusy: false })?.keyboard).toBe(false);
  });
});

describe("resolveControls (opt-in)", () => {
  it("sin controles por defecto: sin zoom, con zoom booleano o con un objeto sin `controls`", () => {
    expect(resolveControls(undefined)).toBeNull();
    expect(resolveControls(true)).toBeNull();
    expect(resolveControls(false)).toBeNull();
    expect(resolveControls({})).toBeNull();
    expect(resolveControls({ controls: false })).toBeNull();
  });

  it("`controls: true` da la esquina y el reset por defecto", () => {
    expect(resolveControls({ controls: true })).toEqual({ position: "bottom-right", reset: true });
  });

  it("un objeto parcial se completa", () => {
    expect(resolveControls({ controls: { position: "top-left" } })).toEqual({
      position: "top-left",
      reset: true,
    });
    expect(resolveControls({ controls: { reset: false } })).toEqual({
      position: "bottom-right",
      reset: false,
    });
  });
});

describe("zoomKeyAction", () => {
  it.each([
    ["+", "in"],
    ["=", "in"],
    ["-", "out"],
    ["_", "out"],
    ["0", "reset"],
  ] as const)("«%s» → %s", (key, action) => {
    expect(zoomKeyAction({ key })).toBe(action);
  });

  it("otras teclas no hacen nada", () => {
    for (const key of ["a", "Enter", "ArrowUp", "1", " ", "Escape"]) {
      expect(zoomKeyAction({ key })).toBeNull();
    }
  });

  it("con Ctrl, ⌘ o Alt NO se intercepta: es el zoom de la página del navegador", () => {
    expect(zoomKeyAction({ key: "+", ctrlKey: true })).toBeNull();
    expect(zoomKeyAction({ key: "-", metaKey: true })).toBeNull();
    expect(zoomKeyAction({ key: "0", altKey: true })).toBeNull();
  });
});

describe("resolveZoomOptions · padding e initialView", () => {
  it("padding 24 por defecto; padding e initialView se respetan", () => {
    expect(resolveZoomOptions({}, { clickIsBusy: false })).toMatchObject({
      padding: 24,
      initialView: undefined,
    });
    expect(
      resolveZoomOptions({ padding: 8, initialView: "ES" }, { clickIsBusy: false }),
    ).toMatchObject({ padding: 8, initialView: "ES" });
  });
});

describe("DEFAULT_FOCUS_BOUNDS", () => {
  it("España incluye Canarias (decisión de negocio, no geométrica)", () => {
    const [[west, south], [east, north]] = DEFAULT_FOCUS_BOUNDS["ES"] ?? [
      [0, 0],
      [0, 0],
    ];

    expect(west).toBeLessThan(-17.5); // El Hierro está en −18,2
    expect(south).toBeLessThan(28); // La Gomera, Hierro: ~27,7
    expect(east).toBeGreaterThan(3.3); // Menorca
    expect(north).toBeGreaterThan(43.7); // Estaca de Bares
  });
});

describe("resolveZoomTarget", () => {
  const size = { width: 960, height: 500 };
  const projection = geoEqualEarth().fitExtent(
    [
      [0, 0],
      [960, 500],
    ],
    { type: "Sphere" },
  );
  const project = (c: readonly [number, number]) => {
    const at = projection([c[0], c[1]]);
    return at === null ? null : ([at[0], at[1]] as [number, number]);
  };
  const scaleExtent = [1, 12] as const;
  const region: Extent = [
    [400, 100],
    [500, 160],
  ];

  const resolve = (over: Partial<ResolveZoomTargetParams>) =>
    resolveZoomTarget({
      target: "XX",
      size,
      padding: 20,
      scaleExtent,
      project,
      getRegionExtent: (id) => (id === "XX" ? region : null),
      ...over,
    });

  it("un id de región encuadra su extensión y la deja centrada", () => {
    const t = resolve({});

    expect(t).not.toBeNull();
    const [cx, cy] = applyTransform(t as never, [450, 130]);
    expect(cx).toBeCloseTo(480);
    expect(cy).toBeCloseTo(250);
    expect(t?.k).toBeCloseTo(Math.min((960 - 40) / 100, (500 - 40) / 60));
  });

  it("una región que no existe da null", () => {
    expect(resolve({ target: "ZZ" })).toBeNull();
  });

  it("un encuadre explícito (`focusBounds`) manda sobre la geometría", () => {
    const geometric = resolve({ target: "XX" });
    const override = resolve({
      target: "XX",
      focusBounds: {
        XX: [
          [-18.5, 27.5],
          [4.5, 44],
        ],
      },
    });

    expect(override).not.toBeNull();
    expect(override?.k).not.toBeCloseTo(geometric?.k ?? 0);
  });

  it("`focusBounds: { XX: null }` vuelve al encuadre geométrico", () => {
    expect(resolve({ focusBounds: { XX: null } })).toEqual(resolve({}));
  });

  it("un encuadre explícito vale aunque la región no exista en la geometría (microestado)", () => {
    const t = resolve({
      target: "AD",
      focusBounds: {
        AD: [
          [1, 42],
          [2, 43],
        ],
      },
    });

    expect(t).not.toBeNull();
  });

  it("{ bounds } encuadra unos límites geográficos", () => {
    const t = resolve({
      target: {
        bounds: [
          [-10, 35],
          [5, 45],
        ],
      },
    });

    expect(t).not.toBeNull();
    expect(t?.k).toBeGreaterThan(1);
    const [px, py] = project([-2.5, 40]) as [number, number];
    // el centro de los límites queda cerca del centro de la vista
    const [sx, sy] = applyTransform(t as never, [px, py]);
    expect(Math.abs(sx - 480)).toBeLessThan(40);
    expect(Math.abs(sy - 250)).toBeLessThan(40);
  });

  it("{ center, zoom } pone ese punto en el centro con esa escala (relativa al encaje)", () => {
    const t = resolve({ target: { center: [-3.7, 40.4], zoom: 4 } });

    expect(t?.k).toBe(4);
    const [px, py] = project([-3.7, 40.4]) as [number, number];
    const [sx, sy] = applyTransform(t as never, [px, py]);
    expect(sx).toBeCloseTo(480);
    expect(sy).toBeCloseTo(250);
  });

  it("{ center, zoom } respeta scaleExtent y rechaza lo que no se puede resolver", () => {
    expect(resolve({ target: { center: [0, 0], zoom: 99 } })?.k).toBe(12);
    expect(resolve({ target: { center: [0, 0], zoom: 0.1 } })?.k).toBe(1);
    expect(resolve({ target: { center: [0, 0], zoom: NaN } })).toBeNull();
    expect(resolve({ target: { center: [0, 0], zoom: 2 }, project: () => null })).toBeNull();
  });

  it("unos límites que no proyectan dan null", () => {
    expect(
      resolve({
        target: {
          bounds: [
            [0, 0],
            [1, 1],
          ],
        },
        project: () => null,
      }),
    ).toBeNull();
  });
});
