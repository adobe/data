// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Hazard } from "../hazard/hazard.js";
import { LaneKind } from "../lane-kind/lane-kind.js";
import { Outcome } from "../outcome/outcome.js";
import { GameStatus } from "../game-status/game-status.js";
import type { Lane } from "../lane/lane.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
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

// Two 5-wide, 3-tall boards differing only in the middle lane's terrain.
const roadLanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "road" },
  { row: 2, kind: "goal" },
];
const riverLanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "river" },
  { row: 2, kind: "goal" },
];

// Spec-owned cases (args is dt), shared with the ecs tick (the system loop conforms
// to this — see systems.md). Every step here uses dt = 1 so hazard/carry
// displacements are exact. Covers: hazards scrolling while the frog stays safe, a
// car hit (life lost + respawn), the final-life game over, drowning over open
// water, riding a log, being carried off the board edge (with a wrapping log),
// reaching the goal, and the game-over no-op.
export const cases: Conformance<typeof step> = [
  { name: "scrolls hazards while the frog rests on grass",
    before: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }],
      frog: { x: 2, y: 0 }, lives: 3, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }],
      frog: { x: 2, y: 0 }, lives: 3, score: 0, status: "playing" } },
  { name: "a car reaching the frog costs a life and respawns it",
    before: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }],
      frog: { x: 1, y: 1 }, lives: 3, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }],
      frog: { x: 2, y: 0 }, lives: 2, score: 0, status: "playing" } },
  { name: "a car hit on the last life ends the game",
    before: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }],
      frog: { x: 1, y: 1 }, lives: 1, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }],
      frog: { x: 1, y: 1 }, lives: 0, score: 0, status: "gameOver" } },
  { name: "open water with no log under the frog drowns it",
    before: { width: 5, height: 3, lanes: riverLanes,
      hazards: [{ kind: "log", lane: 1, x: 3, width: 1, velocity: 0 }],
      frog: { x: 1, y: 1 }, lives: 3, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: riverLanes,
      hazards: [{ kind: "log", lane: 1, x: 3, width: 1, velocity: 0 }],
      frog: { x: 2, y: 0 }, lives: 2, score: 0, status: "playing" } },
  { name: "a log carries the frog along and keeps it safe",
    before: { width: 5, height: 3, lanes: riverLanes,
      hazards: [{ kind: "log", lane: 1, x: 0, width: 3, velocity: 1 }],
      frog: { x: 1, y: 1 }, lives: 3, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: riverLanes,
      hazards: [{ kind: "log", lane: 1, x: 1, width: 3, velocity: 1 }],
      frog: { x: 2, y: 1 }, lives: 3, score: 0, status: "playing" } },
  { name: "a log carrying the frog past the edge drowns it",
    before: { width: 5, height: 3, lanes: riverLanes,
      hazards: [{ kind: "log", lane: 1, x: 3, width: 2, velocity: 2 }],
      frog: { x: 4, y: 1 }, lives: 3, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: riverLanes,
      hazards: [{ kind: "log", lane: 1, x: 0, width: 2, velocity: 2 }],
      frog: { x: 2, y: 0 }, lives: 2, score: 0, status: "playing" } },
  { name: "reaching the goal scores and wins",
    before: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }],
      frog: { x: 2, y: 2 }, lives: 3, score: 0, status: "playing" },
    args: 1,
    after: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }],
      frog: { x: 2, y: 2 }, lives: 3, score: 1, status: "won" } },
  { name: "does nothing once the game is over",
    before: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }],
      frog: { x: 2, y: 0 }, lives: 0, score: 0, status: "gameOver" },
    args: 1,
    after: { width: 5, height: 3, lanes: roadLanes,
      hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }],
      frog: { x: 2, y: 0 }, lives: 0, score: 0, status: "gameOver" } },
];
