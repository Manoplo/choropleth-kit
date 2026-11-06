import {
  classifyDrill,
  createDrillState,
  drillReducer,
  layerKey,
  savedCameraFor,
  type DrillMachineEvent,
  type DrillMachineState,
} from "./drill";

const run = (state: DrillMachineState, ...events: DrillMachineEvent[]) =>
  events.reduce(drillReducer, state);

const roles = (state: DrillMachineState) =>
  Object.fromEntries(state.layers.map((l) => [l.key, l.role]));

const WORLD = layerKey([]);
const ES = layerKey(["ES"]);
const FR = layerKey(["FR"]);
const ES_MD = layerKey(["ES", "MD"]);

const cam = { k: 2, x: -10, y: -5 };
const camEurope = { k: 3, x: -100, y: -40 };

/** Baja a ["ES"] y termina la coreografía entera. */
const atSpain = (camera = cam) => {
  let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera });
  s = run(
    s,
    { type: "GEOMETRY_READY", key: ES },
    { type: "FLIGHT_END", id: s.flightId, completed: true },
    { type: "REVEAL_END" },
  );
  return s;
};

describe("classifyDrill", () => {
  it.each([
    [[], [], "equal"],
    [[], ["ES"], "down"],
    [["ES"], ["ES", "MD"], "down"],
    [["ES", "MD"], ["ES"], "up"],
    [["ES", "MD"], [], "up"],
    [["ES"], ["FR"], "lateral"],
    [["ES", "MD"], ["ES", "BC"], "lateral"],
    [[], ["ES", "MD"], "jump"],
    [["ES", "MD"], ["FR"], "jump"],
    [["ES"], ["FR", "PA"], "jump"],
  ] as const)("%j → %j = %s", (from, to, expected) => {
    expect(classifyDrill(from, to)).toBe(expected);
  });
});

describe("layerKey", () => {
  it("no colisiona aunque un id contenga separadores", () => {
    expect(layerKey(["a/b"])).not.toBe(layerKey(["a", "b"]));
    expect(layerKey(["a.b"])).not.toBe(layerKey(["a", "b"]));
  });

  it("la profundidad por defecto es la del path", () => {
    expect(layerKey(["ES", "MD"])).toBe(layerKey(["ES", "MD"], 2));
    expect(layerKey(["ES", "MD"], 1)).toBe(ES);
  });
});

describe("estado inicial", () => {
  it("el mundo: una capa activa, en reposo", () => {
    const s = createDrillState();

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [], direction: null });
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("montar con una ruta (URL) pinta el estado final: ancestros en contexto", () => {
    const s = createDrillState(["ES", "MD"]);

    expect(s.phase).toBe("idle");
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "context", [ES_MD]: "active" });
  });
});

describe("bajar (down)", () => {
  it("el clic es optimista: path cambia YA, pero la capa activa sigue siendo el padre", () => {
    const s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });

    expect(s).toMatchObject({
      phase: "flying",
      path: ["ES"],
      settledPath: [],
      direction: "down",
      flight: "pending",
      geometry: "pending",
      geometryKey: ES,
    });
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("guarda la cámara del nivel de origen para poder volver a ella", () => {
    const s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });

    expect(savedCameraFor(s, [])).toEqual(cam);
  });

  it("vuelo terminado + geometría lista → revelado: el padre pasa a contexto, el hijo entra", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "GEOMETRY_READY", key: ES });
    expect(s.phase).toBe("flying"); // aún vuela: el rebase espera al fin del vuelo
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });

    expect(s.phase).toBe("revealing");
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "entering" });
  });

  it("REVEAL_END deja el hijo activo y todo en reposo", () => {
    const s = atSpain();

    expect(s).toMatchObject({ phase: "idle", settledPath: ["ES"], direction: null });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "active" });
  });

  it("si el vuelo acaba antes que la geometría → loading; al llegar, revelado", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s.phase).toBe("loading");
    expect(roles(s)).toEqual({ [WORLD]: "active" }); // el padre «respira», no se toca

    s = run(s, { type: "GEOMETRY_READY", key: ES });
    expect(s.phase).toBe("revealing");
  });

  it("con la geometría en caché no hay espera: el fin del vuelo revela directamente", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], cached: true });
    expect(s.geometry).toBe("ready");
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });

    expect(s.phase).toBe("revealing");
  });

  it("bajar dos niveles seguidos apila contexto", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope, cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });

    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "context", [ES_MD]: "active" });
    expect(savedCameraFor(s, [])).toEqual(cam);
    expect(savedCameraFor(s, ["ES"])).toEqual(camEurope);
  });
});

