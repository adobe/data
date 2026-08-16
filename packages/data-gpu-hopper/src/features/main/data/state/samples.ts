// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import { create } from "./create.js";

// The projection round-trip (toState ∘ fromState ≡ identity) compares a sample
// against the store the ecs re-materialises, which mints its own entity ids —
// `Match.refMap` keys each id-less hazard with a distinct open matcher so the keys
// don't pin the ecs to specific ids (see conformance.md).
const initial = create();

// Representative full states for the projection round-trip. The initial game, a
// mid-run state with a fractional log-carried frog and depleted lives, and a
// minimal empty board — together exercising the whole ecs↔State map (resources,
// the frog entity, and the hazard entities).
export const samples: readonly State[] = [
  { ...initial, entities: Match.refMap(initial.entities.values()) },
  {
    width: 5,
    height: 3,
    lanes: [
      { row: 0, kind: "grass" },
      { row: 1, kind: "river" },
      { row: 2, kind: "goal" },
    ],
    entities: Match.refMap([
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
    entities: Match.refMap([]),
    frog: { x: 1, y: 0 },
    lives: 3,
    score: 0,
    status: "playing",
  },
];
