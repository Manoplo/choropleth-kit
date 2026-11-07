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

  it("by default: zoom on, wheel always, pinch and drag, limits [1, 12]", () => {
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

  it("zoom={false} disables it (null)", () => {
    expect(resolveZoomOptions(false, idle)).toBeNull();
  });

  it("a partial object is completed with the defaults", () => {
    expect(resolveZoomOptions({ max: 20, wheel: "cooperative" }, idle)).toMatchObject({
      min: 1,
      max: 20,
      wheel: "cooperative",
      pan: true,
    });
  });

  it("doubleClick auto is disabled if the click already has another meaning", () => {
    expect(resolveZoomOptions({}, { clickIsBusy: true })?.doubleClick).toBe(false);
    expect(resolveZoomOptions({ doubleClick: "auto" }, idle)?.doubleClick).toBe(true);
  });

  it("an explicit doubleClick is respected even if the click is busy", () => {
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
    it("always: the wheel zooms without a modifier", () => {
      expect(filter({})({ type: "wheel" })).toBe(true);
    });

    it("never: nunca", () => {
      const f = filter({ wheel: "never" });

      expect(f({ type: "wheel" })).toBe(false);
      expect(f({ type: "wheel", ctrlKey: true })).toBe(false);
    });

    it("cooperative: only with Ctrl or ⌘; without a modifier it shows the hint and does not zoom", () => {
      const onGestureHint = vi.fn<(kind: "wheel" | "touch") => void>();
      const f = filter({ wheel: "cooperative", onGestureHint });

      expect(f({ type: "wheel", ctrlKey: true })).toBe(true);
      expect(f({ type: "wheel", metaKey: true })).toBe(true);
      expect(onGestureHint).not.toHaveBeenCalled();

      expect(f({ type: "wheel" })).toBe(false);
      expect(onGestureHint).toHaveBeenCalledExactlyOnceWith("wheel");
    });

    it("cooperative without onGestureHint does not fail", () => {
      expect(filter({ wheel: "cooperative" })({ type: "wheel" })).toBe(false);
    });
  });

  describe("touch", () => {
    it("cooperative: one finger = page scroll (with a hint); two fingers = map", () => {
      const onGestureHint = vi.fn<(kind: "wheel" | "touch") => void>();
      const f = filter({ wheel: "cooperative", onGestureHint });

      expect(f(touches(1))).toBe(false);
      expect(onGestureHint).toHaveBeenCalledExactlyOnceWith("touch");
      expect(f(touches(2))).toBe(true);
    });

    it("always: one finger drags the map", () => {
      expect(filter({})(touches(1))).toBe(true);
    });

    it("pan = false: one finger does not drag; two fingers do pinch", () => {
      const f = filter({ pan: false });

      expect(f(touches(1))).toBe(false);
      expect(f(touches(2))).toBe(true);
    });

    it("pinch = false: two fingers still pan if pan is on; with neither, no", () => {
      expect(filter({ pinch: false })(touches(2))).toBe(true);
      expect(filter({ pinch: false, pan: false })(touches(2))).toBe(false);
    });

    it("an event without a touch list is treated as one finger", () => {
      expect(filter({ wheel: "cooperative" })({ type: "touchstart" })).toBe(false);
    });
  });

  describe("mouse and double click", () => {
    it("drag only with the primary button", () => {
      const f = filter({});

      expect(f({ type: "mousedown", button: 0 })).toBe(true);
      expect(f({ type: "mousedown", button: 2 })).toBe(false);
    });

    it("pan = false: the mouse does not drag", () => {
      expect(filter({ pan: false })({ type: "mousedown", button: 0 })).toBe(false);
    });

    it("a right click starts nothing in other events", () => {
      expect(filter({})({ type: "mouseup", button: 0 })).toBe(true);
      expect(filter({})({ type: "mouseup", button: 2 })).toBe(false);
    });

    it("double click according to the option", () => {
      expect(filter({ doubleClick: true })({ type: "dblclick" })).toBe(true);
      expect(filter({ doubleClick: false })({ type: "dblclick" })).toBe(false);
    });
  });
});

