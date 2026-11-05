import { createZoomFilter, resolveZoomOptions, type ZoomFilterParams } from "./zoom";

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
