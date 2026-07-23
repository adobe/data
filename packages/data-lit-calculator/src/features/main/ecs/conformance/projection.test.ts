// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Guards the projection itself. `fromState` and `toState` are the bridge every
// transaction conformance test trusts; a symmetric bug in the pair (e.g. both
// dropping the same field) would cancel out and mask a real ecs defect. This
// identity test — `toState(fromState(s)) ≡ s` over representative states —
// proves the projection round-trips faithfully on its own.
import { describe, it } from "vitest";
import type { State } from "../../data/state/state.js";
import { expectStateMatches } from "../../data/state/expect-state-matches.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

const states: readonly { readonly name: string; readonly state: State }[] = [
  {
    name: "the initial state (fresh entry, nothing armed)",
    state: { accumulator: 0, entry: "0", operation: null, overwrite: true, error: false },
  },
  {
    name: "a mid-entry running calculation with an operation armed",
    state: { accumulator: 12, entry: "34", operation: "add", overwrite: false, error: false },
  },
  {
    name: "a latched error",
    state: { accumulator: 6, entry: "0", operation: null, overwrite: false, error: true },
  },
  {
    name: "a committed result ready for chaining",
    state: { accumulator: 15, entry: "15", operation: null, overwrite: true, error: false },
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
