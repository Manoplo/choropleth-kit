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

/** Goes down to ["ES"] and finishes the whole choreography. */
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
  it("does not collide even if an id contains separators", () => {
    expect(layerKey(["a/b"])).not.toBe(layerKey(["a", "b"]));
    expect(layerKey(["a.b"])).not.toBe(layerKey(["a", "b"]));
  });

  it("the default depth is the path's", () => {
    expect(layerKey(["ES", "MD"])).toBe(layerKey(["ES", "MD"], 2));
    expect(layerKey(["ES", "MD"], 1)).toBe(ES);
  });
});

describe("estado inicial", () => {
  it("the world: one active layer, at rest", () => {
    const s = createDrillState();

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [], direction: null });
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("mounting with a route (URL) paints the final state: ancestors as context", () => {
    const s = createDrillState(["ES", "MD"]);

    expect(s.phase).toBe("idle");
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "context", [ES_MD]: "active" });
  });
});

describe("bajar (down)", () => {
  it("the click is optimistic: path changes NOW, but the active layer is still the parent", () => {
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

  it("saves the origin level's camera so it can be returned to", () => {
    const s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });

    expect(savedCameraFor(s, [])).toEqual(cam);
  });

  it("flight finished + geometry ready → reveal: the parent becomes context, the child enters", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "GEOMETRY_READY", key: ES });
    expect(s.phase).toBe("flying"); // still flying: the rebase waits for the end of the flight
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });

    expect(s.phase).toBe("revealing");
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "entering" });
  });

  it("REVEAL_END leaves the child active and everything at rest", () => {
    const s = atSpain();

    expect(s).toMatchObject({ phase: "idle", settledPath: ["ES"], direction: null });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "active" });
  });

  it("if the flight ends before the geometry → loading; on arrival, reveal", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s.phase).toBe("loading");
    expect(roles(s)).toEqual({ [WORLD]: "active" }); // the parent "breathes", it is not touched

    s = run(s, { type: "GEOMETRY_READY", key: ES });
    expect(s.phase).toBe("revealing");
  });

  it("with the geometry cached there is no wait: the end of the flight reveals directly", () => {
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

describe("click during a flight (redirect)", () => {
  it("to another child: new flight, the old load is ignored and the starting camera is kept", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    const firstFlight = s.flightId;
    s = run(s, { type: "DRILL", to: ["FR"], camera: camEurope }); // camera mid-flight

    expect(s).toMatchObject({
      phase: "flying",
      path: ["FR"],
      geometryKey: FR,
      geometry: "pending",
    });
    expect(s.flightId).toBeGreaterThan(firstFlight);
    expect(savedCameraFor(s, [])).toEqual(cam); // it is not overwritten with the mid-flight one
    expect(s.returnCamera).toEqual(cam);

    // ES's geometry arrives late: it does not count. The cut flight's FLIGHT_END does not either.
    expect(run(s, { type: "GEOMETRY_READY", key: ES })).toBe(s);
    expect(run(s, { type: "FLIGHT_END", id: firstFlight, completed: false })).toBe(s);

    s = run(
      s,
      { type: "GEOMETRY_READY", key: FR },
      { type: "FLIGHT_END", id: s.flightId, completed: true },
    );
    expect(roles(s)).toEqual({ [WORLD]: "context", [FR]: "entering" });
  });

  it("while loading it also redirects", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    s = run(s, { type: "DRILL", to: ["FR"] });

    expect(s).toMatchObject({ phase: "flying", path: ["FR"], geometryKey: FR });
  });

  it("the same target again (repeated click): neither restarts the flight nor loses the geometry", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "GEOMETRY_READY", key: ES });
    const again = run(s, { type: "DRILL", to: ["ES"], camera: camEurope });

    expect(again).toBe(s);
    expect(again.geometry).toBe("ready");
  });

  it("click during the reveal: it settles it and starts the next flight", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s.phase).toBe("revealing");
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope });

    expect(s).toMatchObject({ phase: "flying", settledPath: ["ES"], direction: "down" });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "active" });
  });
});

describe("cancel a descent", () => {
  it("a user gesture cuts the descent flight: it is cancelled, with no flight back", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: false });

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [], direction: null });
    expect(s.geometryKey).toBeNull();
    // A load that arrives late no longer does anything.
    expect(run(s, { type: "GEOMETRY_READY", key: ES })).toBe(s);
  });

  it("going up before finishing going down: cancels the load and flies back", () => {
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
  it("the child layer leaves, the context becomes active again and it flies to the earlier camera", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });

    expect(s).toMatchObject({ phase: "flying", direction: "up", path: [], settledPath: [] });
    expect(roles(s)).toEqual({ [WORLD]: "active", [ES]: "exiting" });
    expect(savedCameraFor(s, [])).toEqual(cam);
  });

  it("when the flight ends, the layer that was leaving disappears", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });

    expect(s.phase).toBe("idle");
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("a gesture that cuts the ascent undoes nothing: it had already gone up", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: false });

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [] });
    expect(roles(s)).toEqual({ [WORLD]: "active" });
  });

  it("several levels at once (breadcrumb): all the intermediate layers leave", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope, cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });
    s = run(s, { type: "DRILL", to: [] });

    expect(roles(s)).toEqual({ [WORLD]: "active", [ES]: "exiting", [ES_MD]: "exiting" });
    expect(savedCameraFor(s, [])).toEqual(cam);
    expect(savedCameraFor(s, ["ES"])).toBeNull(); // there is nothing left to return to from there
  });

  it("going up one level keeps the camera of the level reached", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["ES", "MD"], camera: camEurope, cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });
    s = run(s, { type: "DRILL", to: ["ES"] });

    expect(savedCameraFor(s, ["ES"])).toEqual(camEurope);
    expect(savedCameraFor(s, [])).toEqual(cam);
  });

  it("going up and then down somewhere else saves the new camera", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: [] });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    s = run(s, { type: "DRILL", to: ["FR"], camera: camEurope });

    expect(savedCameraFor(s, [])).toEqual(camEurope);
  });

  it("click at rest on the same path: does nothing", () => {
    const s = atSpain();

    expect(run(s, { type: "DRILL", to: ["ES"] })).toEqual({ ...s, error: null });
  });
});

