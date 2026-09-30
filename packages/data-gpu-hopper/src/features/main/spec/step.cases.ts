// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { Lane } from "../data/values/lane/lane.js";
import type { State } from "./state.js";
import type { step } from "./step.js";

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

// Every case uses dt = 1 so hazard and carry displacements are exact. `before`
// overrides the default with a small test board; `after` is the writes patch.
// Covers: hazards scrolling while the frog stays safe, a car hit (life lost +
// respawn), the final-life game over, drowning over open water, riding a log, being
// carried off the board edge (with a wrapping log), reaching the goal, and the
// game-over no-op.
export const cases: Conformance.SpecCases<State, typeof step> = {
  cases: [
    { name: "scrolls hazards while the frog rests on grass",
      before: { width: 5, height: 3, lanes: roadLanes,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 0 }, lives: 3, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 0 }, lives: 3, score: 0, status: "playing" } },
    { name: "a car reaching the frog costs a life and respawns it",
      before: { width: 5, height: 3, lanes: roadLanes,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]),
        frog: { x: 1, y: 1 }, lives: 3, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 0 }, lives: 2, score: 0, status: "playing" } },
    { name: "a car hit on the last life ends the game",
      before: { width: 5, height: 3, lanes: roadLanes,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]),
        frog: { x: 1, y: 1 }, lives: 1, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        frog: { x: 1, y: 1 }, lives: 0, score: 0, status: "gameOver" } },
    { name: "open water with no log under the frog drowns it",
      before: { width: 5, height: 3, lanes: riverLanes,
        entities: new Map([[1, { kind: "log", lane: 1, x: 3, width: 1, velocity: 0 }]]),
        frog: { x: 1, y: 1 }, lives: 3, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 3, width: 1, velocity: 0 }]]),
        frog: { x: 2, y: 0 }, lives: 2, score: 0, status: "playing" } },
    { name: "a log carries the frog along and keeps it safe",
      before: { width: 5, height: 3, lanes: riverLanes,
        entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 3, velocity: 1 }]]),
        frog: { x: 1, y: 1 }, lives: 3, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 1, width: 3, velocity: 1 }]]),
        frog: { x: 2, y: 1 }, lives: 3, score: 0, status: "playing" } },
    { name: "a log carrying the frog past the edge drowns it",
      before: { width: 5, height: 3, lanes: riverLanes,
        entities: new Map([[1, { kind: "log", lane: 1, x: 3, width: 2, velocity: 2 }]]),
        frog: { x: 4, y: 1 }, lives: 3, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 2, velocity: 2 }]]),
        frog: { x: 2, y: 0 }, lives: 2, score: 0, status: "playing" } },
    { name: "reaching the goal scores and wins",
      before: { width: 5, height: 3, lanes: roadLanes,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 2 }, lives: 3, score: 0, status: "playing" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 2 }, lives: 3, score: 1, status: "won" } },
    { name: "does nothing once the game is over",
      before: { width: 5, height: 3, lanes: roadLanes,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 0 }, lives: 0, score: 0, status: "gameOver" },
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 0 }, lives: 0, score: 0, status: "gameOver" } },
  ],
};
