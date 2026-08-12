// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { create } from "./create.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). The initial game, a mid-run state with a fractional log-carried frog
// and depleted lives, and a minimal empty board — together exercising the whole
// ecs↔State map (resources, the frog entity, and the hazard bag).
export const samples: readonly State[] = [
  create(),
  {
    width: 5,
    height: 3,
    lanes: [
      { row: 0, kind: "grass" },
      { row: 1, kind: "river" },
      { row: 2, kind: "goal" },
    ],
    hazards: new Set([
      { kind: "log", lane: 1, x: 1.5, width: 3, velocity: 1 },
      { kind: "log", lane: 1, x: 4, width: 2, velocity: 1 },
    ]),
    frog: { x: 2.5, y: 1 },
    lives: 1,
    score: 4,
    status: "playing",
  },
  {
    width: 4,
    height: 2,
    lanes: [
      { row: 0, kind: "grass" },
      { row: 1, kind: "goal" },
    ],
    hazards: new Set(),
    frog: { x: 1, y: 0 },
    lives: 3,
    score: 0,
    status: "playing",
  },
];