describe("lateral", () => {
  it("a single flight to a sibling; the context stays and the old regions leave", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["FR"], camera: camEurope });
    expect(s).toMatchObject({ phase: "flying", direction: "lateral", path: ["FR"] });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "active" });
    expect(savedCameraFor(s, [])).toEqual(cam); // the "before going down" camera is not overwritten

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

  it("afterwards, going up flies to the camera from before going down to Spain", () => {
    let s = atSpain();
    s = run(s, { type: "DRILL", to: ["FR"], cached: true });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true }, { type: "REVEAL_END" });
    s = run(s, { type: "DRILL", to: [] });

    expect(savedCameraFor(s, [])).toEqual(cam);
  });
});

describe("salto (jump)", () => {
  it("with everything cached: direct final state, no flight or reveal", () => {
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

  it("without cache: loading until the geometry arrives, then it settles without animating", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES", "MD"], direction: "jump" });
    expect(s).toMatchObject({ phase: "loading", direction: "jump", flight: "done" });
    expect(roles(s)).toEqual({ [WORLD]: "active" });

    s = run(s, { type: "GEOMETRY_READY", key: ES_MD });
    expect(s).toMatchObject({ phase: "idle", settledPath: ["ES", "MD"], direction: null });
    expect(roles(s)).toEqual({ [WORLD]: "context", [ES]: "context", [ES_MD]: "active" });
  });

  it("a path change that is not down/up/lateral (another branch) is also a jump", () => {
    const s = run(atSpain(), { type: "DRILL", to: ["FR", "PA"], cached: true });

    expect(s).toMatchObject({ phase: "idle", settledPath: ["FR", "PA"] });
  });

  it("if the geometry fails, it stays where it was", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES", "MD"], direction: "jump" });
    s = run(s, { type: "GEOMETRY_ERROR", key: ES_MD });

    expect(s).toMatchObject({ phase: "idle", path: [], settledPath: [], error: ES_MD });
  });
});

describe("geometry errors", () => {
  it("fails during the flight: waits for the end of the flight and flies back", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "GEOMETRY_ERROR", key: ES });
    expect(s).toMatchObject({ phase: "flying", geometry: "error", error: ES });

    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s).toMatchObject({ phase: "flying", direction: "up", path: [], settledPath: [] });
    expect(s.returnCamera).toEqual(cam);
    expect(roles(s)).toEqual({ [WORLD]: "active" });

    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    expect(s).toMatchObject({ phase: "idle", error: ES }); // the error is kept for `onDrillError`
  });

  it("fails while loading (the flight already ended): immediate backing out", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"], camera: cam });
    s = run(s, { type: "FLIGHT_END", id: s.flightId, completed: true });
    s = run(s, { type: "GEOMETRY_ERROR", key: ES });

    expect(s).toMatchObject({ phase: "flying", direction: "up", path: [], error: ES });
  });

  it("the next DRILL clears the error", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(
      s,
      { type: "GEOMETRY_ERROR", key: ES },
      { type: "FLIGHT_END", id: s.flightId, completed: true },
    );
    s = run(s, { type: "DRILL", to: ["FR"] });

    expect(s.error).toBeNull();
  });

  it("an error from an old geometry (already redirected) is ignored", () => {
    let s = run(createDrillState(), { type: "DRILL", to: ["ES"] });
    s = run(s, { type: "DRILL", to: ["FR"] });

    expect(run(s, { type: "GEOMETRY_ERROR", key: ES })).toBe(s);
  });

  it("an error with the geometry already ready, or at rest, does nothing", () => {
    const ready = run(createDrillState(), { type: "DRILL", to: ["ES"], cached: true });

    expect(run(ready, { type: "GEOMETRY_ERROR", key: ES })).toBe(ready);
    expect(run(createDrillState(), { type: "GEOMETRY_ERROR", key: ES })).toEqual(
      createDrillState(),
    );
  });
});

describe("out-of-place events", () => {
  it("FLIGHT_END, GEOMETRY_READY and REVEAL_END at rest do nothing", () => {
    const s = createDrillState();

    expect(run(s, { type: "FLIGHT_END", id: 0, completed: true })).toBe(s);
    expect(run(s, { type: "GEOMETRY_READY", key: WORLD })).toBe(s);
    expect(run(s, { type: "REVEAL_END" })).toBe(s);
  });

  it("REVEAL_END too early (while flying) settles nothing", () => {
    const s = run(createDrillState(), { type: "DRILL", to: ["ES"] });

    expect(run(s, { type: "REVEAL_END" })).toBe(s);
  });

  it("the reducer does not mutate the input state", () => {
    const before = createDrillState();
    const snapshot = JSON.stringify(before);
    run(before, { type: "DRILL", to: ["ES"], camera: cam });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
