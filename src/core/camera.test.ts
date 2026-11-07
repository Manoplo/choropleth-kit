import { geoEqualEarth, geoMercator } from "d3-geo";
import { boundsToTransform, normalizePadding } from "./bounds";
import {
  applyTransform,
  bubbleScale,
  constrainAxis,
  constrainTransform,
  createZoomInterpolator,
  FIT_TRANSFORM,
  flightDuration,
  inertiaOffset,
  INERTIA_TAU_MS,
  invertTransform,
  isFitTransform,
  MAX_FLIGHT_MS,
  MIN_FLIGHT_MS,
  preserveView,
  releaseVelocity,
  toViewState,
  transformToZoomView,
  type CameraSample,
  type CameraTransform,
} from "./camera";
import type { Point } from "./variants";

const size = { width: 960, height: 500 };

describe("applyTransform / invertTransform", () => {
  it("they are inverses of each other", () => {
    const t: CameraTransform = { k: 3, x: -120, y: 45 };
    const screen = applyTransform(t, [200, 100]);

    expect(screen).toEqual([480, 345]);
    expect(invertTransform(t, screen)).toEqual([200, 100]);
  });

  it("the fit moves nothing", () => {
    expect(applyTransform(FIT_TRANSFORM, [7, 9])).toEqual([7, 9]);
  });
});

describe("constrainAxis", () => {
  const axis = { c0: 0, c1: 100, v0: 0, v1: 100 };

  it("if the content fits, it centers it (it does not leave it stuck in a corner)", () => {
    // content 100 × 0.5 = 50 in a view of 100: 50 left over, 25 on each side
    expect(constrainAxis({ ...axis, k: 0.5, t: 0 })).toBe(25);
    expect(constrainAxis({ ...axis, k: 0.5, t: 999 })).toBe(25);
  });

  it("if it fits exactly (k = 1), there is nothing to drag", () => {
    expect(constrainAxis({ ...axis, k: 1, t: 40 })).toBe(0);
    expect(constrainAxis({ ...axis, k: 1, t: -40 })).toBe(0);
  });

  it("if it does not fit, it keeps the edges from entering the view", () => {
    // k = 2: content of 200 in a view of 100. t ∈ [100 − 200, 0] = [−100, 0]
    expect(constrainAxis({ ...axis, k: 2, t: 30 })).toBe(0);
    expect(constrainAxis({ ...axis, k: 2, t: -30 })).toBe(-30);
    expect(constrainAxis({ ...axis, k: 2, t: -300 })).toBe(-100);
  });

  it("overscroll opens an elastic slack proportional to the view", () => {
    expect(constrainAxis({ ...axis, k: 2, t: 30, overscroll: 0.08 })).toBe(8);
    expect(constrainAxis({ ...axis, k: 2, t: -300, overscroll: 0.08 })).toBe(-108);
  });

  it("works with content and view that do not start at 0", () => {
    // contenido [10, 60] a k = 2 → 100 de ancho, vista [200, 300]: cabe justo
    expect(constrainAxis({ t: 0, k: 2, c0: 10, c1: 60, v0: 200, v1: 300 })).toBe(180);
  });
});

describe("constrainTransform", () => {
  const rect = [
    [0, 0],
    [960, 500],
  ] as const;

  it("applies the limit on each axis and respects k", () => {
    const out = constrainTransform({
      transform: { k: 2, x: 500, y: -2000 },
      content: rect,
      view: rect,
    });

    expect(out).toEqual({ k: 2, x: 0, y: -500 });
  });

  it("an already-valid transform does not change", () => {
    const t = { k: 4, x: -300, y: -200 };

    expect(constrainTransform({ transform: t, content: rect, view: rect })).toEqual(t);
  });

  it("passes overscroll to both axes", () => {
    const out = constrainTransform({
      transform: { k: 2, x: 500, y: 500 },
      content: rect,
      view: rect,
      overscroll: 0.1,
    });

    expect(out).toEqual({ k: 2, x: 96, y: 50 });
  });
});

