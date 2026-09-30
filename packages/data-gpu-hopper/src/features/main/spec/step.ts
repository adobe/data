// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Lane } from "../data/values/lane/lane.js";
import { LaneKind } from "../data/values/lane-kind/lane-kind.js";
import { Outcome } from "../data/values/outcome/outcome.js";
import { GameStatus } from "../data/values/game-status/game-status.js";
import type { State } from "./state.js";
import { frogOutcome } from "./frog-outcome.js";
import { winGoal } from "./win-goal.js";
import { loseLife } from "./lose-life.js";

// The slice `step` writes. Every branch supplies all five keys; the outcome sub-patch
// (`winGoal` / `loseLife`) layers over the movement fields.
type StepPatch = Pick<State, "entities" | "frog" | "score" | "status" | "lives">;

// Advance the simulation by `dt` seconds: scroll the hazards, carry the frog if it is
// riding a log, then resolve its fate — score a win, or on a fatal outcome spend a life
// and respawn (or end the game on the last life). A no-op once the game has ended.
export const step = (
  state: Pick<State, "entities" | "frog" | "lanes" | "width" | "status" | "score" | "lives">,
  { dt }: { readonly dt: number },
): StepPatch => {
  const unchanged: StepPatch = {
    entities: state.entities,
    frog: state.frog,
    score: state.score,
    status: state.status,
    lives: state.lives,
  };
  if (!GameStatus.isPlaying(state.status)) return unchanged;

  const entities = new Map(
    [...state.entities].map(
      ([id, hazard]) => [id, { ...hazard, x: Lane.nextX(hazard.x, hazard.velocity, dt, state.width) }] as const,
    ),
  );

  // The log the frog stands on, from the pre-scroll positions, drags it along.
  const lane = Lane.at(state.lanes, state.frog.y);
  const carrier =
    lane && LaneKind.coveredOutcome[lane.kind] === "ride"
      ? [...state.entities.values()].find(
          (hazard) => hazard.lane === state.frog.y && Lane.coversAt(hazard.x, hazard.width, state.frog.x),
        )
      : undefined;
  const frog = carrier ? { x: state.frog.x + carrier.velocity * dt, y: state.frog.y } : state.frog;

  const moved = { ...state, entities, frog };
  const movedPatch: StepPatch = { ...unchanged, entities, frog };
  const outcome = frogOutcome(moved);

  if (outcome === "win") return { ...movedPatch, ...winGoal(moved) };
  if (Outcome.isFatal[outcome]) return { ...movedPatch, ...loseLife(moved) };
  return movedPatch;
};
