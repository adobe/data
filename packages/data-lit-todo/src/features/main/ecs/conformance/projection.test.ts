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
    name: "a mixed list of complete and incomplete todos, completed view on",
    state: {
      todos: [
        { id: 1, name: "buy milk", complete: false },
        { id: 2, name: "walk dog", complete: true },
        { id: 3, name: "write tests", complete: false },
      ],
      displayCompleted: true,
    },
  },
  {
    name: "an empty list with the completed view off",
    state: { todos: [], displayCompleted: false },
  },
  {
    name: "todos sharing a name (multiset round-trip), completed view off",
    state: {
      todos: [
        { id: 1, name: "task", complete: false },
        { id: 2, name: "task", complete: false },
        { id: 3, name: "task", complete: true },
      ],
      displayCompleted: false,
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
