// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the projection itself. `fromState` and `toState` are the bridge every
// transaction conformance test trusts; a symmetric bug in the pair (e.g. both
// dropping the same field) would cancel out and mask a real ecs defect. This
// identity test — `toState(fromState(s)) ≡ s` over representative states —
// proves the projection round-trips faithfully on its own.
import { describe, it } from "vitest";
import { State } from "../../data/state/state.js";
import type { State as StateType } from "../../data/state/state.js";
import { expectStateMatches } from "../../data/state/expect-state-matches.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const states: readonly { readonly name: string; readonly state: StateType }[] = [
  { name: "the initial game", state: State.create() },
  {
    name: "a mid-run state with a carried frog and depleted lives",
    state: {
      width: 5,
      height: 3,
      lanes: [
        { row: 0, kind: "grass" },
        { row: 1, kind: "river" },
        { row: 2, kind: "goal" },
      ],
      hazards: [
        { kind: "log", lane: 1, x: 1.5, width: 3, velocity: 1 },
        { kind: "log", lane: 1, x: 4, width: 2, velocity: 1 },
      ],
      frog: { x: 2.5, y: 1 },
      lives: 1,
      score: 4,
      status: "playing",
    },
  },
  {
    name: "an empty board with no hazards",
    state: {
      width: 4,
      height: 2,
      lanes: [
        { row: 0, kind: "grass" },
        { row: 1, kind: "goal" },
      ],
      hazards: [],
      frog: { x: 1, y: 0 },
      lives: 3,
      score: 0,
      status: "playing",
    },
  },
];

describe("ecs/conformance projection round-trips (toState ∘ fromState ≡ identity)", () => {
  for (const { name, state } of states) {
    it(name, () => {
      const store = createStore();
      fromState(store, state);
      expectStateMatches(toState(store), state);
    });
  }
});
