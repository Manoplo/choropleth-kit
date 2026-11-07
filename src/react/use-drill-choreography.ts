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
 * Duration of the reveal (dd.md §11.2.3): 200 ms of fade + up to 250 ms of staggering by distance from
 * the click point. With "reduce motion" it is 0: the new level appears without animating.
 */
export const REVEAL_MS = 450;

export type UseDrillChoreographyParams<TDatum> = {
  engine: DrillEngine<TDatum>;
  store: MapStore;
  /** The projection chain of what is shown (or `null` if there is none yet). */
  shownChain: ProjectionChain | null;
  /** Builds a route's chain with the current size, padding and framings. */
  chainFor: (levels: ChainLevel[], path: readonly string[]) => ProjectionChain;
};

const lastOf = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

/**
 * The part of the choreography that needs the size and the projections (dd.md §11.2.3): it moves the
 * camera and marks the reveal as done. It reads from the reducer (`engine.machine`) WHAT to do and
 * reports back WHAT happened (`FLIGHT_END`, `REVEAL_END`).
 *
 *  - **Down / lateral:** flies to `R`, the affine map separating the current level's projection from
 *    the target's (`relativeTransform`). That way, when the flight ends, switching projection with an
 *    identity camera paints the same pixels and the rebase is invisible. It does NOT go through
 *    `constrain`: it has to end exactly at `R`.
 *  - **Up / backing out:** flies to the camera that existed before going down (or to the fit).
 *  - **No zoom** (`zoom={false}`) or no possible framing: there is no flight, the phase passes at once.
 */
export const useDrillChoreography = <TDatum>({
  engine,
  store,
  shownChain,
  chainFor,
}: UseDrillChoreographyParams<TDatum>): void => {
  const { active, machine, dispatch } = engine;

  // What changes on every render but must not relaunch the flight is read at the time of use.
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
      // Going up (or undoing a descent): to the camera that existed before going down.
      destination = state.returnCamera ?? savedCameraFor(state, state.path) ?? FIT_TRANSFORM;
    } else {
      // Down / lateral: to `R`, in the space of the level being viewed.
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
      finish(true); // no zoom or no possible framing: there is no flight
      return;
    }
    const flight = { cancelled: false };
    void api.flyTo(destination).then(({ completed }) => {
      // If the flight was redirected, this `FLIGHT_END` carries an old id and the reducer ignores it.
      if (!flight.cancelled) finish(completed);
    });
    return () => {
      flight.cancelled = true;
    };
  }, [active, flying, flightId, store, dispatch]);

  // The reveal lasts as long as the CSS animation; afterwards the leaving levels disappear.
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