describe("boundsToTransform", () => {
  const bounds = [
    [100, 100],
    [300, 200],
  ] as const;

  it("fits the bounds with padding and leaves them centered", () => {
    const t = boundsToTransform({ bounds, size, padding: 20, scaleExtent: [1, 12] });

    // limits the width: (960 − 40) / 200 = 4.6;  height: (500 − 40) / 100 = 4.6 → tie
    expect(t.k).toBeCloseTo(4.6);
    // the center of the bounds (200, 150) falls at the center of the view (480, 250)
    expect(applyTransform(t, [200, 150])[0]).toBeCloseTo(480);
    expect(applyTransform(t, [200, 150])[1]).toBeCloseTo(250);
  });

  it("the more restrictive dimension wins", () => {
    const wide = boundsToTransform({
      bounds: [
        [0, 0],
        [900, 50],
      ],
      size,
      padding: 0,
    });
    const tall = boundsToTransform({
      bounds: [
        [0, 0],
        [50, 450],
      ],
      size,
      padding: 0,
    });

    expect(wide.k).toBeCloseTo(960 / 900);
    expect(tall.k).toBeCloseTo(500 / 450);
  });

  it("respects scaleExtent in both directions (tiny country / huge country)", () => {
    const tiny = boundsToTransform({
      bounds: [
        [10, 10],
        [11, 11],
      ],
      size,
      scaleExtent: [1, 12],
    });
    const huge = boundsToTransform({
      bounds: [
        [-5000, -5000],
        [5000, 5000],
      ],
      size,
      scaleExtent: [1, 12],
    });

    expect(tiny.k).toBe(12);
    expect(huge.k).toBe(1);
    // even at the limit, the country stays centered
    expect(applyTransform(tiny, [10.5, 10.5])).toEqual([480, 250]);
  });

  it("accepts a different padding on each side", () => {
    const t = boundsToTransform({
      bounds: [
        [0, 0],
        [100, 100],
      ],
      size: { width: 300, height: 300 },
      padding: { top: 0, right: 0, bottom: 0, left: 100 },
    });

    // usable width 200 → k = 2; the content occupies [100, 300] on screen
    expect(t.k).toBeCloseTo(2);
    expect(applyTransform(t, [0, 0])[0]).toBeCloseTo(100);
    expect(applyTransform(t, [100, 0])[0]).toBeCloseTo(300);
  });

  it("degenerate bounds (a point) give neither Infinity nor NaN", () => {
    const point = boundsToTransform({
      bounds: [
        [50, 50],
        [50, 50],
      ],
      size,
      scaleExtent: [1, 12],
    });
    const unbounded = boundsToTransform({
      bounds: [
        [50, 50],
        [50, 50],
      ],
      size,
    });

    expect(point.k).toBe(12);
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    expect(Number.isNaN(unbounded.k)).toBe(false);
  });

  it("a padding that eats the view drops to minimum k instead of going negative", () => {
    const t = boundsToTransform({
      bounds: [
        [0, 0],
        [100, 100],
      ],
      size: { width: 100, height: 100 },
      padding: 80,
      scaleExtent: [1, 12],
    });

    expect(t.k).toBe(1);
  });
});

