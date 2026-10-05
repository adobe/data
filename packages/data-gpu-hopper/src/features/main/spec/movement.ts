// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Lane } from "../data/values/lane/lane.js";
import { LaneKind } from "../data/values/lane-kind/lane-kind.js";
import type { State } from "./state.js";
import { whilePlaying } from "./while-playing.js";

// The `movement` system: scroll every hazard by `dt` and carry the frog on the log it
// rides, found from the pre-scroll positions.
export const movement = (
  state: Pick<State, "entities" | "frog" | "lanes" | "boardWidth" | "status">,
  { dt }: { readonly dt: number },
): Pick<State, "entities" | "frog"> =>
  whilePlaying(state.status, { entities: state.entities, frog: state.frog }, () => {
    const lane = Lane.at(state.lanes, state.frog.y);
    const carrier =
      lane && LaneKind.coveredOutcome[lane.kind] === "ride"
        ? [...state.entities.values()].find(
            (hazard) => hazard.lane === state.frog.y && Lane.coversAt(hazard.x, hazard.width, state.frog.x),
          )
        : undefined;
    const entities = new Map(
      [...state.entities].map(
        ([id, hazard]) => [id, { ...hazard, x: Lane.nextX(hazard.x, hazard.velocity, dt, state.boardWidth) }] as const,
      ),
    );
    const frog = carrier ? { x: state.frog.x + carrier.velocity * dt, y: state.frog.y } : state.frog;
    return { entities, frog };
  });
