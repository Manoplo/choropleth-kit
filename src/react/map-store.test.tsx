import { act, renderHook } from "@testing-library/react";
import { createMapStore, useMapStore } from "./map-store";

describe("map-store", () => {
  it("estado inicial vacío y setState fusiona parches", () => {
    const store = createMapStore();
    expect(store.getState()).toEqual({ hoveredId: null, pointer: null });
    store.setState({ hoveredId: "A" });
    store.setState({ pointer: { x: 1, y: 2 } });
    expect(store.getState()).toEqual({ hoveredId: "A", pointer: { x: 1, y: 2 } });
  });

  it("no notifica si no cambia nada y deja de notificar al desuscribirse", () => {
    const store = createMapStore();
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);
    store.setState({ hoveredId: "A" });
    store.setState({ hoveredId: "A" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setState({ hoveredId: "B" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("useMapStore solo re-renderiza cuando cambia lo seleccionado", () => {
    const store = createMapStore();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useMapStore(store, (s) => s.hoveredId);
    });
    expect(result.current).toBeNull();
    const initial = renders;

    act(() => store.setState({ pointer: { x: 5, y: 5 } }));
    expect(renders).toBe(initial);

    act(() => store.setState({ hoveredId: "A" }));
    expect(result.current).toBe("A");
    expect(renders).toBe(initial + 1);
  });
});