describe("clic durante un vuelo (redirección)", () => {
  it("a otro hijo: nuevo vuelo, la carga vieja se ignora y la cámara de partida se conserva", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    const firstFlight = s.flightId;
    s = run(s, { type: "DRILL", to: ["FR"], camera: camEurope }); // cámara a mitad de vuelo

    expect(s).toMatchObject({
      phase: "flying",
      path: ["FR"],
      geometryKey: FR,
      geometry: "pending",
    });
    expect(s.flightId).toBeGreaterThan(firstFlight);
    expect(savedCameraFor(s, [])).toEqual(cam); // no se sobrescribe con la de mitad de vuelo
    expect(s.returnCamera).toEqual(cam);

    // La geometría de ES llega tarde: no cuenta. El FLIGHT_END del vuelo cortado, tampoco.
    expect(run(s, { type: "GEOMETRY_READY", key: ES })).toBe(s);
    expect(run(s, { type: "FLIGHT_END", id: firstFlight, completed: false })).toBe(s);

    s = run(
      s,
      { type: "GEOMETRY_READY", key: FR },
      { type: "FLIGHT_END", id: s.flightId, completed: true },
    );
    expect(roles(s)).toEqual({ [WORLD]: "context", [FR]: "entering" });
  });

  it("mientras carga (loading) también redirige", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    s = run(s, { type: "DRILL", to: ["FR"] });

    expect(s).toMatchObject({ phase: "flying", path: ["FR"], geometryKey: FR });
  });

  it("el mismo destino otra vez (clic repetido): no reinicia el vuelo ni pierde la geometría", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "GEOMETRY_READY", key: ES });
    const again = run(s, { type: "DRILL", to: ["ES"], camera: camEurope });

    expect(again).toBe(s);
    expect(again.geometry).toBe("ready");
  });

  it("clic durante el revelado: lo asienta y empieza el vuelo siguiente", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s.phase).toBe("revealing");
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope });

    expect(s).toMatchObject({ phase: "flying", settledPath: ["ES"], direction: "down" });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "active" });
  });
});

describe("cancelar una bajada", () => {
  it("un gesto del usuario corta el vuelo de bajada: se cancela, sin vuelo de vuelta", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: false });

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [], direction: null });
    expect(s.geometryKey).toBeNull();
    // Una carga que llega tarde ya no hace nada.
    expect(run(s, { type: "GEOMETRY_READY", key: ES })).toBe(s);
  });

  it("subir antes de terminar de bajar: cancela la carga y vuela de vuelta", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "DRILL", to: [] });

    expect(s).toMatchObject({
      phase: "flying",
      path: [],
      settledPath: [],
      direction: "up",
      geometry: null,
      geometryKey: null,
    });
    expect(s.returnCamera).toEqual(cam);
    expect(run(s, { type: "GEOMETRY_READY", key: ES })).toBe(s);
    expect(run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }).phase).toBe("idle");
  });
});

describe("subir (up)", () => {
  it("la capa hija sale, el contexto vuelve a activo y se vuela a la cámara de antes", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });

    expect(s).toMatchObject({ phase: "flying", direction: "up", path: [], settledPath: [] });
    expect(roles(s)).toEqual({ [WORLD]: "active", [ES]: "exiting" });
    expect(savedCameraFor(s, [])).toEqual(cam);
  });

  it("al terminar el vuelo desaparece la capa que salía", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });

    expect(s.phase).toBe("idle");
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("un gesto que corta la subida no deshace nada: ya se había subido", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: false });

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [] });
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("varios niveles de golpe (breadcrumb): salen todas las capas intermedias", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope, cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });
    s = run(s, { type: "DRILL", to: [] });

    expect(roles(s)).toEqual({ [WORLD]: "active", [ES]: "exiting", [ES_MD]: "exiting" });
    expect(savedCameraFor(s, [])).toEqual(cam);
    expect(savedCameraFor(s, ["ES"])).toBeNull(); // ya no hay a qué volver desde ahí
  });

  it("subir un nivel conserva la cámara del nivel al que se llega", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope, cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });
    s = run(s, { type: "DRILL", to: ["ES"] });

    expect(savedCameraFor(s, ["ES"])).toEqual(camEurope);
    expect(savedCameraFor(s, [])).toEqual(cam);
  });

  it("subir y volver a bajar a otro sitio guarda la cámara nueva", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    s = run(s, { type: "DRILL", to: ["FR"], camera: camEurope });

    expect(savedCameraFor(s, [])).toEqual(camEurope);
  });

  it("clic en reposo sobre el mismo path: no hace nada", () => {
    const s = atSpain();

    expect(run(s, { type: "DRILL", to: ["ES"] })).toEqual({ ...s, error: null });
  });
});

