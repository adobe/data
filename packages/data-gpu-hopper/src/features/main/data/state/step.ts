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

// Advance the simulation by `dt` seconds: scroll the hazards, carry the frog if
// it is riding a log, then resolve its fate — score a win, or on a fatal outcome
// spend a life and respawn (or end the game once the last life is gone). A no-op
// once the game has ended, keeping it idempotent.
export const step = (state: State, dt: number): State => {
  if (!GameStatus.isPlaying(state.status)) return state;

  const hazards = state.hazards.map((hazard) => Hazard.advance(hazard, dt, state.width));
  const lane = laneAt(state, state.frog.y);

  // Ride a log: on a carrying lane, the log the frog is standing on drags it
  // along at the log's velocity. Determined from the pre-scroll positions — the
  // log the frog was actually on this frame.
  const carrier =
    lane && LaneKind.coveredOutcome[lane.kind] === "ride"
      ? state.hazards.find(
          (hazard) => hazard.lane === state.frog.y && Hazard.covers(hazard, state.frog.x),
        )
      : undefined;
  const frog = carrier
    ? { x: state.frog.x + carrier.velocity * dt, y: state.frog.y }
    : state.frog;

  const moved: State = { ...state, hazards, frog };
  const outcome = frogOutcome(moved);

  if (outcome === "win") return winGoal(moved);
  if (Outcome.isFatal[outcome]) return loseLife(moved);
  return moved;
};
