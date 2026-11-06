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
  it("son inversas entre sí", () => {
    const t: CameraTransform = { k: 3, x: -120, y: 45 };
    const screen = applyTransform(t, [200, 100]);

    expect(screen).toEqual([480, 345]);
    expect(invertTransform(t, screen)).toEqual([200, 100]);
  });

  it("el encaje no mueve nada", () => {
    expect(applyTransform(FIT_TRANSFORM, [7, 9])).toEqual([7, 9]);
  });
});

describe("constrainAxis", () => {
  const axis = { c0: 0, c1: 100, v0: 0, v1: 100 };

  it("si el contenido cabe, lo centra (no lo deja pegado a una esquina)", () => {
    // contenido 100 × 0,5 = 50 en una vista de 100: sobran 50, 25 a cada lado
    expect(constrainAxis({ ...axis, k: 0.5, t: 0 })).toBe(25);
    expect(constrainAxis({ ...axis, k: 0.5, t: 999 })).toBe(25);
  });

  it("si cabe justo (k = 1), no hay nada que arrastrar", () => {
    expect(constrainAxis({ ...axis, k: 1, t: 40 })).toBe(0);
    expect(constrainAxis({ ...axis, k: 1, t: -40 })).toBe(0);
  });

  it("si no cabe, impide que los bordes entren en la vista", () => {
    // k = 2: contenido de 200 en una vista de 100. t ∈ [100 − 200, 0] = [−100, 0]
    expect(constrainAxis({ ...axis, k: 2, t: 30 })).toBe(0);
    expect(constrainAxis({ ...axis, k: 2, t: -30 })).toBe(-30);
    expect(constrainAxis({ ...axis, k: 2, t: -300 })).toBe(-100);
  });

  it("overscroll abre una holgura elástica proporcional a la vista", () => {
    expect(constrainAxis({ ...axis, k: 2, t: 30, overscroll: 0.08 })).toBe(8);
    expect(constrainAxis({ ...axis, k: 2, t: -300, overscroll: 0.08 })).toBe(-108);
  });

  it("funciona con contenido y vista que no empiezan en 0", () => {
    // contenido [10, 60] a k = 2 → 100 de ancho, vista [200, 300]: cabe justo
    expect(constrainAxis({ t: 0, k: 2, c0: 10, c1: 60, v0: 200, v1: 300 })).toBe(180);
  });
});

