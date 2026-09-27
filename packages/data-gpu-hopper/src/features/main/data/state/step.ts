// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Hazard } from "../hazard/hazard.js";
import { LaneKind } from "../lane-kind/lane-kind.js";
import { Outcome } from "../outcome/outcome.js";
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";
import { laneAt } from "./lane-at.js";
import { frogOutcome } from "./frog-outcome.js";
import { winGoal } from "./win-goal.js";
import { loseLife } from "./lose-life.js";

// The slice `step` writes. Every branch supplies all five keys; a composer layers
// the outcome sub-patch (`winGoal` / `loseLife`) over the movement fields.
type StepPatch = Pick<State, "entities" | "frog" | "score" | "status" | "lives">;

// Advance the simulation by `dt` seconds: scroll the hazards, carry the frog if
// it is riding a log, then resolve its fate — score a win, or on a fatal outcome
// spend a life and respawn (or end the game once the last life is gone). A no-op
// once the game has ended, keeping it idempotent.
export const step = (
  state: Pick<State, "entities" | "frog" | "lanes" | "width" | "status" | "score" | "lives">,
  { dt }: { readonly dt: number },
): StepPatch => {
  if (!GameStatus.isPlaying(state.status)) {
    return {
      entities: state.entities,
      frog: state.frog,
      score: state.score,
      status: state.status,
      lives: state.lives,
    };
  }

  // Advance every hazard, preserving its identity (the map key). Values are id-less.
  const entities = new Map(
    [...state.entities].map(([id, hazard]) => [id, Hazard.advance(hazard, dt, state.width)] as const),
  );
  const lane = laneAt(state, state.frog.y);

  // Ride a log: on a carrying lane, the log the frog is standing on drags it
  // along at the log's velocity. Determined from the pre-scroll positions — the
  // log the frog was actually on this frame.
  const carrier =
    lane && LaneKind.coveredOutcome[lane.kind] === "ride"
      ? [...state.entities.values()].find(
          (hazard) => hazard.lane === state.frog.y && Hazard.covers(hazard, state.frog.x),
        )
      : undefined;
  const frog = carrier
    ? { x: state.frog.x + carrier.velocity * dt, y: state.frog.y }
    : state.frog;

  // The moved world (full read slice + updated entities/frog), fed to the outcome
  // derivation and the winGoal / loseLife sub-transitions.
  const moved = { ...state, entities, frog };
  // The movement-only patch the outcome sub-patch layers over.
  const movedPatch: StepPatch = {
    entities,
    frog,
    score: state.score,
    status: state.status,
    lives: state.lives,
  };
  const outcome = frogOutcome(moved);

  if (outcome === "win") return { ...movedPatch, ...winGoal(moved) };
  if (Outcome.isFatal[outcome]) return { ...movedPatch, ...loseLife(moved) };
  return movedPatch;
};