describe("normalizePadding", () => {
  it("a number applies to all four sides; 24 by default; an object is respected", () => {
    expect(normalizePadding(10)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(normalizePadding()).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
    const own = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(normalizePadding(own)).toBe(own);
  });
});

describe("preserveView", () => {
  // Real projections: what changes on resize is the scale and the translation.
  const fit = (w: number, h: number) =>
    geoEqualEarth().fitExtent(
      [
        [0, 0],
        [w, h],
      ],
      { type: "Sphere" },
    );
  const oldSize = { width: 960, height: 500 };
  const newSize = { width: 480, height: 250 };
  const oldP = fit(oldSize.width, oldSize.height);
  const newP = fit(newSize.width, newSize.height);
  const invertOld = (p: Point) => oldP.invert?.([p[0], p[1]]) as Point | null;
  const projectNew = (c: Point) => newP([c[0], c[1]]) as Point | null;
  const invertNew = (p: Point) => newP.invert?.([p[0], p[1]]) as Point | null;

  it("the geographic center is the same before and after resizing", () => {
    // A view at k = 4 centered on Spain.
    const spain = oldP([-3.7, 40.4]) as Point;
    const before: CameraTransform = {
      k: 4,
      x: oldSize.width / 2 - 4 * spain[0],
      y: oldSize.height / 2 - 4 * spain[1],
    };

    const after = preserveView({ transform: before, oldSize, newSize, invertOld, projectNew });

    expect(after.k).toBe(4);
    const centerBefore = toViewState({
      transform: before,
      size: oldSize,
      invert: invertOld,
    }).center;
    const centerAfter = toViewState({ transform: after, size: newSize, invert: invertNew }).center;
    expect(centerBefore[0]).toBeCloseTo(-3.7, 3);
    expect(centerAfter[0]).toBeCloseTo(centerBefore[0], 3);
    expect(centerAfter[1]).toBeCloseTo(centerBefore[1], 3);
  });

  it("at the fit, it is still the fit of the new size", () => {
    const after = preserveView({
      transform: FIT_TRANSFORM,
      oldSize,
      newSize,
      invertOld,
      projectNew,
    });

    expect(after.k).toBe(1);
    expect(after.x).toBeCloseTo(0, 6);
    expect(after.y).toBeCloseTo(0, 6);
  });

  it("if the center falls outside the projection, it returns to the fit", () => {
    const outside = preserveView({
      transform: { k: 2, x: 0, y: 0 },
      oldSize,
      newSize,
      invertOld: () => null,
      projectNew,
    });
    const unprojectable = preserveView({
      transform: { k: 2, x: 0, y: 0 },
      oldSize,
      newSize,
      invertOld,
      projectNew: () => null,
    });

    expect(outside).toEqual(FIT_TRANSFORM);
    expect(unprojectable).toEqual(FIT_TRANSFORM);
  });
});

describe("flightDuration", () => {
  const at = (k: number, x = 0, y = 0): CameraTransform => ({ k, x, y });

  it("always within [350, 1200] ms", () => {
    const tiny = flightDuration({ from: at(1), to: at(1.001), size });
    const huge = flightDuration({ from: at(1), to: at(12, -9000, -4000), size });

    expect(tiny).toBe(MIN_FLIGHT_MS);
    expect(huge).toBeLessThanOrEqual(MAX_FLIGHT_MS);
    expect(huge).toBeGreaterThan(MIN_FLIGHT_MS);
  });

  it("a long flight lasts longer than a short one", () => {
    const short = flightDuration({ from: at(1), to: at(2, -200, -100), size, speed: 2 });
    const long = flightDuration({ from: at(1), to: at(8, -6000, -2500), size, speed: 2 });

    expect(long).toBeGreaterThan(short);
  });

  it("same destination = minimum duration (not NaN)", () => {
    expect(flightDuration({ from: at(3, -5, -5), to: at(3, -5, -5), size })).toBe(MIN_FLIGHT_MS);
  });

  it("speed scales the duration (within the limits)", () => {
    const params = { from: at(1), to: at(4, -1500, -700), size };
    const normal = flightDuration(params);
    const slow = flightDuration({ ...params, speed: 1.2 });

    expect(slow).toBeGreaterThanOrEqual(normal);
  });

  it("an invalid transform falls to the minimum instead of returning NaN", () => {
    expect(flightDuration({ from: at(NaN), to: at(2), size })).toBe(MIN_FLIGHT_MS);
  });

  it("the curvature is really applied (d3 exposes it on the function, not on the interpolator)", () => {
    // A long flight with a speed that does not hit the limits: the curvature changes the duration.
    const params = { from: at(1), to: at(4, -1200, -600), size };
    const low = flightDuration({ ...params, curvature: 0.3 });
    const high = flightDuration({ ...params, curvature: 3 });

    expect(low).not.toBe(high);
  });
});

describe("transformToZoomView", () => {
  it("the fit looks centered and full width; with k = 2 the view is half", () => {
    expect(transformToZoomView(FIT_TRANSFORM, size)).toEqual([480, 250, 960]);
    expect(transformToZoomView({ k: 2, x: -480, y: -250 }, size)).toEqual([480, 250, 480]);
  });
});

describe("inertiaOffset", () => {
  it("on release (t = 0) it has not moved", () => {
    expect(inertiaOffset({ velocity: 1, elapsed: 0 })).toBe(0);
  });

  it("tends to v·τ and never exceeds it", () => {
    const limit = 1.5 * INERTIA_TAU_MS;

    expect(inertiaOffset({ velocity: 1.5, elapsed: 5000 })).toBeCloseTo(limit, 3);
    expect(inertiaOffset({ velocity: 1.5, elapsed: 300 })).toBeLessThan(limit);
  });

  it("at t = τ it has covered 63.2 % of the total (1 − 1/e)", () => {
    const offset = inertiaOffset({ velocity: 2, elapsed: INERTIA_TAU_MS });

    expect(offset / (2 * INERTIA_TAU_MS)).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("is monotonic, keeps the sign and admits another τ", () => {
    const a = inertiaOffset({ velocity: -1, elapsed: 100 });
    const b = inertiaOffset({ velocity: -1, elapsed: 200 });

    expect(a).toBeLessThan(0);
    expect(b).toBeLessThan(a);
    expect(inertiaOffset({ velocity: 1, elapsed: 100, tau: 50 })).toBeLessThan(50);
  });

  it("negative time, NaN or non-finite velocity: it does not move", () => {
    expect(inertiaOffset({ velocity: 1, elapsed: -10 })).toBe(0);
    expect(inertiaOffset({ velocity: 1, elapsed: NaN })).toBe(0);
    expect(inertiaOffset({ velocity: NaN, elapsed: 100 })).toBe(0);
  });
});

describe("releaseVelocity", () => {
  const at = (time: number, x: number, y = 0, k = 2): CameraSample => ({ time, k, x, y });

  it("measures px/ms between the first and the last sample of the window", () => {
    const v = releaseVelocity({ samples: [at(0, 0), at(20, 10), at(40, 40)], now: 50 });

    expect(v?.[0]).toBeCloseTo(1, 6);
    expect(v?.[1]).toBeCloseTo(0, 6);
  });

  it("ignores samples older than the window (100 ms)", () => {
    const v = releaseVelocity({ samples: [at(0, 0), at(60, 1000), at(100, 1060)], now: 120 });

    // Only t = 60 and t = 100 count: 60 px in 40 ms.
    expect(v?.[0]).toBeCloseTo(1.5, 6);
  });

  it("if the hand stopped before releasing, there is no inertia", () => {
    expect(releaseVelocity({ samples: [at(0, 0), at(20, 100)], now: 400 })).toBeNull();
  });

  it("below 0.3 px/ms there is no inertia; exactly at the threshold, there is", () => {
    expect(releaseVelocity({ samples: [at(0, 0), at(100, 29)], now: 100 })).toBeNull();
    expect(releaseVelocity({ samples: [at(0, 0), at(100, 31)], now: 100 })).not.toBeNull();
  });

  it("a zoom within the window cancels it (inertia is pan only)", () => {
    const zoomed = [at(0, 0, 0, 2), at(50, 50, 0, 2.5), at(90, 100, 0, 3)];

    expect(releaseVelocity({ samples: zoomed, now: 100 })).toBeNull();
  });

  it("without two samples, or with the same instant, there is no velocity", () => {
    expect(releaseVelocity({ samples: [], now: 0 })).toBeNull();
    expect(releaseVelocity({ samples: [at(0, 0)], now: 0 })).toBeNull();
    expect(releaseVelocity({ samples: [at(5, 0), at(5, 100)], now: 5 })).toBeNull();
  });

  it("uses both axes: the velocity is the magnitude", () => {
    const v = releaseVelocity({ samples: [at(0, 0, 0), at(100, 24, 32)], now: 100 });

    expect(v).toEqual([0.24, 0.32]);
  });
});

describe("bubbleScale", () => {
  it("sqrt: 1/√k", () => {
    expect(bubbleScale(4, "sqrt")).toBeCloseTo(0.5, 10);
    expect(bubbleScale(1, "sqrt")).toBe(1);
  });

  it("screen: 1/k (constant size on screen)", () => {
    expect(bubbleScale(4, "screen")).toBe(0.25);
  });

  it("geo: 1 (they grow with the map)", () => {
    expect(bubbleScale(4, "geo")).toBe(1);
  });

  it("an invalid k does not break: scale 1", () => {
    expect(bubbleScale(0, "sqrt")).toBe(1);
    expect(bubbleScale(NaN, "screen")).toBe(1);
  });

  it("when multiplied by k, sqrt grows √k and screen does not grow", () => {
    expect(4 * bubbleScale(4, "sqrt")).toBeCloseTo(2, 10);
    expect(4 * bubbleScale(4, "screen")).toBeCloseTo(1, 10);
  });
});

describe("toViewState", () => {
  const projection = geoMercator().fitExtent(
    [
      [0, 0],
      [960, 500],
    ],
    { type: "Sphere" },
  );
  const invert = (p: Point) => projection.invert?.([p[0], p[1]]) as Point | null;

  it("exposes k, zoom, x, y, default level and geographic center", () => {
    const view = toViewState({ transform: FIT_TRANSFORM, size, invert });

    expect(view).toMatchObject({ k: 1, zoom: 1, x: 0, y: 0, level: { id: "root", depth: 0 } });
    expect(view.center[0]).toBeCloseTo(0, 1);
    expect(view.center[1]).toBeCloseTo(0, 1);
  });

  it("zooming in shrinks the visible bounds and centers them where it was looked at", () => {
    const wide = toViewState({ transform: FIT_TRANSFORM, size, invert });
    const madrid = projection([-3.7, 40.4]) as Point;
    const zoomed = toViewState({
      transform: { k: 8, x: 480 - 8 * madrid[0], y: 250 - 8 * madrid[1] },
      size,
      invert,
      level: { id: "world", depth: 1 },
    });

    expect(zoomed.center[0]).toBeCloseTo(-3.7, 1);
    expect(zoomed.center[1]).toBeCloseTo(40.4, 1);
    expect(zoomed.bounds[1][0] - zoomed.bounds[0][0]).toBeLessThan(
      (wide.bounds[1][0] - wide.bounds[0][0]) / 4,
    );
    expect(zoomed.bounds[0][0]).toBeLessThan(-3.7);
    expect(zoomed.bounds[1][0]).toBeGreaterThan(-3.7);
    expect(zoomed.level).toEqual({ id: "world", depth: 1 });
  });

  it("corners outside the globe do not break the bounds (they are discarded)", () => {
    const equal = geoEqualEarth().fitExtent(
      [
        [0, 0],
        [960, 500],
      ],
      { type: "Sphere" },
    );
    const view = toViewState({
      transform: FIT_TRANSFORM,
      size,
      invert: (p) => equal.invert?.([p[0], p[1]]) as Point | null,
    });

    expect(view.bounds[0][0]).toBeGreaterThanOrEqual(-180);
    expect(view.bounds[1][0]).toBeLessThanOrEqual(180);
    expect(view.bounds[1][0] - view.bounds[0][0]).toBeGreaterThan(300);
  });

  it("if nothing projects, it returns the whole world and the center [0, 0]", () => {
    const view = toViewState({ transform: FIT_TRANSFORM, size, invert: () => null });

    expect(view.bounds).toEqual([
      [-180, -90],
      [180, 90],
    ]);
    expect(view.center).toEqual([0, 0]);
  });

  it("if only the center falls outside, it estimates it from the visible bounds", () => {
    const view = toViewState({
      transform: FIT_TRANSFORM,
      size,
      // everything projects except exactly the center of the view
      invert: (p) => (p[0] === 480 && p[1] === 250 ? null : ([p[0] / 10, p[1] / 10] as Point)),
    });

    expect(Number.isFinite(view.center[0]) && Number.isFinite(view.center[1])).toBe(true);
  });

  it("a projection that returns NaN is treated as outside the globe", () => {
    const view = toViewState({
      transform: FIT_TRANSFORM,
      size,
      invert: () => [NaN, NaN],
    });

    expect(view.bounds).toEqual([
      [-180, -90],
      [180, 90],
    ]);
  });
});

describe("isFitTransform", () => {
  it("the fit and what is a hair away from it count; the rest does not", () => {
    expect(isFitTransform(FIT_TRANSFORM)).toBe(true);
    expect(isFitTransform({ k: 1.0001, x: 0.0001, y: -0.0001 })).toBe(true);
    expect(isFitTransform({ k: 2, x: 0, y: 0 })).toBe(false);
    expect(isFitTransform({ k: 1, x: 5, y: 0 })).toBe(false);
    expect(isFitTransform({ k: 1, x: 0, y: 5 })).toBe(false);
  });
});

describe("createZoomInterpolator", () => {
  it("returns an interpolateZoom with that curvature (d3 exposes it on the function)", () => {
    const view = [0, 0, 960] as [number, number, number];
    const target = [100, 50, 120] as [number, number, number];

    expect(createZoomInterpolator(0.5)(view, target).duration).not.toBe(
      createZoomInterpolator(2)(view, target).duration,
    );
  });
});