describe("constrainTransform", () => {
  const rect = [
    [0, 0],
    [960, 500],
  ] as const;

  it("aplica el límite en cada eje y respeta k", () => {
    const out = constrainTransform({
      transform: { k: 2, x: 500, y: -2000 },
      content: rect,
      view: rect,
    });

    expect(out).toEqual({ k: 2, x: 0, y: -500 });
  });

  it("un transform ya válido no cambia", () => {
    const t = { k: 4, x: -300, y: -200 };

    expect(constrainTransform({ transform: t, content: rect, view: rect })).toEqual(t);
  });

  it("pasa overscroll a los dos ejes", () => {
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

  it("encaja los límites con margen y los deja centrados", () => {
    const t = boundsToTransform({ bounds, size, padding: 20, scaleExtent: [1, 12] });

    // limita el ancho: (960 − 40) / 200 = 4,6;  alto: (500 − 40) / 100 = 4,6 → empate
    expect(t.k).toBeCloseTo(4.6);
    // el centro de los límites (200, 150) cae en el centro de la vista (480, 250)
    expect(applyTransform(t, [200, 150])[0]).toBeCloseTo(480);
    expect(applyTransform(t, [200, 150])[1]).toBeCloseTo(250);
  });

  it("la dimensión más restrictiva manda", () => {
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

  it("respeta scaleExtent en los dos sentidos (país minúsculo / país enorme)", () => {
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
    // incluso al límite, el país queda centrado
    expect(applyTransform(tiny, [10.5, 10.5])).toEqual([480, 250]);
  });

  it("acepta un margen distinto en cada lado", () => {
    const t = boundsToTransform({
      bounds: [
        [0, 0],
        [100, 100],
      ],
      size: { width: 300, height: 300 },
      padding: { top: 0, right: 0, bottom: 0, left: 100 },
    });

    // ancho útil 200 → k = 2; el contenido ocupa [100, 300] en pantalla
    expect(t.k).toBeCloseTo(2);
    expect(applyTransform(t, [0, 0])[0]).toBeCloseTo(100);
    expect(applyTransform(t, [100, 0])[0]).toBeCloseTo(300);
  });

  it("límites degenerados (un punto) no dan Infinity ni NaN", () => {
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

  it("un margen que se come la vista baja a k mínimo en vez de dar negativo", () => {
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
  it("un número vale para los cuatro lados; por defecto 24; un objeto se respeta", () => {
    expect(normalizePadding(10)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(normalizePadding()).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
    const own = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(normalizePadding(own)).toBe(own);
  });
});

describe("preserveView", () => {
  // Proyecciones reales: lo que cambia al redimensionar es la escala y la traslación.
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

  it("el centro geográfico es el mismo antes y después de redimensionar", () => {
    // Una vista a k = 4 centrada en España.
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

  it("en el encaje, sigue siendo el encaje del tamaño nuevo", () => {
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

  it("si el centro cae fuera de la proyección, vuelve al encaje", () => {
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

  it("siempre dentro de [350, 1200] ms", () => {
    const tiny = flightDuration({ from: at(1), to: at(1.001), size });
    const huge = flightDuration({ from: at(1), to: at(12, -9000, -4000), size });

    expect(tiny).toBe(MIN_FLIGHT_MS);
    expect(huge).toBeLessThanOrEqual(MAX_FLIGHT_MS);
    expect(huge).toBeGreaterThan(MIN_FLIGHT_MS);
  });

  it("un vuelo largo dura más que uno corto", () => {
    const short = flightDuration({ from: at(1), to: at(2, -200, -100), size, speed: 2 });
    const long = flightDuration({ from: at(1), to: at(8, -6000, -2500), size, speed: 2 });

    expect(long).toBeGreaterThan(short);
  });

  it("mismo destino = duración mínima (no NaN)", () => {
    expect(flightDuration({ from: at(3, -5, -5), to: at(3, -5, -5), size })).toBe(MIN_FLIGHT_MS);
  });

  it("speed escala la duración (dentro de los límites)", () => {
    const params = { from: at(1), to: at(4, -1500, -700), size };
    const normal = flightDuration(params);
    const slow = flightDuration({ ...params, speed: 1.2 });

    expect(slow).toBeGreaterThanOrEqual(normal);
  });

  it("un transform inválido cae al mínimo en vez de devolver NaN", () => {
    expect(flightDuration({ from: at(NaN), to: at(2), size })).toBe(MIN_FLIGHT_MS);
  });

  it("la curvatura se aplica de verdad (d3 la expone en la función, no en el interpolador)", () => {
    // Un vuelo largo con velocidad que no choque con los límites: la curvatura cambia la duración.
    const params = { from: at(1), to: at(4, -1200, -600), size };
    const low = flightDuration({ ...params, curvature: 0.3 });
    const high = flightDuration({ ...params, curvature: 3 });

    expect(low).not.toBe(high);
  });
});

describe("transformToZoomView", () => {
  it("el encaje se ve centrado y con todo el ancho; con k = 2 la vista es la mitad", () => {
    expect(transformToZoomView(FIT_TRANSFORM, size)).toEqual([480, 250, 960]);
    expect(transformToZoomView({ k: 2, x: -480, y: -250 }, size)).toEqual([480, 250, 480]);
  });
});

describe("inertiaOffset", () => {
  it("al soltar (t = 0) no se ha movido", () => {
    expect(inertiaOffset({ velocity: 1, elapsed: 0 })).toBe(0);
  });

  it("tiende a v·τ y nunca lo supera", () => {
    const limit = 1.5 * INERTIA_TAU_MS;

    expect(inertiaOffset({ velocity: 1.5, elapsed: 5000 })).toBeCloseTo(limit, 3);
    expect(inertiaOffset({ velocity: 1.5, elapsed: 300 })).toBeLessThan(limit);
  });

  it("a t = τ ha recorrido el 63,2 % del total (1 − 1/e)", () => {
    const offset = inertiaOffset({ velocity: 2, elapsed: INERTIA_TAU_MS });

    expect(offset / (2 * INERTIA_TAU_MS)).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("es monótona, conserva el signo y admite otra τ", () => {
    const a = inertiaOffset({ velocity: -1, elapsed: 100 });
    const b = inertiaOffset({ velocity: -1, elapsed: 200 });

    expect(a).toBeLessThan(0);
    expect(b).toBeLessThan(a);
    expect(inertiaOffset({ velocity: 1, elapsed: 100, tau: 50 })).toBeLessThan(50);
  });

  it("tiempo negativo, NaN o velocidad no finita: no se mueve", () => {
    expect(inertiaOffset({ velocity: 1, elapsed: -10 })).toBe(0);
    expect(inertiaOffset({ velocity: 1, elapsed: NaN })).toBe(0);
    expect(inertiaOffset({ velocity: NaN, elapsed: 100 })).toBe(0);
  });
});

describe("releaseVelocity", () => {
  const at = (time: number, x: number, y = 0, k = 2): CameraSample => ({ time, k, x, y });

  it("mide px/ms entre la primera y la última muestra de la ventana", () => {
    const v = releaseVelocity({ samples: [at(0, 0), at(20, 10), at(40, 40)], now: 50 });

    expect(v?.[0]).toBeCloseTo(1, 6);
    expect(v?.[1]).toBeCloseTo(0, 6);
  });

  it("ignora las muestras más viejas que la ventana (100 ms)", () => {
    const v = releaseVelocity({ samples: [at(0, 0), at(60, 1000), at(100, 1060)], now: 120 });

    // Solo cuentan t = 60 y t = 100: 60 px en 40 ms.
    expect(v?.[0]).toBeCloseTo(1.5, 6);
  });

  it("si la mano se detuvo antes de soltar, no hay inercia", () => {
    expect(releaseVelocity({ samples: [at(0, 0), at(20, 100)], now: 400 })).toBeNull();
  });

  it("por debajo de 0,3 px/ms no hay inercia; justo en el umbral, sí", () => {
    expect(releaseVelocity({ samples: [at(0, 0), at(100, 29)], now: 100 })).toBeNull();
    expect(releaseVelocity({ samples: [at(0, 0), at(100, 31)], now: 100 })).not.toBeNull();
  });

  it("un zoom dentro de la ventana la cancela (la inercia es solo de pan)", () => {
    const zoomed = [at(0, 0, 0, 2), at(50, 50, 0, 2.5), at(90, 100, 0, 3)];

    expect(releaseVelocity({ samples: zoomed, now: 100 })).toBeNull();
  });

  it("sin dos muestras, o con el mismo instante, no hay velocidad", () => {
    expect(releaseVelocity({ samples: [], now: 0 })).toBeNull();
    expect(releaseVelocity({ samples: [at(0, 0)], now: 0 })).toBeNull();
    expect(releaseVelocity({ samples: [at(5, 0), at(5, 100)], now: 5 })).toBeNull();
  });

  it("usa los dos ejes: la velocidad es el módulo", () => {
    const v = releaseVelocity({ samples: [at(0, 0, 0), at(100, 24, 32)], now: 100 });

    expect(v).toEqual([0.24, 0.32]);
  });
});

describe("bubbleScale", () => {
  it("sqrt: 1/√k", () => {
    expect(bubbleScale(4, "sqrt")).toBeCloseTo(0.5, 10);
    expect(bubbleScale(1, "sqrt")).toBe(1);
  });

  it("screen: 1/k (tamaño constante en pantalla)", () => {
    expect(bubbleScale(4, "screen")).toBe(0.25);
  });

  it("geo: 1 (crecen con el mapa)", () => {
    expect(bubbleScale(4, "geo")).toBe(1);
  });

  it("una k inválida no rompe: escala 1", () => {
    expect(bubbleScale(0, "sqrt")).toBe(1);
    expect(bubbleScale(NaN, "screen")).toBe(1);
  });

  it("al multiplicarla por k, sqrt crece √k y screen no crece", () => {
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

  it("expone k, zoom, x, y, nivel por defecto y centro geográfico", () => {
    const view = toViewState({ transform: FIT_TRANSFORM, size, invert });

    expect(view).toMatchObject({ k: 1, zoom: 1, x: 0, y: 0, level: { id: "root", depth: 0 } });
    expect(view.center[0]).toBeCloseTo(0, 1);
    expect(view.center[1]).toBeCloseTo(0, 1);
  });

  it("acercar reduce los límites visibles y los centra donde se miró", () => {
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

  it("las esquinas fuera del globo no rompen los límites (se descartan)", () => {
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

  it("si nada proyecta, devuelve el mundo entero y el centro [0, 0]", () => {
    const view = toViewState({ transform: FIT_TRANSFORM, size, invert: () => null });

    expect(view.bounds).toEqual([
      [-180, -90],
      [180, 90],
    ]);
    expect(view.center).toEqual([0, 0]);
  });

  it("si solo el centro cae fuera, lo estima con los límites visibles", () => {
    const view = toViewState({
      transform: FIT_TRANSFORM,
      size,
      // todo proyecta salvo exactamente el centro de la vista
      invert: (p) => (p[0] === 480 && p[1] === 250 ? null : ([p[0] / 10, p[1] / 10] as Point)),
    });

    expect(Number.isFinite(view.center[0]) && Number.isFinite(view.center[1])).toBe(true);
  });

  it("una proyección que devuelve NaN se trata como «fuera del globo»", () => {
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
  it("el encaje y lo que está a un suspiro de él cuentan; lo demás no", () => {
    expect(isFitTransform(FIT_TRANSFORM)).toBe(true);
    expect(isFitTransform({ k: 1.0001, x: 0.0001, y: -0.0001 })).toBe(true);
    expect(isFitTransform({ k: 2, x: 0, y: 0 })).toBe(false);
    expect(isFitTransform({ k: 1, x: 5, y: 0 })).toBe(false);
    expect(isFitTransform({ k: 1, x: 0, y: 5 })).toBe(false);
  });
});

describe("createZoomInterpolator", () => {
  it("devuelve un interpolateZoom con esa curvatura (d3 la expone en la función)", () => {
    const view = [0, 0, 960] as [number, number, number];
    const target = [100, 50, 120] as [number, number, number];

    expect(createZoomInterpolator(0.5)(view, target).duration).not.toBe(
      createZoomInterpolator(2)(view, target).duration,
    );
  });
});
