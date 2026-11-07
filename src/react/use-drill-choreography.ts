import { useEffect, useRef } from "react";
import {
  FIT_TRANSFORM,
  relativeTransform,
  savedCameraFor,
  type CameraTransform,
  type ChainLevel,
  type ProjectionChain,
} from "../core";
import { prefersReducedMotion } from "./env";
import type { MapStore } from "./map-store";
import type { DrillEngine } from "./use-drill-engine";

/**
 * Duración del revelado (dd.md §11.2.3): 200 ms de fundido + hasta 250 ms de escalonado por distancia al
 * punto del clic. Con «reducir movimiento» es 0: el nivel nuevo aparece sin animar.
 */
export const REVEAL_MS = 450;

export type UseDrillChoreographyParams<TDatum> = {
  engine: DrillEngine<TDatum>;
  store: MapStore;
  /** La cadena de proyecciones de lo que se muestra (o `null` si aún no hay). */
  shownChain: ProjectionChain | null;
  /** Construye la cadena de una ruta con el tamaño, el padding y los encuadres vigentes. */
  chainFor: (levels: ChainLevel[], path: readonly string[]) => ProjectionChain;
};

const lastOf = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

/**
 * La parte de la coreografía que necesita el tamaño y las proyecciones (dd.md §11.2.3): mueve la cámara y
 * da por terminado el revelado. Lee del reducer (`engine.machine`) QUÉ toca hacer y le devuelve QUÉ pasó
 * (`FLIGHT_END`, `REVEAL_END`).
 *
 *  - **Bajar / lateral:** vuela a `R`, la afín que separa la proyección del nivel actual de la del destino
 *    (`relativeTransform`). Así, al acabar el vuelo, cambiar de proyección con cámara identidad pinta los
 *    mismos píxeles y el rebase es invisible. NO pasa por `constrain`: tiene que acabar exactamente en `R`.
 *  - **Subir / vuelta atrás:** vuela a la cámara que había antes de bajar (o al encaje).
 *  - **Sin zoom** (`zoom={false}`) o sin encuadre posible: no hay vuelo, la fase pasa de golpe.
 */
export const useDrillChoreography = <TDatum>({
  engine,
  store,
  shownChain,
  chainFor,
}: UseDrillChoreographyParams<TDatum>): void => {
  const { active, machine, dispatch } = engine;

  // Lo que cambia en cada render pero no debe relanzar el vuelo se lee al usarlo.
  const latest = useRef({ engine, shownChain, chainFor });
  useEffect(() => {
    latest.current = { engine, shownChain, chainFor };
  });

  const flying = machine.phase === "flying";
  const flightId = machine.flightId;
  useEffect(() => {
    if (!active || !flying) return;
    const { engine: current, shownChain: shown, chainFor: build } = latest.current;
    const state = current.machine;
    const finish = (completed: boolean) =>
      dispatch({ type: "FLIGHT_END", id: flightId, completed });

    let destination: CameraTransform | null;
    if (state.direction === "up") {
      // Subir (o deshacer una bajada): a la cámara que había antes de bajar.
      destination = state.returnCamera ?? savedCameraFor(state, state.path) ?? FIT_TRANSFORM;
    } else {
      // Bajar / lateral: a `R`, en el espacio del nivel que se está viendo.
      const levels = current.chainLevelsFor(state.path);
      const next = levels === null ? null : build(levels, state.path);
      const from = lastOf(shown?.projections ?? []);
      const to = lastOf(next?.projections ?? []);
      destination =
        from === undefined || to === undefined || next?.missing != null
          ? null
          : relativeTransform(from, to);
    }

    const api = store.getZoom();
    if (api === null || destination === null) {
      finish(true); // sin zoom o sin encuadre posible: no hay vuelo
      return;
    }
    const flight = { cancelled: false };
    void api.flyTo(destination).then(({ completed }) => {
      // Si el vuelo se redirigió, este `FLIGHT_END` lleva un id viejo y el reducer lo ignora.
      if (!flight.cancelled) finish(completed);
    });
    return () => {
      flight.cancelled = true;
    };
  }, [active, flying, flightId, store, dispatch]);

  // El revelado dura lo que dura la animación CSS; después los niveles que salían desaparecen.
  const revealing = machine.phase === "revealing";
  useEffect(() => {
    if (!active || !revealing) return;
    const timer = setTimeout(
      () => dispatch({ type: "REVEAL_END" }),
      prefersReducedMotion() ? 0 : REVEAL_MS,
    );
    return () => clearTimeout(timer);
  }, [active, revealing, dispatch]);
};
