import { act, renderHook } from "@testing-library/react";
import type { ItemRef } from "./map-item";
import { createMapStore, useMapStore } from "./map-store";

describe("map-store", () => {
  it("estado inicial vacío y setState fusiona parches", () => {
    const store = createMapStore();
    expect(store.getState()).toEqual({ hovered: null, pointer: null });
    store.setState({ hovered: { kind: "region", id: "A" } });
    store.setState({ pointer: { x: 1, y: 2 } });
    expect(store.getState()).toEqual({
      hovered: { kind: "region", id: "A" },
      pointer: { x: 1, y: 2 },
    });
  });

  it("no notifica si no cambia nada y deja de notificar al desuscribirse", () => {
    const store = createMapStore();
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);
    const a: ItemRef = { kind: "region", id: "A" };
    store.setState({ hovered: a });
    store.setState({ hovered: a });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setState({ hovered: { kind: "region", id: "B" } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("useMapStore solo re-renderiza cuando cambia lo seleccionado", () => {
    const store = createMapStore();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useMapStore(store, (s) => s.hovered?.id ?? null);
    });
    expect(result.current).toBeNull();
    const initial = renders;

    act(() => store.setState({ pointer: { x: 5, y: 5 } }));
    expect(renders).toBe(initial);

    act(() => store.setState({ hovered: { kind: "point", id: "A" } }));
    expect(result.current).toBe("A");
    expect(renders).toBe(initial + 1);
  });
});