describe("resolveZoomOptions · keyboard", () => {
  it("the keyboard is on by default and can be disabled", () => {
    expect(resolveZoomOptions({}, { clickIsBusy: false })?.keyboard).toBe(true);
    expect(resolveZoomOptions({ keyboard: false }, { clickIsBusy: false })?.keyboard).toBe(false);
  });
});

describe("resolveControls (opt-in)", () => {
  it("no controls by default: without zoom, with boolean zoom or with an object without `controls`", () => {
    expect(resolveControls(undefined)).toBeNull();
    expect(resolveControls(true)).toBeNull();
    expect(resolveControls(false)).toBeNull();
    expect(resolveControls({})).toBeNull();
    expect(resolveControls({ controls: false })).toBeNull();
  });

  it("`controls: true` gives the default corner and reset", () => {
    expect(resolveControls({ controls: true })).toEqual({ position: "bottom-right", reset: true });
  });

  it("a partial object is completed", () => {
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
  ] as const)("%s → %s", (key, action) => {
    expect(zoomKeyAction({ key })).toBe(action);
  });

  it("other keys do nothing", () => {
    for (const key of ["a", "Enter", "ArrowUp", "1", " ", "Escape"]) {
      expect(zoomKeyAction({ key })).toBeNull();
    }
  });

  it("with Ctrl, ⌘ or Alt it is NOT intercepted: it is the browser's page zoom", () => {
    expect(zoomKeyAction({ key: "+", ctrlKey: true })).toBeNull();
    expect(zoomKeyAction({ key: "-", metaKey: true })).toBeNull();
    expect(zoomKeyAction({ key: "0", altKey: true })).toBeNull();
  });
});

describe("resolveZoomOptions · padding e initialView", () => {
  it("padding 24 by default; padding and initialView are respected", () => {
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
  it("Spain includes the Canary Islands (a business decision, not a geometric one)", () => {
    const [[west, south], [east, north]] = DEFAULT_FOCUS_BOUNDS["ES"] ?? [
      [0, 0],
      [0, 0],
    ];

    expect(west).toBeLessThan(-17.5); // El Hierro is at −18.2
    expect(south).toBeLessThan(28); // La Gomera, El Hierro: ~27.7
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

  it("a region id frames its extent and leaves it centered", () => {
    const t = resolve({});

    expect(t).not.toBeNull();
    const [cx, cy] = applyTransform(t as never, [450, 130]);
    expect(cx).toBeCloseTo(480);
    expect(cy).toBeCloseTo(250);
    expect(t?.k).toBeCloseTo(Math.min((960 - 40) / 100, (500 - 40) / 60));
  });

  it("a region that does not exist gives null", () => {
    expect(resolve({ target: "ZZ" })).toBeNull();
  });

  it("an explicit framing (`focusBounds`) wins over the geometry", () => {
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

  it("`focusBounds: { XX: null }` returns to the geometric framing", () => {
    expect(resolve({ focusBounds: { XX: null } })).toEqual(resolve({}));
  });

  it("an explicit framing holds even if the region does not exist in the geometry (microstate)", () => {
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

  it("{ bounds } frames some geographic bounds", () => {
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
    // the center of the bounds stays close to the center of the view
    const [sx, sy] = applyTransform(t as never, [px, py]);
    expect(Math.abs(sx - 480)).toBeLessThan(40);
    expect(Math.abs(sy - 250)).toBeLessThan(40);
  });

  it("{ center, zoom } puts that point at the center with that scale (relative to the fit)", () => {
    const t = resolve({ target: { center: [-3.7, 40.4], zoom: 4 } });

    expect(t?.k).toBe(4);
    const [px, py] = project([-3.7, 40.4]) as [number, number];
    const [sx, sy] = applyTransform(t as never, [px, py]);
    expect(sx).toBeCloseTo(480);
    expect(sy).toBeCloseTo(250);
  });

  it("{ center, zoom } respects scaleExtent and rejects what cannot be resolved", () => {
    expect(resolve({ target: { center: [0, 0], zoom: 99 } })?.k).toBe(12);
    expect(resolve({ target: { center: [0, 0], zoom: 0.1 } })?.k).toBe(1);
    expect(resolve({ target: { center: [0, 0], zoom: NaN } })).toBeNull();
    expect(resolve({ target: { center: [0, 0], zoom: 2 }, project: () => null })).toBeNull();
  });

  it("bounds that do not project give null", () => {
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