describe("lateral", () => {
  it("un único vuelo a un hermano; el contexto se mantiene y las regiones viejas salen", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["FR"], camera: camEurope });
    expect(s).toMatchObject({ phase: "flying", direction: "lateral", path: ["FR"] });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "active" });
    expect(savedCameraFor(s, [])).toEqual(cam); // la cámara de «antes de bajar» no se pisa

    s = run(
      s,
      { type: "GEOMETRY_READY", key: FR },
      { type: "FLIGHT_END", id: s.flightId, completed: true },
    );
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "exiting", [FR]: "entering" });

    s = run(s, { type: "REVEAL_END" });
    expect(roles(s)).toEqual({ [WORLD]: "context", [FR]: "active" });
    expect(s.settledPath).toEqual(["FR"]);
  });

  it("después, subir vuela a la cámara que había antes de bajar a España", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["FR"], cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });
    s = run(s, { type: "DRILL", to: [] });

    expect(savedCameraFor(s, [])).toEqual(cam);
  });
});

describe("salto (jump)", () => {
  it("con todo en caché: estado final directo, sin vuelo ni revelado", () => {
    const s = run(createDrillState(), {
      type: "DRILL",
      to: ["ES", "MD"],
      direction: "jump",
      cached: true,
    });

    expect(s).toMatchObject({ phase: "idle", path: ["ES", "MD"], settledPath: ["ES", "MD"] });
    expect(s.flight).toBe("done");
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "context", [ES_MD]: "active" });
  });

  it("sin caché: loading hasta que llegue la geometría, y entonces asienta sin animar", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES", "MD"], direction: "jump" });
    expect(s).toMatchObject({ phase: "loading", direction: "jump", flight: "done" });
    expect(roles(s)).toEqual({ [WORLD]: "active" });

    s = run(s, { type: "GEOMETRY_READY", key: ES_MD });
    expect(s).toMatchObject({ phase: "idle", settledPath: ["ES", "MD"], direction: null });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "context", [ES_MD]: "active" });
  });

  it("un cambio de path que no es down/up/lateral (otra rama) también es un salto", () => {
    const s = run(atSpain(), { type: "DRILL", to: ["FR", "PA"], cached: true });

    expect(s).toMatchObject({ phase: "idle", settledPath: ["FR", "PA"] });
  });

  it("si la geometría falla, se queda donde estaba", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES", "MD"], direction: "jump" });
    s = run(s, { type: "GEOMETRY_ERROR", key: ES_MD });

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [], error: ES_MD });
  });
});

describe("errores de geometría", () => {
  it("falla durante el vuelo: se espera al fin del vuelo y se vuela de vuelta", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "GEOMETRY_ERROR", key: ES });
    expect(s).toMatchObject({ phase: "flying", geometry: "error", error: ES });

    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s).toMatchObject({ phase: "flying", direction: "up", path: [], settledPath: [] });
    expect(s.returnCamera).toEqual(cam);
    expect(roles(s)).toEqual({ [WORLD]: "active" });

    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s).toMatchObject({ phase: "idle", error: ES }); // el error se conserva para `onDrillError`
  });

  it("falla mientras carga (el vuelo ya terminó): vuelta atrás inmediata", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    s = run(s, { type: "GEOMETRY_ERROR", key: ES });

    expect(s).toMatchObject({ phase: "flying", direction: "up", path: [], error: ES });
  });

  it("el siguiente DRILL limpia el error", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(
      s,
      { type: "GEOMETRY_ERROR", key: ES },
      { type: "FLIGHT_END", id: s.flightId, completed: true },
    );
    s = run(s, { type: "DRILL", to: ["FR"] });

    expect(s.error).toBeNull();
  });

  it("un error de una geometría vieja (ya redirigido) se ignora", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "DRILL", to: ["FR"] });

    expect(run(s, { type: "GEOMETRY_ERROR", key: ES })).toBe(s);
  });

  it("un error con la geometría ya lista, o en reposo, no hace nada", () => {
    const ready = run(createDrillState(), { type: "DRILL", to: ["ES"], cached: true });

    expect(run(ready, { type: "GEOMETRY_ERROR", key: ES })).toBe(ready);
    expect(run(createDrillState(), { type: "GEOMETRY_ERROR", key: ES })).toEqual(
      createDrillState(),
    );
  });
});

describe("eventos fuera de lugar", () => {
  it("FLIGHT_END, GEOMETRY_READY y REVEAL_END en reposo no hacen nada", () => {
    const s = createDrillState();

    expect(run(s, { type: "FLIGHT_END", id: 0, completed: true })).toBe(s);
    expect(run(s, { type: "GEOMETRY_READY", key: WORLD })).toBe(s);
    expect(run(s, { type: "REVEAL_END" })).toBe(s);
  });

  it("REVEAL_END antes de tiempo (volando) no asienta nada", () => {
    const s = run(createDrillState(), { type: "DRILL", to: ["ES"] });

    expect(run(s, { type: "REVEAL_END" })).toBe(s);
  });

  it("el reducer no muta el estado de entrada", () => {
    const before = createDrillState();
    const snapshot = JSON.stringify(before);
    run(before, { type: "DRILL", to: ["ES"], camera: cam });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
