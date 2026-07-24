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
    name: "a full board with non-zero counters",
    state: { board: "XOXXOOOXX", firstPlayer: "O", xWins: 3, oWins: 2, draws: 1 },
  },
  {
    name: "an empty board (just the resources)",
    state: { board: "         ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
  },
  {
    name: "a game in progress",
    state: { board: "X O X    ", firstPlayer: "O", xWins: 1, oWins: 0, draws: 0 },
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
